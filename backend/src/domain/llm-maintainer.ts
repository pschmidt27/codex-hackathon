import OpenAI from "openai";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { z } from "zod";

import type { Config } from "../config.ts";
import type { AppLogger } from "../lib/telemetry.ts";
import type { VaultToolset } from "./vault.ts";
import { AppError, errorCodes, toError } from "../lib/errors.ts";

export type MaintainerInput = {
  capturedAt?: string;
  rawSourceContent?: string;
  rawSourcePath: string;
  sourceApp?: string;
  submissionId: string;
};

export type MaintainerResult = {
  filesChanged: string[];
  summary: string;
};

const finalResponseSchema = z.object({
  filesChanged: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1),
});

const listFilesParametersSchema = z.object({
  relativePath: z.string().min(1).optional(),
});

const fetchUrlParametersSchema = z.object({
  url: z.url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "URL must use http or https.",
  }),
});

const filePathParametersSchema = z.object({
  relativePath: z.string().min(1),
});

const writeFileParametersSchema = z.object({
  content: z.string(),
  relativePath: z.string().min(1),
});

const editFileParametersSchema = z.object({
  newText: z.string(),
  oldText: z.string().min(1),
  relativePath: z.string().min(1),
});

const renameFileParametersSchema = z.object({
  newRelativePath: z.string().min(1),
  relativePath: z.string().min(1),
});

