import { createHash } from "node:crypto";

import { z } from "zod";

import type {
  AcceptedImageSubmission,
  AcceptedSubmission,
  AcceptedTextSubmission,
  ImageFileExtension,
  ImageMimeType,
} from "../types/submissions.ts";
import { imageSubmissionMimeTypes } from "../types/submissions.ts";
import { AppError, errorCodes } from "../lib/errors.ts";

const maxSourceAppLength = 512;

const baseSubmissionSchema = z.object({
  capturedAt: z.iso.datetime().optional(),
  sourceApp: z.string().trim().min(1).max(maxSourceAppLength).optional(),
  submissionId: z.uuid(),
});

export const textSubmissionRequestSchema = baseSubmissionSchema.extend({
  text: z.string(),
});

export type TextSubmissionRequest = z.infer<typeof textSubmissionRequestSchema>;

export const imageSubmissionMimeTypeSchema = z.enum([
  imageSubmissionMimeTypes.jpeg,
  imageSubmissionMimeTypes.png,
  imageSubmissionMimeTypes.webp,
]);

export type ImageSubmissionFormFields = {
  capturedAt?: string;
  imageFile: File;
  sourceApp?: string;
  submissionId: string;
  text?: string;
};

const normalizeLineEndings = (text: string): string => text.replace(/\r\n?/g, "\n");

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const normalized = value === undefined ? undefined : normalizeLineEndings(value).trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
};

const getUtf8ByteLength = (value: string): number => Buffer.byteLength(value, "utf8");

const createSha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

const getImageExtension = (mimeType: ImageMimeType): ImageFileExtension => {
  switch (mimeType) {
    case imageSubmissionMimeTypes.jpeg: {
      return "jpg";
    }
    case imageSubmissionMimeTypes.png: {
      return "png";
    }
    case imageSubmissionMimeTypes.webp: {
      return "webp";
    }
  }
};

export const buildAcceptedTextSubmission = (
  payload: TextSubmissionRequest,
  maxSubmissionBytes: number,
  receivedAt: Date = new Date(),
): AcceptedTextSubmission => {
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
    kind: "text",
    payloadBytes,
    payloadSha256: createSha256(normalizedText),
    payloadText: normalizedText,
    receivedAt: receivedAt.toISOString(),
    ...(payload.sourceApp ? { sourceApp: payload.sourceApp } : {}),
    submissionId: payload.submissionId,
  };
};

export const parseImageSubmissionFormFields = (
  formData: FormData,
): ImageSubmissionFormFields => {
  const kind = formData.get("kind");

  if (kind !== "image") {
    throw new AppError({
      code: errorCodes.validation,
      message: "Multipart submissions must include kind=image.",
      statusCode: 400,
    });
  }

  const imageEntries = formData.getAll("image");

  if (imageEntries.length !== 1 || !(imageEntries[0] instanceof File)) {
    throw new AppError({
      code: errorCodes.validation,
      message: "Image submissions must include exactly one file field named image.",
      statusCode: 400,
    });
  }

  const parsedBase = baseSubmissionSchema.parse({
    capturedAt: formData.get("capturedAt") ?? undefined,
    sourceApp: formData.get("sourceApp") ?? undefined,
    submissionId: formData.get("submissionId"),
  });

  const textEntry = formData.get("text");

  if (textEntry !== null && typeof textEntry !== "string") {
    throw new AppError({
      code: errorCodes.validation,
      message: "Caption text must be a string.",
      statusCode: 400,
    });
  }

  return {
    ...(parsedBase.capturedAt ? { capturedAt: parsedBase.capturedAt } : {}),
    imageFile: imageEntries[0],
    ...(parsedBase.sourceApp ? { sourceApp: parsedBase.sourceApp } : {}),
    submissionId: parsedBase.submissionId,
    ...(textEntry ? { text: textEntry } : {}),
  };
};

export const buildAcceptedImageSubmission = async (
  payload: ImageSubmissionFormFields,
  maxImageUploadBytes: number,
  receivedAt: Date = new Date(),
): Promise<AcceptedImageSubmission> => {
  const mimeType = imageSubmissionMimeTypeSchema.safeParse(payload.imageFile.type);

  if (!mimeType.success) {
    throw new AppError({
      code: errorCodes.validation,
      message: "Unsupported image type. Use JPEG, PNG, or WebP.",
      statusCode: 415,
      details: { mimeType: payload.imageFile.type || "unknown" },
    });
  }

  if (payload.imageFile.size <= 0) {
    throw new AppError({
      code: errorCodes.validation,
      message: "Uploaded image file is empty.",
      statusCode: 400,
    });
  }

  if (payload.imageFile.size > maxImageUploadBytes) {
    throw new AppError({
      code: errorCodes.validation,
      message: "Uploaded image exceeds maximum allowed size.",
      statusCode: 413,
      details: { maxImageUploadBytes, payloadBytes: payload.imageFile.size },
    });
  }

  const imageBytes = new Uint8Array(await payload.imageFile.arrayBuffer());
  const captionText = normalizeOptionalText(payload.text);

  return {
    ...(payload.capturedAt ? { capturedAt: payload.capturedAt } : {}),
    ...(captionText ? { captionText } : {}),
    image: {
      bytes: imageBytes,
      extension: getImageExtension(mimeType.data),
      mimeType: mimeType.data,
      ...(payload.imageFile.name ? { originalFilename: payload.imageFile.name } : {}),
      sha256: createSha256(imageBytes),
      sizeBytes: imageBytes.byteLength,
    },
    kind: "image",
    receivedAt: receivedAt.toISOString(),
    ...(payload.sourceApp ? { sourceApp: payload.sourceApp } : {}),
    submissionId: payload.submissionId,
  };
};

export const submissionsMatch = (left: AcceptedSubmission, right: AcceptedSubmission): boolean => {
  if (
    left.submissionId !== right.submissionId ||
    left.kind !== right.kind ||
    left.capturedAt !== right.capturedAt ||
    left.sourceApp !== right.sourceApp
  ) {
    return false;
  }

  if (left.kind === "text" && right.kind === "text") {
    return left.payloadSha256 === right.payloadSha256 && left.payloadText === right.payloadText;
  }

  if (left.kind === "image" && right.kind === "image") {
    return (
      left.captionText === right.captionText &&
      left.image.sha256 === right.image.sha256 &&
      left.image.mimeType === right.image.mimeType &&
      left.image.sizeBytes === right.image.sizeBytes
    );
  }

  return false;
};
