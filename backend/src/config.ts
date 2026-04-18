/* eslint-disable n/no-process-env */

import path from "node:path";

import { z } from "zod";

import { AppError, errorCodes } from "./lib/errors.ts";

const envSchema = z.object({
  ALLOW_INSECURE_READ_ACCESS: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  AUTH_SHARED_SECRET: z.string().min(1).optional(),
  GIT_BRANCH: z.string().min(1).default("main"),
  GIT_REMOTE: z.string().min(1).default("origin"),
  HOST: z.string().min(1).default("0.0.0.0"),
  MAX_IMAGE_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  MAX_LLM_TOOL_ITERATIONS: z.coerce.number().int().positive().max(50).default(24),
  MAX_SUBMISSION_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(1024 * 1024)
    .default(65_536),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  VAULT_REPO_PATH: z.string().min(1),
});

export type Config = {
  allowInsecureReadAccess: boolean;
  authSharedSecret?: string;
  gitBranch: string;
  gitRemote: string;
  host: string;
  maxImageUploadBytes: number;
  maxLlmToolIterations: number;
  maxSubmissionBytes: number;
  openAiApiKey: string;
  openAiModel: string;
  port: number;
  vaultRepoPath: string;
};

export const loadConfig = (environment: NodeJS.ProcessEnv, cwd: string = process.cwd()): Config => {
  const parsedEnvironment = envSchema.safeParse(environment);

  if (!parsedEnvironment.success) {
    throw new AppError({
      code: errorCodes.config,
      message: "Invalid environment configuration.",
      statusCode: 500,
      details: { issues: z.treeifyError(parsedEnvironment.error) },
    });
  }

  const raw = parsedEnvironment.data;

  return {
    allowInsecureReadAccess: raw.ALLOW_INSECURE_READ_ACCESS,
    ...(raw.AUTH_SHARED_SECRET ? { authSharedSecret: raw.AUTH_SHARED_SECRET } : {}),
    gitBranch: raw.GIT_BRANCH,
    gitRemote: raw.GIT_REMOTE,
    host: raw.HOST,
    maxImageUploadBytes: raw.MAX_IMAGE_UPLOAD_BYTES,
    maxLlmToolIterations: raw.MAX_LLM_TOOL_ITERATIONS,
    maxSubmissionBytes: raw.MAX_SUBMISSION_BYTES,
    openAiApiKey: raw.OPENAI_API_KEY,
    openAiModel: raw.OPENAI_MODEL,
    port: raw.PORT,
    vaultRepoPath: path.resolve(cwd, raw.VAULT_REPO_PATH),
  };
};

export const loadConfigFromProcessEnv = (): Config => loadConfig(process.env);
