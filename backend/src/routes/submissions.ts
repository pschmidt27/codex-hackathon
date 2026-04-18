import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import type { Config } from "../config.ts";
import type { SubmissionQueueService } from "../domain/queue.ts";
import type { AppLogger } from "../lib/telemetry.ts";
import {
  buildAcceptedImageSubmission,
  buildAcceptedTextSubmission,
  parseImageSubmissionFormFields,
  textSubmissionRequestSchema,
} from "../domain/submissions.ts";
import { AppError } from "../lib/errors.ts";

const jsonContentTypeSchema = z.string().regex(/^application\/json\b/i);
const multipartContentTypeSchema = z.string().regex(/^multipart\/form-data\b/i);

const getRequestContentType = (context: Context<AppEnv>): string => {
  return context.req.header("content-type") ?? "";
};

const isJsonRequest = (context: Context<AppEnv>): boolean => {
  return jsonContentTypeSchema.safeParse(getRequestContentType(context)).success;
};

const isMultipartRequest = (context: Context<AppEnv>): boolean => {
  return multipartContentTypeSchema.safeParse(getRequestContentType(context)).success;
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
    const acceptedSubmission = await (async () => {
      if (isJsonRequest(context)) {
        const body: unknown = await context.req.json();
        const payload = textSubmissionRequestSchema.parse(body);
        return buildAcceptedTextSubmission(payload, dependencies.config.maxSubmissionBytes);
      }

      if (isMultipartRequest(context)) {
        const formData = await context.req.raw.formData();
        const payload = parseImageSubmissionFormFields(formData);
        return await buildAcceptedImageSubmission(payload, dependencies.config.maxImageUploadBytes);
      }

      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Content-Type must be application/json or multipart/form-data.",
        statusCode: 415,
      });
    })();

    context.set("submissionId", acceptedSubmission.submissionId);
    const result = await dependencies.queueService.enqueue(acceptedSubmission);

    dependencies.logger.info({
      body: "Submission request accepted.",
      attributes: {
        requestId: context.get("requestId"),
        status: result.status,
        submissionId: result.submissionId,
        submissionKind: acceptedSubmission.kind,
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
