import path from "node:path";

import { $ } from "zx";

import type { AppLogger } from "../lib/telemetry.ts";
import { AppError, errorCodes } from "../lib/errors.ts";
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

const runGit = async (vaultRepoPath: string, arguments_: string[]): Promise<string> => {
  const processResult = await $({ cwd: vaultRepoPath, quiet: true })`git ${arguments_}`;
  return processResult.stdout;
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

  const statusOutput = await runGit(vaultRepoPath, ["status", "--porcelain"]);

  if (trimTrailingNewline(statusOutput).length > 0) {
    throw new AppError({
      code: errorCodes.git,
      message: "Vault repository working tree must be clean before processing jobs.",
      statusCode: 500,
      details: { statusOutput },
    });
  }

  return { branch: currentBranch, remote: configuredRemote };
};

export const getVaultGitStatus = async (vaultRepoPath: string): Promise<string> => {
  return trimTrailingNewline(await runGit(vaultRepoPath, ["status", "--short"])) || "clean";
};

export const commitAndPushVaultChanges = async (
  vaultRepoPath: string,
  gitRemote: string,
  gitBranch: string,
  submissionId: string,
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
    attributes: { changedFileCount: changedFiles.length, diff },
  });

  await runGit(vaultRepoPath, ["commit", "-m", `ingest: ${submissionId}`]);
  const commitSha = trimTrailingNewline(await runGit(vaultRepoPath, ["rev-parse", "HEAD"]));

  try {
    await runGit(vaultRepoPath, ["push", gitRemote, gitBranch]);
  } catch (error) {
    throw new AppError({
      code: errorCodes.git,
      message: "Failed to push vault commit to remote.",
      statusCode: 500,
      cause: error,
      details: { commitSha, gitBranch, gitRemote },
    });
  }

  return {
    changedFiles,
    commitSha,
    diff,
  };
};

export const resetVaultToHead = async (vaultRepoPath: string): Promise<void> => {
  await runGit(vaultRepoPath, ["reset", "--hard", "HEAD"]);
  await runGit(vaultRepoPath, ["clean", "-fd"]);
};
