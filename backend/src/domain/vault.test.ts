import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { AppError } from "../lib/errors.ts";
import {
  assertVaultHealth,
  createVaultToolset,
  getChangedVaultFilesSinceSnapshot,
  readVaultSnapshot,
} from "./vault.ts";
import type { AppLogger } from "../lib/telemetry.ts";

const noop = (): void => undefined;

const noopLogger: AppLogger = {
  debug: noop,
  error: noop,
  info: noop,
  warn: noop,
};

const temporaryVaults: string[] = [];

const createVaultFixture = async (): Promise<string> => {
  const vaultPath = await mkdtemp(path.join(tmpdir(), "pkb-vault-test-"));
  temporaryVaults.push(vaultPath);

  await mkdir(path.join(vaultPath, "notes"), { recursive: true });
  await mkdir(path.join(vaultPath, "raw"), { recursive: true });

  await Promise.all([
    writeFile(path.join(vaultPath, "index.md"), "# Index\n\n", "utf8"),
    writeFile(path.join(vaultPath, "overview.md"), "# Overview\n\n", "utf8"),
    writeFile(path.join(vaultPath, "log.md"), "# Log\n\n", "utf8"),
    writeFile(path.join(vaultPath, "schema.md"), "# Schema\n\n", "utf8"),
    writeFile(path.join(vaultPath, "notes/existing-note.md"), "# Existing Note\n\nSummary.\n", "utf8"),
    writeFile(path.join(vaultPath, "raw/source.txt"), "raw source", "utf8"),
  ]);

  return vaultPath;
};

afterEach(async () => {
  await Promise.all(
    temporaryVaults.splice(0).map(async (vaultPath) => rm(vaultPath, { force: true, recursive: true })),
  );
});

void test("createVaultToolset rejects unexpected root-level markdown files", async () => {
  const vaultPath = await createVaultFixture();
  const toolset = createVaultToolset(vaultPath, noopLogger);

  await assert.rejects(() => toolset.createFile("rogue-note.md", "# Rogue\n\nSummary.\n"), {
    message: "Unexpected root-level markdown file: rogue-note.md",
    name: "AppError",
  });
});

void test("assertVaultHealth rejects actual changed root-level markdown files", async () => {
  const vaultPath = await createVaultFixture();
  const snapshot = await readVaultSnapshot(vaultPath);
  await writeFile(path.join(vaultPath, "rogue-note.md"), "# Rogue\n\nSummary.\n", "utf8");

  const changedFiles = await getChangedVaultFilesSinceSnapshot(vaultPath, snapshot);

  await assert.rejects(() => assertVaultHealth(vaultPath, changedFiles), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.message, "Unexpected root-level markdown file: rogue-note.md");
    return true;
  });
});
