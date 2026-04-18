import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppLogger } from "../lib/telemetry.ts";
import type { ImageAnalysisResult } from "./image-analysis.ts";
import type { MaintainerInput } from "./llm-maintainer.ts";
import type { ImageFileExtension, ImageSubmissionRecord } from "../types/submissions.ts";
import { AppError, errorCodes } from "../lib/errors.ts";
import {
  ensureDirectory,
  fileExists,
  listFilesRecursive,
  readUtf8File,
  resolveVaultPath,
  writeFileAtomic,
} from "../lib/fs.ts";
import { commitAndPushVaultScaffold } from "./git.ts";

const requiredRootFiles = ["index.md", "log.md", "overview.md", "schema.md"] as const;
const allowedRootMarkdownFiles = new Set<string>(requiredRootFiles);
const vaultGitIgnoreContents = ".obsidian/\n";
const minimumNoteSummaryLineCount = 3;

const defaultRootFileContents: Record<(typeof requiredRootFiles)[number], string> = {
  "index.md": "# Index\n\nTop-level navigation for the vault.\n",
  "log.md": "# Log\n\nChronological ingest history.\n",
  "overview.md": "# Overview\n\nHigh-level summary of the vault.\n",
  "schema.md": `# Vault Maintenance Contract

The vault contains raw captures in \`raw/\` and curated notes in \`notes/\`.

## Rules

- Keep notes concise, accurate, and reader-friendly.
- Preserve useful wiki-style links between related notes.
- Keep \`index.md\`, \`log.md\`, and \`overview.md\` useful after every ingest.
- Prefer updating existing notes when new input fits an existing topic.
- If multiple notes overlap, prefer consolidating them into one stronger note instead of creating another overlapping note.
- Create a new note only when the information does not fit cleanly into any existing durable note.
- All curated notes must live under \`notes/\`. Do not create new root-level markdown files other than \`index.md\`, \`log.md\`, \`overview.md\`, and \`schema.md\`.
- Use \`log.md\` for chronological ingest history.
- Treat \`raw/*.txt\` files as the canonical fact sources for submissions.
- When adding or updating wiki content, prefer linking concrete claims back to supporting raw files, using explicit vault links like \`[[raw/...txt]]\` when practical.
- Keep curated notes free of pipeline language like "submission URL", "share sheet", "shared text", or "ingest" unless \`log.md\` specifically needs that operational detail.
- If external URLs were fetched for context, incorporate the resulting facts naturally instead of mentioning the retrieval process in curated prose.
- Avoid heavy-handed provenance labels like \`Source:\` in curated notes when a lighter citation pattern or no visible citation would read better.
- Prefer provenance only when it genuinely helps readers, using light patterns like a short \`References\` section or inline raw links.
- Reference raw sources when they support a claim.
- Every submission must result in curated note work in \`notes/\`.
- For image ingests, update an existing note only when the match is clear; otherwise create a new note.
`,
};

export type VaultSnapshot = {
  files: Record<string, string>;
  relativeFilePaths: string[];
};

export type VaultToolset = {
  createFile: (relativePath: string, content: string) => Promise<string>;
  deleteFile: (relativePath: string) => Promise<string>;
  editFile: (relativePath: string, oldText: string, newText: string) => Promise<string>;
  listFiles: (relativePath?: string) => Promise<string[]>;
  readFile: (relativePath: string) => Promise<string>;
  renameFile: (relativePath: string, newRelativePath: string) => Promise<string>;
  writeFile: (relativePath: string, content: string) => Promise<string>;
};

export type VaultHealthCheckResult = {
  changedFiles: string[];
  diff: string;
};

const createSubmissionTimestamp = (receivedAtIso: string): string =>
  receivedAtIso.replace(/:/g, "-");

export const ensureVaultScaffold = async (
  vaultRepoPath: string,
  gitRemote: string,
  gitBranch: string,
  logger: AppLogger,
): Promise<void> => {
  await mkdir(path.join(vaultRepoPath, "raw"), { recursive: true });
  await mkdir(path.join(vaultRepoPath, "raw/assets"), { recursive: true });
  await mkdir(path.join(vaultRepoPath, "notes"), { recursive: true });

  let createdRootFileCount = 0;

  await Promise.all(
    requiredRootFiles.map(async (rootFileName) => {
      const absolutePath = resolveVaultPath(vaultRepoPath, rootFileName);

      if (await fileExists(absolutePath)) {
        return;
      }

      await writeFileAtomic(absolutePath, defaultRootFileContents[rootFileName]);
      createdRootFileCount += 1;
    }),
  );

  const gitIgnorePath = resolveVaultPath(vaultRepoPath, ".gitignore");
  const existingGitIgnore = (await fileExists(gitIgnorePath))
    ? await readUtf8File(gitIgnorePath)
    : "";
  const wroteGitIgnore = existingGitIgnore !== vaultGitIgnoreContents;

  if (wroteGitIgnore) {
    await writeFileAtomic(gitIgnorePath, vaultGitIgnoreContents);
  }

  if (createdRootFileCount === 0 && !wroteGitIgnore) {
    return;
  }

  const gitResult = await commitAndPushVaultScaffold(vaultRepoPath, gitRemote, gitBranch, logger);

  logger.info({
    body: "Committed and pushed vault scaffold changes.",
    attributes: {
      changedFileCount: gitResult.changedFiles.length,
      commitSha: gitResult.commitSha,
      createdRootFileCount,
      diff: gitResult.diff,
      wroteGitIgnore,
    },
  });
};

