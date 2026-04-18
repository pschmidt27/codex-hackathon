import { Hono } from "hono";

import type { Config } from "./config.ts";
import type { SubmissionQueueService } from "./domain/queue.ts";
import type { AppLogger } from "./lib/telemetry.ts";
import { AppError, toError } from "./lib/errors.ts";
import { createSubmissionsRouter } from "./routes/submissions.ts";

const sharedSecretHeaderName = "x-shared-secret";

export type AppVariables = {
  requestId: string;
  submissionId?: string;
};

export type AppEnv = {
  Variables: AppVariables;
};

export const createApp = (dependencies: {
  config: Config;
  logger: AppLogger;
  queueService: SubmissionQueueService;
}): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();

  app.use("*", async (context, next) => {
    const requestId = crypto.randomUUID();
    const logRequestCompleted = (): void => {
      const durationMs = Math.round(performance.now() - startedAt);

      dependencies.logger.info({
        body: "HTTP request completed.",
        attributes: {
          durationMs,
          method: context.req.method,
          path: context.req.path,
          requestId,
          statusCode: context.res.status,
          ...(context.get("submissionId")
            ? { submissionId: context.get("submissionId") }
            : {}),
        },
      });
    };

    context.set("requestId", requestId);

    const startedAt = performance.now();

    dependencies.logger.info({
      body: "HTTP request started.",
      attributes: {
        method: context.req.method,
        path: context.req.path,
        requestId,
      },
    });

    if (dependencies.config.authSharedSecret) {
      const providedSecret = context.req.header(sharedSecretHeaderName);

      if (providedSecret !== dependencies.config.authSharedSecret) {
        context.status(401);
        logRequestCompleted();
        return context.json({ error: "Unauthorized." }, 401);
      }
    }

    await next();
    logRequestCompleted();
  });

  app.get("/health", (context) => context.json({ status: "ok" }, 200));
  app.route("/v1/submissions", createSubmissionsRouter(dependencies));

  app.onError((error, context) => {
    const normalizedError = toError(error);

    dependencies.logger.error({
      body: "HTTP request failed.",
      attributes: {
        errorMessage: normalizedError.message,
        path: context.req.path,
        ...(context.get("requestId") ? { requestId: context.get("requestId") } : {}),
        ...(context.get("submissionId") ? { submissionId: context.get("submissionId") } : {}),
      },
    });

    if (normalizedError instanceof AppError) {
      return Response.json(
        {
          code: normalizedError.code,
          ...(normalizedError.details ? { details: normalizedError.details } : {}),
          error: normalizedError.message,
        },
        { status: normalizedError.statusCode },
      );
    }

    return context.json({ error: "Internal Server Error" }, 500);
  });

  return app;
};
