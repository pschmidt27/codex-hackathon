import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { createKnowledgeService } from "./knowledge.ts";

const createVaultFixture = async (): Promise<string> => {
  const vaultPath = await mkdtemp(path.join(tmpdir(), "pkb-knowledge-test-"));

  await mkdir(path.join(vaultPath, "notes"), { recursive: true });
  await mkdir(path.join(vaultPath, "raw"), { recursive: true });

  await Promise.all([
    writeFile(
      path.join(vaultPath, "index.md"),
      "# Index\n\nSee [[Project Phoenix]] and [[Quiet body note]].\n",
      "utf8",
    ),
    writeFile(
      path.join(vaultPath, "overview.md"),
      "# Overview\n\nProject Phoenix is the main focus this week.\n",
      "utf8",
    ),
    writeFile(path.join(vaultPath, "log.md"), "# Log\n\n", "utf8"),
    writeFile(
      path.join(vaultPath, "schema.md"),
      "# Schema\n\nThis file should not appear in curated search results.\n",
      "utf8",
    ),
    writeFile(
      path.join(vaultPath, "notes/project-phoenix.md"),
      "# Project Phoenix\n\nProject Phoenix is the launch project for the vault.\nraw/2026-04-18T11-45-00.000Z--123e4567-e89b-12d3-a456-426614174000.txt\n",
      "utf8",
    ),
    writeFile(
      path.join(vaultPath, "notes/quiet-body-note.md"),
      "# Quiet body note\n\nThis note only mentions umbrella in the body text.\n",
      "utf8",
    ),
    writeFile(
      path.join(vaultPath, "raw/2026-04-18T11-45-00.000Z--123e4567-e89b-12d3-a456-426614174000.txt"),
      "Phoenix capture from mobile share.",
      "utf8",
    ),
    writeFile(
      path.join(vaultPath, "raw/2026-04-18T12-30-00.000Z--223e4567-e89b-12d3-a456-426614174001.txt"),
      "Second capture mentioning umbrella and weather.",
      "utf8",
    ),
  ]);

  return vaultPath;
};

const vaultPath = await createVaultFixture();
const knowledgeService = createKnowledgeService(vaultPath);

after(async () => {
  await rm(vaultPath, { force: true, recursive: true });
});

void test("ranks title and path matches above body-only matches", async () => {
  const results = await knowledgeService.searchCurated("umbrella", 5);
  const umbrellaResult = results[0];

  assert.equal(results.length, 1);
  assert.ok(umbrellaResult);
  assert.equal(umbrellaResult.path, "notes/quiet-body-note.md");

  const phoenixResults = await knowledgeService.searchCurated("phoenix", 5);
  const firstResult = phoenixResults[0];

  assert.ok(firstResult);
  assert.equal(firstResult.path, "notes/project-phoenix.md");
  assert.match(firstResult.snippet, /Project Phoenix/i);
});

void test("keeps curated and raw corpora separated", async () => {
  const curatedResults = await knowledgeService.searchCurated("mobile share", 5);
  const rawResults = await knowledgeService.searchRaw("mobile share", 5);
  const rawResult = rawResults[0];

  assert.equal(curatedResults.length, 0);
  assert.ok(rawResult);
  assert.equal(
    rawResult.path,
    "raw/2026-04-18T11-45-00.000Z--123e4567-e89b-12d3-a456-426614174000.txt",
  );
});

void test("rejects invalid curated and raw paths", async () => {
  await assert.rejects(
    knowledgeService.readCurated("schema.md"),
    /not accessible through curated knowledge APIs/i,
  );
  await assert.rejects(
    knowledgeService.readRaw("../notes/project-phoenix.md"),
    /not accessible through raw knowledge APIs/i,
  );
});

void test("returns recent ingests in descending receivedAt order with related curated paths", async () => {
  const results = await knowledgeService.listRecentIngests(2);
  const latestResult = results[0];
  const olderResult = results[1];

  assert.equal(results.length, 2);
  assert.ok(latestResult);
  assert.equal(latestResult.submissionId, "223e4567-e89b-12d3-a456-426614174001");
  assert.ok(olderResult);
  assert.equal(olderResult.relatedCuratedPaths[0], "notes/project-phoenix.md");
  assert.equal(olderResult.receivedAt, "2026-04-18T11:45:00.000Z");
});
