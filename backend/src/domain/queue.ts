import type { Config } from "../config.ts";
import type { GitCommitResult } from "./git.ts";
import type { AppLogger } from "../lib/telemetry.ts";
import type {
  AcceptedSubmission,
  DebugStateResponse,
  JobRecord,
  SubmissionRecord,
  SubmissionStatusResponse,
} from "../types/submissions.ts";
import { AppError, errorCodes, toError } from "../lib/errors.ts";
import { jobStatuses } from "../types/submissions.ts";
import {
  buildMaintainerContext,
  createRawSourcePath,
  createVaultToolset,
  readVaultSnapshot,
  restoreVaultFromSnapshot,
  writeRawSourceFile,
} from "./vault.ts";

export type QueueProcessorDependencies = {
  commitAndPushVaultChanges: (submissionId: string) => Promise<GitCommitResult>;
  config: Config;
  getVaultGitStatus: () => Promise<string>;
  logger: AppLogger;
  runMaintainer: (input: {
    capturedAt?: string;
    rawSourcePath: string;
    sourceApp?: string;
    submissionId: string;
    vaultContext: string;
  }) => Promise<{ filesChanged: string[]; summary: string }>;
  verifyPostEditVaultHealth: (changedFiles: string[]) => Promise<void>;
  vaultRepoPath: string;
};

export type EnqueueResult = {
  status: "accepted" | "completed";
  statusCode: 200 | 202;
  submissionId: string;
};

export type SubmissionQueueService = {
  enqueue: (submission: AcceptedSubmission) => Promise<EnqueueResult>;
  getDebugState: () => Promise<DebugStateResponse>;
  getSubmissionStatus: (submissionId: string) => SubmissionStatusResponse | undefined;
  shutdown: () => Promise<void>;
};