export const createRawTextSourcePath = (submissionId: string, receivedAtIso: string): string => {
  const timestamp = createSubmissionTimestamp(receivedAtIso);
  return `raw/${timestamp}--${submissionId}.txt`;
};

export const createRawImageAssetPath = (
  submissionId: string,
  receivedAtIso: string,
  extension: ImageFileExtension,
): string => {
  const timestamp = createSubmissionTimestamp(receivedAtIso);
  return `raw/assets/${timestamp}--${submissionId}.${extension}`;
};

export const createRawImageMetadataPath = (submissionId: string, receivedAtIso: string): string => {
  const timestamp = createSubmissionTimestamp(receivedAtIso);
  return `raw/${timestamp}--${submissionId}.md`;
};

export const writeRawTextSourceFile = async (
  vaultRepoPath: string,
  rawSourceRelativePath: string,
  payloadText: string,
): Promise<void> => {
  const absolutePath = resolveVaultPath(vaultRepoPath, rawSourceRelativePath);
  await writeFileAtomic(absolutePath, payloadText);
};

export const writeRawImageAssetFile = async (
  vaultRepoPath: string,
  rawAssetRelativePath: string,
  imageBytes: Uint8Array,
): Promise<void> => {
  const absolutePath = resolveVaultPath(vaultRepoPath, rawAssetRelativePath);
  await writeFileAtomic(absolutePath, imageBytes);
};

const renderMetadataLine = (label: string, value?: string | number): string => {
  return `- ${label}: ${value ?? "unknown"}`;
};

export const buildImageRawMarkdown = (options: {
  analysis?: ImageAnalysisResult;
  rawAssetPath: string;
  submission: ImageSubmissionRecord;
}): string => {
  const { analysis, rawAssetPath, submission } = options;

  return [
    "# Image Submission",
    "",
    "## Metadata",
    renderMetadataLine("submissionId", submission.submissionId),
    renderMetadataLine("capturedAt", submission.capturedAt),
    renderMetadataLine("receivedAt", submission.receivedAt),
    renderMetadataLine("sourceApp", submission.sourceApp),
    renderMetadataLine("rawAssetPath", rawAssetPath),
    renderMetadataLine("mimeType", submission.image.mimeType),
    renderMetadataLine("fileSizeBytes", submission.image.sizeBytes),
    renderMetadataLine("imageSha256", submission.image.sha256),
    renderMetadataLine("originalFilename", submission.image.originalFilename),
    "",
    "## Caption",
    submission.captionText ?? "_No caption provided._",
    "",
    "## Image Analysis",
    ...(analysis
      ? [
          renderMetadataLine("classification", analysis.classification),
          "",
          "### Description",
          analysis.description,
          "",
          "### OCR Text",
          analysis.ocrText.length > 0 ? analysis.ocrText : "_No readable text detected._",
          "",
          "### Detected Entities",
          analysis.detectedEntities.length > 0
            ? analysis.detectedEntities.map((entity) => `- ${entity}`).join("\n")
            : "_No prominent entities detected._",
          "",
          "### Uncertainty",
          analysis.uncertainty,
        ]
      : ["_Pending analysis._"]),
    "",
  ].join("\n");
};

const getSnapshotPaths = async (vaultRepoPath: string): Promise<string[]> => {
  const allFiles = await listFilesRecursive(vaultRepoPath);

  return allFiles.filter((filePath) => filePath !== ".git" && !filePath.startsWith(".git/"));
};

export const readVaultSnapshot = async (vaultRepoPath: string): Promise<VaultSnapshot> => {
  const relativeFilePaths = await getSnapshotPaths(vaultRepoPath);
  const files = Object.fromEntries(
    await Promise.all(
      relativeFilePaths.map(async (relativeFilePath) => {
        const content = await readFile(resolveVaultPath(vaultRepoPath, relativeFilePath));
        return [relativeFilePath, content.toString("base64")] as const;
      }),
    ),
  );

  return { files, relativeFilePaths };
};

