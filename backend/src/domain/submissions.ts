import { createHash } from "node:crypto";

import { z } from "zod";

import type { AcceptedSubmission } from "../types/submissions.ts";
import { AppError, errorCodes } from "../lib/errors.ts";

export const submissionRequestSchema = z.object({
  capturedAt: z.iso.datetime().optional(),
  sourceApp: z.string().trim().min(1).max(512).optional(),
  submissionId: z.uuid(),
  text: z.string(),
});

export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;

const normalizeLineEndings = (text: string): string => text.replace(/\r\n?/g, "\n");

const getUtf8ByteLength = (value: string): number => Buffer.byteLength(value, "utf8");

export const buildAcceptedSubmission = (
  payload: SubmissionRequest,
  maxSubmissionBytes: number,
  receivedAt: Date = new Date(),
): AcceptedSubmission => {
  const normalizedText = normalizeLineEndings(payload.text).trim();

  if (normalizedText.length === 0) {
    throw new AppError({
      code: errorCodes.validation,
      message: "Submission text must not be blank.",
      statusCode: 400,
    });
  }

  const payloadBytes = getUtf8ByteLength(normalizedText);

  if (payloadBytes > maxSubmissionBytes) {
    throw new AppError({
      code: errorCodes.validation,
      message: "Submission exceeds maximum allowed size.",
      statusCode: 413,
      details: { maxSubmissionBytes, payloadBytes },
    });
  }

  return {
    ...(payload.capturedAt ? { capturedAt: payload.capturedAt } : {}),
    payloadBytes,
    payloadSha256: createHash("sha256").update(normalizedText).digest("hex"),
    payloadText: normalizedText,
    receivedAt: receivedAt.toISOString(),
    ...(payload.sourceApp ? { sourceApp: payload.sourceApp } : {}),
    submissionId: payload.submissionId,
  };
};

export const submissionsMatch = (left: AcceptedSubmission, right: AcceptedSubmission): boolean => {
  return (
    left.submissionId === right.submissionId &&
    left.payloadSha256 === right.payloadSha256 &&
    left.payloadText === right.payloadText &&
    left.capturedAt === right.capturedAt &&
    left.sourceApp === right.sourceApp
  );
};
