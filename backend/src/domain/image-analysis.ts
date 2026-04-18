import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";

import type { Config } from "../config.ts";
import type { ImageSubmissionRecord } from "../types/submissions.ts";
import type { AppLogger } from "../lib/telemetry.ts";
import { AppError, errorCodes, toError } from "../lib/errors.ts";

export type ImageAnalysisResult = {
  classification: "document" | "photo" | "screenshot" | "other";
  description: string;
  detectedEntities: string[];
  ocrText: string;
  uncertainty: string;
};

const imageAnalysisSchema = z.object({
  classification: z.enum(["document", "photo", "screenshot", "other"]),
  description: z.string().min(1),
  detectedEntities: z.array(z.string().min(1)).max(20).default([]),
  ocrText: z.string().default(""),
  uncertainty: z.string().min(1),
});

const imageAnalysisPrompt = `Analyze this image for a personal knowledge ingest pipeline.

Return JSON only with:
- description: one concise factual summary
- ocrText: OCR output or an empty string
- detectedEntities: short list of named entities, objects, or prominent UI elements
- classification: one of screenshot, photo, document, other
- uncertainty: concise note about any ambiguity or low-confidence details

Be conservative. Do not invent text that is not visible.`;

const parseAssistantContent = (
  content: string | Array<{ type: string; text?: string }> | null,
): string => {
  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
};

const createDataUrl = (bytes: Uint8Array, mimeType: string): string => {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
};

export const analyzeImageSubmission = async (options: {
  client: OpenAI;
  config: Config;
  logger: AppLogger;
  submission: ImageSubmissionRecord;
}): Promise<ImageAnalysisResult> => {
  const userParts = [
    {
      text: [
        `submissionId: ${options.submission.submissionId}`,
        `capturedAt: ${options.submission.capturedAt ?? "unknown"}`,
        `sourceApp: ${options.submission.sourceApp ?? "unknown"}`,
        `mimeType: ${options.submission.image.mimeType}`,
        `caption: ${options.submission.captionText ?? "none"}`,
      ].join("\n"),
      type: "text",
    },
    {
      image_url: {
        url: createDataUrl(options.submission.image.bytes, options.submission.image.mimeType),
      },
      type: "image_url",
    },
  ];

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: imageAnalysisPrompt },
    { role: "user", content: userParts as never },
  ];

  try {
    const completion = await options.client.chat.completions.create({
      messages,
      model: options.config.openAiModel,
      response_format: { type: "json_object" },
    });

    const content = parseAssistantContent(completion.choices[0]?.message.content ?? null).trim();
    const parsedJson = JSON.parse(content) as unknown;
    const parsed = imageAnalysisSchema.safeParse(parsedJson);

    if (!parsed.success) {
      throw new AppError({
        code: errorCodes.llm,
        message: "Image analysis returned invalid JSON.",
        statusCode: 500,
        details: { issues: z.treeifyError(parsed.error) },
      });
    }

    return parsed.data;
  } catch (error) {
    const normalizedError = toError(error);
    options.logger.error({
      body: "Image analysis failed.",
      attributes: {
        errorMessage: normalizedError.message,
        submissionId: options.submission.submissionId,
      },
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError({
      cause: error,
      code: errorCodes.llm,
      message: "Image analysis failed.",
      statusCode: 500,
    });
  }
};