export const buildMaintainerContext = async (
  vaultRepoPath: string,
  input: MaintainerInput,
): Promise<string> => {
  const allFiles = await getSnapshotPaths(vaultRepoPath);
  const preferredPaths = allFiles.filter(
    (filePath) =>
      filePath === input.rawSourcePath ||
      filePath === "index.md" ||
      filePath === "log.md" ||
      filePath === "overview.md" ||
      filePath === "schema.md" ||
      filePath.startsWith("notes/"),
  );

  const sections = await Promise.all(
    preferredPaths.map(async (filePath) => {
      const content = await readUtf8File(resolveVaultPath(vaultRepoPath, filePath));
      return [`--- FILE: ${filePath} ---`, content.trimEnd(), `--- END FILE: ${filePath} ---`].join(
        "\n",
      );
    }),
  );

  return sections.join("\n\n");
};

const normalizeRelativePath = (relativePath: string): string => relativePath.replace(/\\/g, "/");

const assertWritableVaultPath = (relativePath: string): void => {
  const normalizedPath = normalizeRelativePath(relativePath);
  const isMarkdownFile = normalizedPath.endsWith(".md");
  const isTextFile = normalizedPath.endsWith(".txt");
  const isRootLevel = !normalizedPath.includes("/");

  if (isMarkdownFile) {
    if (isRootLevel) {
      if (allowedRootMarkdownFiles.has(normalizedPath)) {
        return;
      }

      throw new AppError({
        code: errorCodes.validation,
        message: `Unexpected root-level markdown file: ${relativePath}`,
        statusCode: 400,
        details: { relativePath },
      });
    }

    if (!normalizedPath.startsWith("notes/")) {
      throw new AppError({
        code: errorCodes.validation,
        message: `Markdown notes must live under notes/: ${relativePath}`,
        statusCode: 400,
        details: { relativePath },
      });
    }

    return;
  }

  if (isTextFile && !normalizedPath.startsWith("raw/")) {
    throw new AppError({
      code: errorCodes.validation,
      message: `Raw text files must live under raw/: ${relativePath}`,
      statusCode: 400,
      details: { relativePath },
    });
  }
};

export const getChangedVaultFilesSinceSnapshot = async (
  vaultRepoPath: string,
  snapshot: VaultSnapshot,
): Promise<string[]> => {
  const currentSnapshot = await readVaultSnapshot(vaultRepoPath);
  const candidatePaths = new Set([
    ...snapshot.relativeFilePaths,
    ...currentSnapshot.relativeFilePaths,
  ]);

  return [...candidatePaths]
    .filter((filePath) => snapshot.files[filePath] !== currentSnapshot.files[filePath])
    .sort((left, right) => left.localeCompare(right));
};

export const createVaultToolset = (vaultRepoPath: string, logger: AppLogger): VaultToolset => {
  const readFileFromVault = async (relativePath: string): Promise<string> => {
    const absolutePath = resolveVaultPath(vaultRepoPath, relativePath);
    return readUtf8File(absolutePath);
  };

  const writeFileToVault = async (relativePath: string, content: string): Promise<string> => {
    assertWritableVaultPath(relativePath);
    const absolutePath = resolveVaultPath(vaultRepoPath, relativePath);
    await writeFileAtomic(absolutePath, content);
    logger.info({ body: "Vault file written.", attributes: { filePath: relativePath } });
    return `Wrote ${relativePath}`;
  };

  return {
    createFile: async (relativePath, content) => writeFileToVault(relativePath, content),
    deleteFile: async (relativePath) => {
      const absolutePath = resolveVaultPath(vaultRepoPath, relativePath);
      await unlink(absolutePath);
      logger.info({ body: "Vault file deleted.", attributes: { filePath: relativePath } });
      return `Deleted ${relativePath}`;
    },
    editFile: async (relativePath, oldText, newText) => {
      const absolutePath = resolveVaultPath(vaultRepoPath, relativePath);
      const existingContent = await readUtf8File(absolutePath);
      const matchCount = existingContent.split(oldText).length - 1;

      if (matchCount === 0 && existingContent.includes(newText)) {
        logger.info({
          body: "Vault edit skipped because desired content already exists.",
          attributes: { filePath: relativePath },
        });
        return `Skipped ${relativePath}; desired content already present`;
      }

      if (matchCount !== 1) {
        throw new AppError({
          code: errorCodes.validation,
          message: `Expected exactly one match while editing ${relativePath}.`,
          statusCode: 400,
          details: { matchCount, relativePath },
        });
      }

      await writeFileToVault(relativePath, existingContent.replace(oldText, newText));
      return `Edited ${relativePath}`;
    },
    listFiles: async (relativePath) => {
      const scopedDirectory = relativePath
        ? resolveVaultPath(vaultRepoPath, relativePath)
        : vaultRepoPath;
      const scopedFiles = await listFilesRecursive(scopedDirectory);
      const files = relativePath
        ? scopedFiles.map((filePath) => path.posix.join(relativePath, filePath))
        : scopedFiles;

      return files.sort((left, right) => left.localeCompare(right));
    },
    readFile: readFileFromVault,
    renameFile: async (relativePath, newRelativePath) => {
      assertWritableVaultPath(newRelativePath);
      const currentAbsolutePath = resolveVaultPath(vaultRepoPath, relativePath);
      const nextAbsolutePath = resolveVaultPath(vaultRepoPath, newRelativePath);
      await ensureDirectory(path.dirname(nextAbsolutePath));
      await rename(currentAbsolutePath, nextAbsolutePath);
      logger.info({
        body: "Vault file renamed.",
        attributes: { filePath: relativePath, newFilePath: newRelativePath },
      });
      return `Renamed ${relativePath} to ${newRelativePath}`;
    },
    writeFile: writeFileToVault,
  };
};