const toolDefinitions: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch the contents of a URL mentioned in the submission. Prefer using this whenever a submission includes URLs and the linked page may contain useful facts or context for the vault update.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The absolute HTTP or HTTPS URL to fetch.",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List files inside the vault repo. Use before editing when you need to inspect available files.",
      parameters: {
        type: "object",
        properties: {
          relativePath: {
            type: "string",
            description: "Optional relative directory to scope the listing to.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file from the vault repo.",
      parameters: {
        type: "object",
        properties: {
          relativePath: {
            type: "string",
            description: "Relative path to the file inside the vault repo.",
          },
        },
        required: ["relativePath"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a UTF-8 file in the vault repo.",
      parameters: {
        type: "object",
        properties: {
          relativePath: { type: "string" },
          content: { type: "string" },
        },
        required: ["relativePath", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new UTF-8 file. Prefer this when adding a new note or support file.",
      parameters: {
        type: "object",
        properties: {
          relativePath: { type: "string" },
          content: { type: "string" },
        },
        required: ["relativePath", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace exactly one existing substring in a UTF-8 file.",
      parameters: {
        type: "object",
        properties: {
          relativePath: { type: "string" },
          oldText: { type: "string" },
          newText: { type: "string" },
        },
        required: ["relativePath", "oldText", "newText"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_file",
      description: "Rename or move a file to a different relative path inside the vault repo.",
      parameters: {
        type: "object",
        properties: {
          relativePath: { type: "string" },
          newRelativePath: { type: "string" },
        },
        required: ["relativePath", "newRelativePath"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file from the vault repo.",
      parameters: {
        type: "object",
        properties: {
          relativePath: { type: "string" },
        },
        required: ["relativePath"],
        additionalProperties: false,
      },
    },
  },
];

const maxFetchedContentLength = 12_000;

const maintainerSystemPrompt = `You maintain a small Obsidian vault for a single user.

You may directly edit any file in the vault repo.

Goals:
- inspect the current vault state before making major changes
- decide whether to update existing files or create new ones
- keep notes concise, accurate, and reader-friendly
- capture durable, reusable knowledge rather than one-off details from a single submission
- prefer generalized summaries over exact restatements; synthesize patterns, preferences, and stable facts
- keep submission-specific details, examples, timestamps, and one-time events in log.md unless they are essential to durable notes
- before writing a durable note, ask whether the information is likely to remain useful across future submissions
- avoid exact quotes, dates, and narrow situational details in durable notes unless they materially change understanding
- preserve or improve wiki-style links between related notes
- keep index.md, log.md, overview.md, and schema.md useful
- record the ingest in log.md using the required ## [timestamp] ingest | submissionId | short title format
- mention touched notes in the log entry
- reference raw sources where useful
- aggressively use fetch_url for URLs found in the submission whenever the linked page could add important context, facts, titles, summaries, or clarifications
- when a submission includes one or more URLs, prefer fetching them before writing substantive notes about their contents
- if you rely on information from a URL, fetch it first instead of guessing from the URL alone
- if new input conflicts with existing notes, note the contradiction clearly
- do not write outside the vault repo

When you are finished, respond with JSON only:
{"summary":"short summary","filesChanged":["path1","path2"]}`;

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

export const createOpenAiClient = (config: Config): OpenAI => {
  return new OpenAI({ apiKey: config.openAiApiKey });
};

const htmlToText = (content: string): string => {
  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<main\b[^>]*>/giu, "\n")
    .replace(
      /<\/?(?:p|div|section|article|main|header|footer|li|ul|ol|h[1-6]|br|tr|td|th)\b[^>]*>/giu,
      "\n",
    )
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/\r\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/[\t ]{2,}/gu, " ")
    .trim();
};

const fetchUrl = async (options: {
  logger: AppLogger;
  submissionId: string;
  url: string;
}): Promise<string> => {
  try {
    const response = await fetch(options.url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent": "personal-knowledge-base-backend/1.0",
        accept: "text/plain, text/markdown, text/html, application/json;q=0.9, */*;q=0.1",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return `URL: ${options.url}\nERROR: HTTP ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get("content-type") ?? "unknown";
    const body = (await response.text()).slice(0, maxFetchedContentLength);
    const normalizedBody = contentType.includes("text/html") ? htmlToText(body) : body.trim();

    if (normalizedBody.length === 0) {
      return `URL: ${options.url}\nContent-Type: ${contentType}\nERROR: Response body was empty after normalization`;
    }

    return [
      `URL: ${options.url}`,
      `Content-Type: ${contentType}`,
      "Fetched content:",
      normalizedBody,
    ].join("\n");
  } catch (error) {
    const normalizedError = toError(error);
    options.logger.warn({
      body: "Failed to fetch URL content for maintainer tool call.",
      attributes: {
        errorMessage: normalizedError.message,
        submissionId: options.submissionId,
        url: options.url,
      },
    });

    return `URL: ${options.url}\nERROR: ${normalizedError.message}`;
  }
};

const isFunctionToolCall = (
  toolCall: unknown,
): toolCall is ChatCompletionMessageFunctionToolCall => {
  return (
    typeof toolCall === "object" &&
    toolCall !== null &&
    "type" in toolCall &&
    toolCall.type === "function" &&
    "function" in toolCall
  );
};

export const runMaintainerAgent = async (options: {
  client: OpenAI;
  config: Config;
  input: MaintainerInput;
  logger: AppLogger;
  toolset: VaultToolset;
  vaultContext: string;
}): Promise<MaintainerResult> => {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: maintainerSystemPrompt,
    },
    {
      role: "user",
      content: [
        `submissionId: ${options.input.submissionId}`,
        `rawSourcePath: ${options.input.rawSourcePath}`,
        `capturedAt: ${options.input.capturedAt ?? "unknown"}`,
        `sourceApp: ${options.input.sourceApp ?? "unknown"}`,
        ...(options.input.rawSourceContent
          ? ["Submission content:", options.input.rawSourceContent]
          : []),
        "Current vault context:",
        options.vaultContext,
      ].join("\n\n"),
    },
  ];

  for (let iteration = 0; iteration < options.config.maxLlmToolIterations; iteration += 1) {
    const completion = await options.client.chat.completions.create({
      messages,
      model: options.config.openAiModel,
      tool_choice: "auto",
      tools: toolDefinitions,
    });

    const choice = completion.choices[0];

    if (!choice?.message) {
      throw new AppError({
        code: errorCodes.llm,
        message: "OpenAI returned no completion choice.",
        statusCode: 500,
      });
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    if ((assistantMessage.tool_calls?.length ?? 0) > 0) {
      for (const toolCall of assistantMessage.tool_calls ?? []) {
        if (!isFunctionToolCall(toolCall)) {
          throw new AppError({
            code: errorCodes.llm,
            message: "Maintainer returned an unsupported custom tool call.",
            statusCode: 500,
          });
        }

        let toolResult: string;

        try {
          toolResult = await executeToolCall({
            logger: options.logger,
            rawArguments: toolCall.function.arguments,
            submissionId: options.input.submissionId,
            toolName: toolCall.function.name,
            toolset: options.toolset,
          });
          options.logger.info({
            body: "Maintainer tool call completed.",
            attributes: {
              submissionId: options.input.submissionId,
              toolName: toolCall.function.name,
            },
          });
        } catch (error) {
          const normalizedError = toError(error);
          const errorDetails =
            error instanceof AppError && error.details
              ? ` Details: ${JSON.stringify(error.details)}`
              : "";

          options.logger.warn({
            body: "Maintainer tool call failed and was returned to the model.",
            attributes: {
              errorMessage: normalizedError.message,
              submissionId: options.input.submissionId,
              toolName: toolCall.function.name,
            },
          });

          toolResult = `ERROR: ${normalizedError.message}${errorDetails}`;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      continue;
    }

    const content = parseAssistantContent(assistantMessage.content).trim();

    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(content);
    } catch {
      parsedJson = undefined;
    }

    const parsed = finalResponseSchema.safeParse(parsedJson);

    if (!parsed.success) {
      messages.push({
        role: "user",
        content:
          "Your final response must be valid JSON with keys summary and filesChanged. Return JSON only.",
      });
      continue;
    }

    return parsed.data;
  }

  throw new AppError({
    code: errorCodes.llm,
    message: "Maintainer exceeded maximum tool iterations.",
    statusCode: 500,
  });
};

const executeToolCall = async (options: {
  logger: AppLogger;
  rawArguments: string;
  submissionId: string;
  toolName: string;
  toolset: VaultToolset;
}): Promise<string> => {
  const parsedArguments = JSON.parse(options.rawArguments) as unknown;

  switch (options.toolName) {
    case "fetch_url": {
      const input = fetchUrlParametersSchema.parse(parsedArguments);
      return await fetchUrl({
        logger: options.logger,
        submissionId: options.submissionId,
        url: input.url,
      });
    }
    case "list_files": {
      const input = listFilesParametersSchema.parse(parsedArguments);
      return JSON.stringify(await options.toolset.listFiles(input.relativePath));
    }
    case "read_file": {
      const input = filePathParametersSchema.parse(parsedArguments);
      return await options.toolset.readFile(input.relativePath);
    }
    case "write_file": {
      const input = writeFileParametersSchema.parse(parsedArguments);
      return await options.toolset.writeFile(input.relativePath, input.content);
    }
    case "create_file": {
      const input = writeFileParametersSchema.parse(parsedArguments);
      return await options.toolset.createFile(input.relativePath, input.content);
    }
    case "edit_file": {
      const input = editFileParametersSchema.parse(parsedArguments);
      return await options.toolset.editFile(input.relativePath, input.oldText, input.newText);
    }
    case "rename_file": {
      const input = renameFileParametersSchema.parse(parsedArguments);
      return await options.toolset.renameFile(input.relativePath, input.newRelativePath);
    }
    case "delete_file": {
      const input = filePathParametersSchema.parse(parsedArguments);
      return await options.toolset.deleteFile(input.relativePath);
    }
    default: {
      throw new AppError({
        code: errorCodes.llm,
        message: `Unknown maintainer tool: ${options.toolName}`,
        statusCode: 500,
      });
    }
  }
};
