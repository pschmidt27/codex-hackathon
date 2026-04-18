import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import type { Config } from "../config.ts";
import type { SubmissionQueueService } from "../domain/queue.ts";
import type { AppLogger } from "../lib/telemetry.ts";
import { buildAcceptedSubmission, submissionRequestSchema } from "../domain/submissions.ts";
import { AppError } from "../lib/errors.ts";

const jsonContentTypeSchema = z.string().regex(/^application\/json\b/i);

const assertJsonRequest = (context: Context<AppEnv>): void => {
  const contentType = context.req.header("content-type");
  const parsed = jsonContentTypeSchema.safeParse(contentType);

  if (!parsed.success) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Content-Type must be application/json.",
      statusCode: 415,
    });
  }
};

export const createSubmissionsRouter = (dependencies: {
  config: Config;
  logger: AppLogger;
  queueService: SubmissionQueueService;
}): Hono<AppEnv> => {
  const router = new Hono<AppEnv>();

  router.get("/debug/state", async (context) => {
    const state = await dependencies.queueService.getDebugState();
    return context.json(state, 200);
  });

  router.post("/", async (context) => {
    assertJsonRequest(context);

    const body: unknown = await context.req.json();
    const payload = submissionRequestSchema.parse(body);
    context.set("submissionId", payload.submissionId);
    const acceptedSubmission = buildAcceptedSubmission(
      payload,
      dependencies.config.maxSubmissionBytes,
    );
    const result = await dependencies.queueService.enqueue(acceptedSubmission);

    dependencies.logger.info({
      body: "Submission request accepted.",
      attributes: {
        requestId: context.get("requestId"),
        status: result.status,
        submissionId: result.submissionId,
      },
    });

    return context.json(
      {
        status: result.status,
        submissionId: result.submissionId,
      },
      result.statusCode,
    );
  });

  router.get("/:submissionId", (context) => {
    const submissionId = context.req.param("submissionId");
    const status = dependencies.queueService.getSubmissionStatus(submissionId);

    if (!status) {
      return context.json({ error: "Submission not found." }, 404);
    }

    return context.json(status, 200);
  });

  return router;
};
