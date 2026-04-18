import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import type { KnowledgeService } from "../domain/knowledge.ts";

const searchQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).optional(),
  q: z.string().trim().min(1),
});

const readQuerySchema = z.object({
  path: z.string().trim().min(1),
});

const recentQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).optional(),
});

export const createKnowledgeRouter = (dependencies: {
  knowledgeService: KnowledgeService;
}): Hono<AppEnv> => {
  const router = new Hono<AppEnv>();

  router.get("/curated/search", async (context) => {
    const query = searchQuerySchema.parse(context.req.query());
    const results = await dependencies.knowledgeService.searchCurated(query.q, query.limit);

    return context.json({ results }, 200);
  });

  router.get("/curated/read", async (context) => {
    const query = readQuerySchema.parse(context.req.query());
    const document = await dependencies.knowledgeService.readCurated(query.path);

    return context.json(document, 200);
  });

  router.get("/raw/search", async (context) => {
    const query = searchQuerySchema.parse(context.req.query());
    const results = await dependencies.knowledgeService.searchRaw(query.q, query.limit);

    return context.json({ results }, 200);
  });

  router.get("/raw/read", async (context) => {
    const query = readQuerySchema.parse(context.req.query());
    const document = await dependencies.knowledgeService.readRaw(query.path);

    return context.json(document, 200);
  });

  router.get("/recent", async (context) => {
    const query = recentQuerySchema.parse(context.req.query());
    const results = await dependencies.knowledgeService.listRecentIngests(query.limit);

    return context.json({ results }, 200);
  });

  return router;
};
