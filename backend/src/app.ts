import { Hono } from "hono";

import type { Config } from "./config.ts";
import type { SubmissionQueueService } from "./domain/queue.ts";
import type { AppLogger } from "./lib/telemetry.ts";
import { AppError, toError } from "./lib/errors.ts";
import { createSubmissionsRouter } from "./routes/submissions.ts";

const sharedSecretHeaderName = "x-shared-secret";

export const createApp = (dependencies: {
  config: Config;
  logger: AppLogger;
  queueService: SubmissionQueueService;
}): Hono => {
  const app = new Hono();

  app.use("*", async (context, next) => {
    const requestId = crypto.randomUUID();

    if (dependencies.config.authSharedSecret) {
      const providedSecret = context.req.header(sharedSecretHeaderName);

      if (providedSecret !== dependencies.config.authSharedSecret) {
        return context.json({ error: "Unauthorized." }, 401);
      }
    }

    const startedAt = performance.now();
    await next();
    const durationMs = Math.round(performance.now() - startedAt);

    dependencies.logger.info({
      body: "HTTP request completed.",
      attributes: {
        durationMs,
        method: context.req.method,
        path: context.req.path,
        requestId,
        statusCode: context.res.status,
      },
    });
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
