import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { createKnowledgeService } from "./domain/knowledge.ts";
import type { SubmissionQueueService } from "./domain/queue.ts";
import type { AppLogger } from "./lib/telemetry.ts";

const noop = (): void => undefined;

const noopLogger: AppLogger = {
  debug: noop,
  error: noop,
  info: noop,
  warn: noop,
};

const queueServiceStub: SubmissionQueueService = {
  enqueue: (submission) =>
    Promise.resolve({
      status: "accepted",
      statusCode: 202,
      submissionId: submission.submissionId,
    }),
  getDebugState: () =>
    Promise.resolve({
      acceptingNewSubmissions: true,
      failedSubmissionIds: [],
      queue: [],
      vaultGitStatus: "clean",
    }),
  getSubmissionStatus: () => undefined,
  shutdown: () => Promise.resolve(),
};

const temporaryVaults: string[] = [];

const createVaultFixture = async (): Promise<string> => {
  const vaultPath = await mkdtemp(path.join(tmpdir(), "pkb-app-test-"));
  temporaryVaults.push(vaultPath);
  await mkdir(path.join(vaultPath, "notes"), { recursive: true });
  await mkdir(path.join(vaultPath, "raw"), { recursive: true });

  await Promise.all([
    writeFile(path.join(vaultPath, "index.md"), "# Index\n\n", "utf8"),
    writeFile(path.join(vaultPath, "overview.md"), "# Overview\n\n", "utf8"),
    writeFile(path.join(vaultPath, "log.md"), "# Log\n\n", "utf8"),
    writeFile(
      path.join(vaultPath, "notes/project-phoenix.md"),
      "# Project Phoenix\n\nAlpha note.\n",
      "utf8",
    ),
    writeFile(
      path.join(
        vaultPath,
        "raw/2026-04-18T10-00-00.000Z--123e4567-e89b-12d3-a456-426614174000.txt",
      ),
      "Captured alpha note from share sheet.",
      "utf8",
    ),
  ]);

  return vaultPath;
};

const buildConfig = (vaultRepoPath: string, overrides?: Partial<Config>): Config => ({
  allowInsecureReadAccess: false,
  authSharedSecret: "secret",
  gitBranch: "main",
  gitRemote: "origin",
  host: "127.0.0.1",
  maxLlmToolIterations: 5,
  maxSubmissionBytes: 65_536,
  openAiApiKey: "test-key",
  openAiModel: "gpt-5.4-mini",
  port: 3000,
  vaultRepoPath,
  ...overrides,
});

afterEach(async () => {
  await Promise.all(
    temporaryVaults
      .splice(0)
      .map(async (vaultPath) => rm(vaultPath, { force: true, recursive: true })),
  );
});

void test("requires auth for read routes when insecure access is disabled", async () => {
  const vaultPath = await createVaultFixture();
  const app = createApp({
    config: buildConfig(vaultPath),
    knowledgeService: createKnowledgeService(vaultPath),
    logger: noopLogger,
    queueService: queueServiceStub,
  });

  const response = await app.fetch(
    new Request("http://localhost/v1/knowledge/curated/search?q=phoenix"),
  );

  assert.equal(response.status, 401);
});

void test("allows knowledge and MCP reads without auth when insecure access is enabled", async () => {
  const vaultPath = await createVaultFixture();
  const app = createApp({
    config: buildConfig(vaultPath, { allowInsecureReadAccess: true }),
    knowledgeService: createKnowledgeService(vaultPath),
    logger: noopLogger,
    queueService: queueServiceStub,
  });

  const knowledgeResponse = await app.fetch(
    new Request("http://localhost/v1/knowledge/curated/search?q=phoenix"),
  );
  const mcpResponse = await app.fetch(
    new Request("http://localhost/mcp", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/list",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(knowledgeResponse.status, 200);
  assert.equal(mcpResponse.status, 200);
});

void test("returns curated search and read responses with expected shape", async () => {
  const vaultPath = await createVaultFixture();
  const app = createApp({
    config: buildConfig(vaultPath),
    knowledgeService: createKnowledgeService(vaultPath),
    logger: noopLogger,
    queueService: queueServiceStub,
  });

  const searchResponse = await app.fetch(
    new Request("http://localhost/v1/knowledge/curated/search?q=phoenix", {
      headers: { "x-shared-secret": "secret" },
    }),
  );
  const searchBody = (await searchResponse.json()) as {
    results: Array<{ path: string; score: number }>;
  };
  const firstResult = searchBody.results[0];
  const readResponse = await app.fetch(
    new Request(
      `http://localhost/v1/knowledge/curated/read?path=${encodeURIComponent("notes/project-phoenix.md")}`,
      {
        headers: { "x-shared-secret": "secret" },
      },
    ),
  );
  const readBody = (await readResponse.json()) as { content: string; path: string; title: string };

  assert.equal(searchResponse.status, 200);
  assert.ok(firstResult);
  assert.equal(firstResult.path, "notes/project-phoenix.md");
  assert.equal(typeof firstResult.score, "number");
  assert.equal(readResponse.status, 200);
  assert.equal(readBody.path, "notes/project-phoenix.md");
  assert.equal(readBody.title, "Project Phoenix");
  assert.match(readBody.content, /Alpha note/);
});

void test("returns MCP tool results and structured validation errors", async () => {
  const vaultPath = await createVaultFixture();
  const app = createApp({
    config: buildConfig(vaultPath, { allowInsecureReadAccess: true }),
    knowledgeService: createKnowledgeService(vaultPath),
    logger: noopLogger,
    queueService: queueServiceStub,
  });

  const searchResponse = await app.fetch(
    new Request("http://localhost/mcp", {
      body: JSON.stringify({
        id: 7,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: { query: "alpha" },
          name: "search_raw",
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const errorResponse = await app.fetch(
    new Request("http://localhost/mcp", {
      body: JSON.stringify({
        id: 8,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {},
          name: "read_raw",
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  const searchBody = (await searchResponse.json()) as {
    result: { structuredContent: { results: Array<{ path: string }> } };
  };
  const firstResult = searchBody.result.structuredContent.results[0];
  const errorBody = (await errorResponse.json()) as { error: { code: number } };

  assert.equal(searchResponse.status, 200);
  assert.ok(firstResult);
  assert.equal(
    firstResult.path,
    "raw/2026-04-18T10-00-00.000Z--123e4567-e89b-12d3-a456-426614174000.txt",
  );
  assert.equal(errorResponse.status, 200);
  assert.equal(errorBody.error.code, -32_602);
});