export const createSubmissionQueueService = (
  dependencies: QueueProcessorDependencies,
): SubmissionQueueService => {
  const queue: string[] = [];
  const submissions = new Map<string, SubmissionRecord>();
  const jobs = new Map<string, JobRecord>();
  let workerPromise: Promise<void> | undefined;
  let acceptingNewSubmissions = true;
  let currentSubmissionId: string | undefined;
  let blockedReason: string | undefined;
  let lastCommitSha: string | undefined;

  const blockProcessing = (reason: string): void => {
    blockedReason = reason;
  };

  const getSubmissionStatus = (submissionId: string): SubmissionStatusResponse | undefined => {
    const submission = submissions.get(submissionId);
    const job = jobs.get(submissionId);

    if (!submission || !job) {
      return undefined;
    }

    return {
      ...(job.completedAt ? { completedAt: job.completedAt } : {}),
      ...(job.error ? { error: job.error } : {}),
      ...(job.gitCommitSha ? { gitCommitSha: job.gitCommitSha } : {}),
      receivedAt: submission.receivedAt,
      ...(job.startedAt ? { startedAt: job.startedAt } : {}),
      status: job.status,
      submissionId,
    };
  };

  const ensureWorkerRunning = (): void => {
    if (workerPromise || blockedReason || !acceptingNewSubmissions) {
      return;
    }

    workerPromise = processQueue().finally(() => {
      workerPromise = undefined;

      if (queue.length > 0 && acceptingNewSubmissions && !blockedReason) {
        ensureWorkerRunning();
      }
    });
  };

  const processQueue = async (): Promise<void> => {
    while (acceptingNewSubmissions && !blockedReason) {
      const nextSubmissionId = queue.shift();

      if (!nextSubmissionId) {
        return;
      }

      const submission = submissions.get(nextSubmissionId);
      const job = jobs.get(nextSubmissionId);

      if (!submission || !job) {
        continue;
      }

      currentSubmissionId = nextSubmissionId;
      job.status = jobStatuses.processing;
      job.startedAt = new Date().toISOString();
      delete job.error;

      try {
        await processSubmission(submission);
        job.status = jobStatuses.completed;
        job.completedAt = new Date().toISOString();
      } catch (error) {
        const appError = toError(error);
        job.status = jobStatuses.failed;
        job.error = appError.message;
        job.completedAt = new Date().toISOString();

        dependencies.logger.error({
          body: "Submission processing failed.",
          attributes: {
            errorMessage: appError.message,
            submissionId: nextSubmissionId,
            ...(appError instanceof AppError && appError.details
              ? { errorDetails: JSON.stringify(appError.details) }
              : {}),
          },
        });

        if (appError instanceof AppError && appError.code === errorCodes.git) {
          blockProcessing(appError.message);
        }
      } finally {
        currentSubmissionId = undefined;
      }
    }
  };

  const processSubmission = async (submission: SubmissionRecord): Promise<void> => {
    const rawSourcePath = createRawSourcePath(submission.submissionId, submission.receivedAt);
    await writeRawSourceFile(dependencies.vaultRepoPath, rawSourcePath, submission.payloadText);

    const snapshotBeforeMaintainer = await readVaultSnapshot(dependencies.vaultRepoPath);
    const vaultContext = await buildMaintainerContext(dependencies.vaultRepoPath, {
      ...(submission.capturedAt ? { capturedAt: submission.capturedAt } : {}),
      rawSourcePath,
      ...(submission.sourceApp ? { sourceApp: submission.sourceApp } : {}),
      submissionId: submission.submissionId,
    });
    const toolset = createVaultToolset(dependencies.vaultRepoPath, dependencies.logger);

    const maintainerResult = await (async () => {
      try {
        return await dependencies.runMaintainer({
          ...(submission.capturedAt ? { capturedAt: submission.capturedAt } : {}),
          rawSourcePath,
          ...(submission.sourceApp ? { sourceApp: submission.sourceApp } : {}),
          submissionId: submission.submissionId,
          vaultContext,
        });
      } catch (error) {
        await restoreVaultFromSnapshot(dependencies.vaultRepoPath, snapshotBeforeMaintainer);
        throw error;
      }
    })();

    const changedFiles = [...new Set([rawSourcePath, ...maintainerResult.filesChanged])];

    try {
      await dependencies.verifyPostEditVaultHealth(changedFiles);
    } catch (error) {
      await restoreVaultFromSnapshot(dependencies.vaultRepoPath, snapshotBeforeMaintainer);
      throw error;
    }

    const gitResult = await dependencies.commitAndPushVaultChanges(submission.submissionId);
    lastCommitSha = gitResult.commitSha;

    const job = jobs.get(submission.submissionId);

    if (job) {
      job.gitCommitSha = gitResult.commitSha;
    }
  };

  return {
    enqueue: (submission) => {
      if (!acceptingNewSubmissions) {
        throw new AppError({
          code: errorCodes.shutdown,
          message: "Service is shutting down and not accepting new submissions.",
          statusCode: 503,
        });
      }

      if (blockedReason) {
        throw new AppError({
          code: errorCodes.git,
          message: `Processing is blocked: ${blockedReason}`,
          statusCode: 503,
        });
      }

      const existingSubmission = submissions.get(submission.submissionId);
      const existingJob = jobs.get(submission.submissionId);

      if (existingSubmission && existingJob) {
        const samePayload =
          existingSubmission.payloadSha256 === submission.payloadSha256 &&
          existingSubmission.payloadText === submission.payloadText &&
          existingSubmission.capturedAt === submission.capturedAt &&
          existingSubmission.sourceApp === submission.sourceApp;

        if (!samePayload) {
          throw new AppError({
            code: errorCodes.conflict,
            message: "Submission ID already exists with a different payload.",
            statusCode: 409,
          });
        }

        if (existingJob.status === jobStatuses.completed) {
          return Promise.resolve({
            status: "completed",
            statusCode: 200,
            submissionId: submission.submissionId,
          });
        }

        if (existingJob.status === jobStatuses.failed) {
          throw new AppError({
            code: errorCodes.conflict,
            message: "Submission ID already exists and previously failed.",
            statusCode: 409,
          });
        }

        return Promise.resolve({
          status: "accepted",
          statusCode: 202,
          submissionId: submission.submissionId,
        });
      }

      submissions.set(submission.submissionId, {
        ...(submission.capturedAt ? { capturedAt: submission.capturedAt } : {}),
        payloadSha256: submission.payloadSha256,
        payloadText: submission.payloadText,
        receivedAt: submission.receivedAt,
        ...(submission.sourceApp ? { sourceApp: submission.sourceApp } : {}),
        submissionId: submission.submissionId,
      });
      jobs.set(submission.submissionId, {
        status: jobStatuses.queued,
        submissionId: submission.submissionId,
      });
      queue.push(submission.submissionId);
      ensureWorkerRunning();

      dependencies.logger.info({
        body: "Submission accepted and queued.",
        attributes: {
          queueDepth: queue.length,
          submissionId: submission.submissionId,
        },
      });

      return Promise.resolve({
        status: "accepted",
        statusCode: 202,
        submissionId: submission.submissionId,
      });
    },
    getDebugState: async () => {
      const failedSubmissionIds = [...jobs.values()]
        .filter((job) => job.status === jobStatuses.failed)
        .map((job) => job.submissionId);

      return {
        acceptingNewSubmissions,
        ...(blockedReason ? { blockedReason } : {}),
        ...(currentSubmissionId ? { currentSubmissionId } : {}),
        failedSubmissionIds,
        ...(lastCommitSha ? { lastCommitSha } : {}),
        queue: [...queue],
        vaultGitStatus: await dependencies.getVaultGitStatus(),
      };
    },
    getSubmissionStatus,
    shutdown: async () => {
      acceptingNewSubmissions = false;
      await workerPromise;
    },
  };
};
