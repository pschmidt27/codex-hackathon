export const errorCodes = {
  validation: "VALIDATION_ERROR",
  config: "CONFIG_ERROR",
  filesystem: "FILESYSTEM_ERROR",
  git: "GIT_ERROR",
  llm: "LLM_ERROR",
  externalDependency: "EXTERNAL_DEPENDENCY_ERROR",
  conflict: "CONFLICT_ERROR",
  shutdown: "SHUTDOWN_ERROR",
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  public constructor(options: {
    message: string;
    code: ErrorCode;
    statusCode?: number;
    cause?: unknown;
    details?: Record<string, unknown>;
    isOperational?: boolean;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    if (options.details) {
      this.details = options.details;
    }
    this.isOperational = options.isOperational ?? true;
  }
}

export const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : "Unknown error");
};