const validateChangedFiles = (changedFiles: string[]): void => {
  for (const filePath of changedFiles) {
    const normalizedPath = normalizeRelativePath(filePath);

    if (
      normalizedPath.endsWith(".md") &&
      !normalizedPath.includes("/") &&
      !allowedRootMarkdownFiles.has(normalizedPath)
    ) {
      throw new AppError({
        code: errorCodes.validation,
        message: `Unexpected root-level markdown file: ${filePath}`,
        statusCode: 500,
        details: { filePath },
      });
    }
  }
};

const validateNotes = async (vaultRepoPath: string, changedFiles: string[]): Promise<void> => {
  const noteRelativePaths = changedFiles
    .filter((filePath) => filePath.startsWith("notes/"))
    .sort((left, right) => left.localeCompare(right));

  await Promise.all(
    noteRelativePaths.map(async (noteRelativePath) => {
      const absolutePath = resolveVaultPath(vaultRepoPath, noteRelativePath);

      if (!(await fileExists(absolutePath))) {
        return;
      }

      const content = await readUtf8File(absolutePath);
      const trimmed = content.trim();

      if (trimmed.length === 0) {
        throw new AppError({
          code: errorCodes.validation,
          message: `Note file is empty: ${noteRelativePath}`,
          statusCode: 500,
        });
      }

      const lines = trimmed.split("\n");
      const summaryLine = lines.slice(1).find((line) => line.trim().length > 0);

      if (!lines[0]?.startsWith("# ")) {
        throw new AppError({
          code: errorCodes.validation,
          message: `Note file must start with a markdown title: ${noteRelativePath}`,
          statusCode: 500,
        });
      }

      if (lines.length < minimumNoteSummaryLineCount || !summaryLine) {
        throw new AppError({
          code: errorCodes.validation,
          message: `Note file must include a summary paragraph below the title: ${noteRelativePath}`,
          statusCode: 500,
        });
      }
    }),
  );
};

export const assertVaultHealth = async (
  vaultRepoPath: string,
  changedFiles: string[],
): Promise<void> => {
  const stats = await stat(vaultRepoPath);

  if (!stats.isDirectory()) {
    throw new AppError({
      code: errorCodes.filesystem,
      message: "Vault repository path is not a directory.",
      statusCode: 500,
    });
  }

  await Promise.all(
    requiredRootFiles.map(async (rootFile) => {
      const rootPath = resolveVaultPath(vaultRepoPath, rootFile);

      if (!(await fileExists(rootPath))) {
        throw new AppError({
          code: errorCodes.filesystem,
          message: `Required vault file is missing: ${rootFile}`,
          statusCode: 500,
        });
      }
    }),
  );

  if (changedFiles.length === 0) {
    throw new AppError({
      code: errorCodes.validation,
      message: "Vault changes are empty; nothing to commit.",
      statusCode: 500,
    });
  }

  validateChangedFiles(changedFiles);
  await validateNotes(vaultRepoPath, changedFiles);
};

export const restoreVaultFromSnapshot = async (
  vaultRepoPath: string,
  snapshot: VaultSnapshot,
): Promise<void> => {
  const currentFiles = await getSnapshotPaths(vaultRepoPath);
  const snapshotFiles = new Set(snapshot.relativeFilePaths);

  await Promise.all(
    currentFiles
      .filter((filePath) => !snapshotFiles.has(filePath))
      .map(async (filePath) => {
        await rm(resolveVaultPath(vaultRepoPath, filePath), { force: true });
      }),
  );

  await Promise.all(
    snapshot.relativeFilePaths.map(async (relativeFilePath) => {
      const absolutePath = resolveVaultPath(vaultRepoPath, relativeFilePath);
      await ensureDirectory(path.dirname(absolutePath));
      await writeFile(absolutePath, Buffer.from(snapshot.files[relativeFilePath] ?? "", "base64"));
    }),
  );
};
