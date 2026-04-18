import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AppLogger } from "../lib/telemetry.ts";
import { AppError, errorCodes, toError } from "../lib/errors.ts";
import { fileExists } from "../lib/fs.ts";

export type GitPreflightResult = {
  branch: string;
  remote: string;
};

export type GitCommitResult = {
  commitSha: string;
  diff: string;
  changedFiles: string[];
};

const trimTrailingNewline = (value: string): string => value.trim();
const execFileAsync = promisify(execFile);

const runGit = async (vaultRepoPath: string, arguments_: string[]): Promise<string> => {
  try {
    const processResult = await execFileAsync("git", arguments_, { cwd: vaultRepoPath });
    return processResult.stdout;
  } catch (error) {
    const normalizedError = toError(error);
    throw new AppError({
      code: errorCodes.git,
      message: "Git command failed.",
      statusCode: 500,
      cause: error,
      details: {
        arguments: arguments_.join(" "),
        errorMessage: normalizedError.message,
        vaultRepoPath,
      },
    });
  }
};

const parsePorcelainStatus = (statusOutput: string): string[] => {
  return statusOutput
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3).trim())
    .sort((left, right) => left.localeCompare(right));
};

export const verifyVaultGitRepo = async (
  vaultRepoPath: string,
  gitBranch: string,
  gitRemote: string,
): Promise<GitPreflightResult> => {
  const gitDirectory = path.join(vaultRepoPath, ".git");

  if (!(await fileExists(vaultRepoPath)) || !(await fileExists(gitDirectory))) {
    throw new AppError({
      code: errorCodes.git,
      message: "Vault repository path must point to a git repository.",
      statusCode: 500,
      details: { vaultRepoPath },
    });
  }

  const currentBranch = trimTrailingNewline(
    await runGit(vaultRepoPath, ["branch", "--show-current"]),
  );

  if (currentBranch !== gitBranch) {
    throw new AppError({
      code: errorCodes.git,
      message: "Vault repository branch does not match configuration.",
      statusCode: 500,
      details: { currentBranch, expectedBranch: gitBranch },
    });
  }

  const configuredRemote = trimTrailingNewline(
    await runGit(vaultRepoPath, ["remote", "get-url", gitRemote]),
  );

  if (configuredRemote.length === 0) {
    throw new AppError({
      code: errorCodes.git,
      message: "Vault repository remote is not configured.",
      statusCode: 500,
      details: { gitRemote },
    });
  }

  return { branch: currentBranch, remote: configuredRemote };
};

export const getVaultGitStatus = async (vaultRepoPath: string): Promise<string> => {
  return trimTrailingNewline(await runGit(vaultRepoPath, ["status", "--short"])) || "clean";
};

const commitAndPushChanges = async (
  vaultRepoPath: string,
  gitRemote: string,
  gitBranch: string,
  commitMessage: string,
  logger: AppLogger,
): Promise<GitCommitResult> => {
  const statusBeforeStaging = await runGit(vaultRepoPath, ["status", "--porcelain"]);
  const changedFiles = parsePorcelainStatus(statusBeforeStaging);

  if (changedFiles.length === 0) {
    throw new AppError({
      code: errorCodes.git,
      message: "Expected vault changes, but git working tree is clean.",
      statusCode: 500,
    });
  }

  await runGit(vaultRepoPath, ["add", "--all", "."]);

  const diff =
    trimTrailingNewline(
      await runGit(vaultRepoPath, ["diff", "--cached", "--stat", "--find-renames"]),
    ) || "No diff output.";

  logger.info({
    body: "Prepared git diff for commit.",
    attributes: {
      changedFileCount: changedFiles.length,
      changedFiles: changedFiles.join(", "),
      commitMessage,
      diff,
      gitBranch,
      gitRemote,
    },
  });

  let commitSha = "";

  try {
    await runGit(vaultRepoPath, ["commit", "-m", commitMessage]);
    commitSha = trimTrailingNewline(await runGit(vaultRepoPath, ["rev-parse", "HEAD"]));
  } catch (error) {
    const normalizedError = toError(error);
    throw new AppError({
      code: errorCodes.git,
      message: "Failed to create vault commit.",
      statusCode: 500,
      cause: error,
      details: {
        changedFiles,
        commitMessage,
        errorMessage: normalizedError.message,
      },
    });
  }

  try {
    await runGit(vaultRepoPath, ["push", gitRemote, gitBranch]);
  } catch (error) {
    const normalizedError = toError(error);
    throw new AppError({
      code: errorCodes.git,
      message: "Failed to push vault commit to remote.",
      statusCode: 500,
      cause: error,
      details: { commitSha, errorMessage: normalizedError.message, gitBranch, gitRemote },
    });
  }

  return {
    changedFiles,
    commitSha,
    diff,
  };
};

export const commitAndPushVaultChanges = async (
  vaultRepoPath: string,
  gitRemote: string,
  gitBranch: string,
  submissionId: string,
  logger: AppLogger,
): Promise<GitCommitResult> => {
  return commitAndPushChanges(
    vaultRepoPath,
    gitRemote,
    gitBranch,
    `ingest: ${submissionId}`,
    logger,
  );
};

export const commitAndPushVaultScaffold = async (
  vaultRepoPath: string,
  gitRemote: string,
  gitBranch: string,
  logger: AppLogger,
): Promise<GitCommitResult> => {
  return commitAndPushChanges(vaultRepoPath, gitRemote, gitBranch, "chore: scaffold vault", logger);
};

export const resetVaultToHead = async (vaultRepoPath: string): Promise<void> => {
  await runGit(vaultRepoPath, ["reset", "--hard", "HEAD"]);
  await runGit(vaultRepoPath, ["clean", "-fd"]);
};
