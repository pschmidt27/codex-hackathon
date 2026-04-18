import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import type { KnowledgeService } from "../domain/knowledge.ts";
import { AppError, errorCodes, toError } from "../lib/errors.ts";

const jsonRpcIdSchema = z.union([z.number(), z.string(), z.null()]);
const jsonRpcRequestSchema = z.object({
  id: jsonRpcIdSchema.optional(),
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

const toolsCallSchema = z.object({
  arguments: z.record(z.string(), z.unknown()).optional(),
  name: z.string().min(1),
});

const searchArgumentsSchema = z.object({
  limit: z.coerce.number().int().positive().max(20).optional(),
  query: z.string().trim().min(1),
});

const readArgumentsSchema = z.object({
  path: z.string().trim().min(1),
});

const recentArgumentsSchema = z.object({
  limit: z.coerce.number().int().positive().max(20).optional(),
});

const serverInfo = {
  name: "personal-knowledge-base-backend",
  version: "0.1.0",
};

const toolDefinitions = [
  {
    description: "Search curated notes and top-level vault documents by keyword.",
    inputSchema: {
      properties: {
        limit: { maximum: 20, minimum: 1, type: "integer" },
        query: { minLength: 1, type: "string" },
      },
      required: ["query"],
      type: "object",
    },
    name: "search_curated",
  },
  {
    description: "Read a curated note or top-level vault document by vault-relative path.",
    inputSchema: {
      properties: {
        path: { minLength: 1, type: "string" },
      },
      required: ["path"],
      type: "object",
    },
    name: "read_curated",
  },
  {
    description: "List the most recent raw ingests with lightweight metadata.",
    inputSchema: {
      properties: {
        limit: { maximum: 20, minimum: 1, type: "integer" },
      },
      type: "object",
    },
    name: "list_recent_ingests",
  },
  {
    description: "Search raw captured source files by keyword.",
    inputSchema: {
      properties: {
        limit: { maximum: 20, minimum: 1, type: "integer" },
        query: { minLength: 1, type: "string" },
      },
      required: ["query"],
      type: "object",
    },
    name: "search_raw",
  },
  {
    description: "Read a raw captured source file by vault-relative path.",
    inputSchema: {
      properties: {
        path: { minLength: 1, type: "string" },
      },
      required: ["path"],
      type: "object",
    },
    name: "read_raw",
  },
] as const;

const buildJsonRpcErrorResponse = (
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: Record<string, unknown>,
): Response => {
  return Response.json(
    {
      error: {
        ...(data ? { data } : {}),
        code,
        message,
      },
      id: id ?? null,
      jsonrpc: "2.0",
    },
    { status: 200 },
  );
};

const buildToolResult = (payload: unknown): { content: Array<{ text: string; type: "text" }>; structuredContent: unknown } => {
  return {
    content: [
      {
        text: JSON.stringify(payload, null, 2),
        type: "text",
      },
    ],
    structuredContent: payload,
  };
};

const executeTool = async (
  knowledgeService: KnowledgeService,
  name: string,
  arguments_: Record<string, unknown> | undefined,
): Promise<unknown> => {
  switch (name) {
    case "search_curated": {
      const parsed = searchArgumentsSchema.parse(arguments_ ?? {});
      return { results: await knowledgeService.searchCurated(parsed.query, parsed.limit) };
    }

    case "read_curated": {
      const parsed = readArgumentsSchema.parse(arguments_ ?? {});
      return knowledgeService.readCurated(parsed.path);
    }

    case "list_recent_ingests": {
      const parsed = recentArgumentsSchema.parse(arguments_ ?? {});
      return { results: await knowledgeService.listRecentIngests(parsed.limit) };
    }

    case "search_raw": {
      const parsed = searchArgumentsSchema.parse(arguments_ ?? {});
      return { results: await knowledgeService.searchRaw(parsed.query, parsed.limit) };
    }

    case "read_raw": {
      const parsed = readArgumentsSchema.parse(arguments_ ?? {});
      return knowledgeService.readRaw(parsed.path);
    }

    default: {
      throw new AppError({
        code: errorCodes.validation,
        message: `Unknown MCP tool: ${name}`,
        statusCode: 400,
      });
    }
  }
};

export const createMcpRouter = (dependencies: {
  knowledgeService: KnowledgeService;
}): Hono<AppEnv> => {
  const router = new Hono<AppEnv>();

  router.post("/", async (context) => {
    let payload: unknown;

    try {
      payload = await context.req.json();
    } catch {
      return buildJsonRpcErrorResponse(null, -32_700, "Parse error");
    }

    const parsedRequest = jsonRpcRequestSchema.safeParse(payload);

    if (!parsedRequest.success) {
      return buildJsonRpcErrorResponse(null, -32_600, "Invalid Request");
    }

    const request = parsedRequest.data;

    if (request.method === "notifications/initialized" && request.id === undefined) {
      return new Response(null, { status: 202 });
    }

    try {
      if (request.method === "initialize") {
        return context.json(
          {
            id: request.id ?? null,
            jsonrpc: "2.0",
            result: {
              capabilities: {
                tools: {},
              },
              protocolVersion: "2025-03-26",
              serverInfo,
            },
          },
          200,
        );
      }

      if (request.method === "ping") {
        return context.json(
          {
            id: request.id ?? null,
            jsonrpc: "2.0",
            result: {},
          },
          200,
        );
      }

      if (request.method === "tools/list") {
        return context.json(
          {
            id: request.id ?? null,
            jsonrpc: "2.0",
            result: {
              tools: toolDefinitions,
            },
          },
          200,
        );
      }

      if (request.method === "tools/call") {
        const parsedToolCall = toolsCallSchema.parse(request.params ?? {});
        const toolResult = await executeTool(
          dependencies.knowledgeService,
          parsedToolCall.name,
          parsedToolCall.arguments,
        );

        return context.json(
          {
            id: request.id ?? null,
            jsonrpc: "2.0",
            result: buildToolResult(toolResult),
          },
          200,
        );
      }

      return buildJsonRpcErrorResponse(request.id, -32_601, "Method not found");
    } catch (error) {
      const normalizedError = toError(error);

      if (error instanceof z.ZodError || error instanceof AppError) {
        return buildJsonRpcErrorResponse(request.id, -32_602, normalizedError.message);
      }

      return buildJsonRpcErrorResponse(request.id, -32_000, normalizedError.message);
    }
  });

  return router;
};
