import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";
import { loadConfigFromProcessEnv } from "./config.ts";
import { commitAndPushVaultChanges, getVaultGitStatus, verifyVaultGitRepo } from "./domain/git.ts";
import { analyzeImageSubmission } from "./domain/image-analysis.ts";
import { createKnowledgeService } from "./domain/knowledge.ts";
import { createOpenAiClient, runMaintainerAgent } from "./domain/llm-maintainer.ts";
import { createSubmissionQueueService } from "./domain/queue.ts";
import { assertVaultHealth, createVaultToolset, ensureVaultScaffold } from "./domain/vault.ts";
import { toError } from "./lib/errors.ts";
import { createTelemetry } from "./lib/telemetry.ts";

const main = async (): Promise<void> => {
  const config = loadConfigFromProcessEnv();
  const telemetry = createTelemetry(config);
  const logger = telemetry.logger;
  const openAiClient = createOpenAiClient(config);

  await verifyVaultGitRepo(config.vaultRepoPath, config.gitBranch, config.gitRemote);
  await ensureVaultScaffold(config.vaultRepoPath, config.gitRemote, config.gitBranch, logger);
  const knowledgeService = createKnowledgeService(config.vaultRepoPath);

  const queueService = createSubmissionQueueService({
    commitAndPushVaultChanges: async (submissionId) =>
      commitAndPushVaultChanges(
        config.vaultRepoPath,
        config.gitRemote,
        config.gitBranch,
        submissionId,
        logger,
      ),
    config,
    getVaultGitStatus: async () => getVaultGitStatus(config.vaultRepoPath),
    logger,
    runImageAnalysis: async (submission) =>
      analyzeImageSubmission({
        client: openAiClient,
        config,
        logger,
        submission,
      }),
    runMaintainer: async (input) => {
      const toolset = createVaultToolset(config.vaultRepoPath, logger);

      return runMaintainerAgent({
        client: openAiClient,
        config,
        input,
        logger,
        toolset,
        vaultContext: input.vaultContext,
      });
    },
    verifyPostEditVaultHealth: async (changedFiles) =>
      assertVaultHealth(config.vaultRepoPath, changedFiles),
    vaultRepoPath: config.vaultRepoPath,
  });

  const app = createApp({ config, knowledgeService, logger, queueService });
  const server = serve({
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
  });

  logger.info({
    body: "Backend server started.",
    attributes: { host: config.host, port: config.port },
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ body: "Shutdown requested.", attributes: { signal } });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await queueService.shutdown();
    await telemetry.shutdown();
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(signal).catch((error: unknown) => {
        logger.error({
          body: "Shutdown failed.",
          attributes: { errorMessage: toError(error).message },
        });
        process.exitCode = 1;
      });
    });
  }

  process.on("uncaughtException", (error) => {
    logger.error({
      body: "Uncaught exception.",
      attributes: { errorMessage: toError(error).message },
    });
    process.exitCode = 1;
    server.close();
    void telemetry.shutdown();
  });

  process.on("unhandledRejection", (error) => {
    logger.error({
      body: "Unhandled promise rejection.",
      attributes: { errorMessage: toError(error).message },
    });
    process.exitCode = 1;
    server.close();
    void telemetry.shutdown();
  });
};

void main();
