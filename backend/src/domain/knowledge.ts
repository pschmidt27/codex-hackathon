import { stat } from "node:fs/promises";
import path from "node:path";

import type {
  KnowledgeReadResult,
  KnowledgeSearchResult,
  RecentIngestResult,
} from "../types/knowledge.ts";
import { AppError, errorCodes } from "../lib/errors.ts";
import { listFilesRecursive, readUtf8File, resolveVaultPath } from "../lib/fs.ts";

const defaultSearchLimit = 5;
const defaultRecentLimit = 5;
const maxResultLimit = 20;
const curatedRootFiles = new Set(["index.md", "log.md", "overview.md"]);

type SearchCandidate = {
  content: string;
  path: string;
  title: string;
};

export type KnowledgeService = {
  listRecentIngests: (limit?: number) => Promise<RecentIngestResult[]>;
  readCurated: (relativePath: string) => Promise<KnowledgeReadResult>;
  readRaw: (relativePath: string) => Promise<KnowledgeReadResult>;
  searchCurated: (query: string, limit?: number) => Promise<KnowledgeSearchResult[]>;
  searchRaw: (query: string, limit?: number) => Promise<KnowledgeSearchResult[]>;
};

const normalizeRelativePath = (relativePath: string): string => {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+/g, "/");
};

export const isAllowedCuratedPath = (relativePath: string): boolean => {
  const normalizedPath = normalizeRelativePath(relativePath);

  return curatedRootFiles.has(normalizedPath) || /^notes\/.+\.md$/u.test(normalizedPath);
};

export const isAllowedRawPath = (relativePath: string): boolean => {
  const normalizedPath = normalizeRelativePath(relativePath);

  return /^raw\/.+\.txt$/u.test(normalizedPath);
};

const ensureAllowedPath = (
  relativePath: string,
  predicate: (value: string) => boolean,
  label: "curated" | "raw",
): string => {
  const normalizedPath = normalizeRelativePath(relativePath);

  if (!predicate(normalizedPath)) {
    throw new AppError({
      code: errorCodes.validation,
      message: `Path is not accessible through ${label} knowledge APIs.`,
      statusCode: 400,
      details: { relativePath: normalizedPath },
    });
  }

  return normalizedPath;
};

const parseLimit = (value: number | undefined, label: string): number => {
  if (value === undefined) {
    return label === "search" ? defaultSearchLimit : defaultRecentLimit;
  }

  if (!Number.isInteger(value) || value < 1 || value > maxResultLimit) {
    throw new AppError({
      code: errorCodes.validation,
      message: `${label} limit must be an integer between 1 and ${maxResultLimit}.`,
      statusCode: 400,
      details: { limit: value },
    });
  }

  return value;
};

const parseQuery = (query: string): { normalizedQuery: string; queryTerms: string[] } => {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    throw new AppError({
      code: errorCodes.validation,
      message: "Query must not be blank.",
      statusCode: 400,
    });
  }

  return {
    normalizedQuery,
    queryTerms: normalizedQuery.split(/\s+/u).filter((term) => term.length > 0),
  };
};

const countOccurrences = (haystack: string, needle: string): number => {
  if (needle.length === 0) {
    return 0;
  }

  let count = 0;
  let cursor = 0;

  while (cursor <= haystack.length - needle.length) {
    const foundAt = haystack.indexOf(needle, cursor);

    if (foundAt === -1) {
      break;
    }

    count += 1;
    cursor = foundAt + needle.length;
  }

  return count;
};

const collapseWhitespace = (value: string): string => value.replace(/\s+/gu, " ").trim();

const extractMarkdownTitle = (content: string, relativePath: string): string => {
  const firstLine = content.split("\n", 1)[0]?.trim() ?? "";

  if (firstLine.startsWith("# ")) {
    return firstLine.slice(2).trim();
  }

  return path.basename(relativePath, path.extname(relativePath));
};

const extractSnippet = (content: string, searchTerms: string[], title: string): string => {
  const condensedContent = collapseWhitespace(content);
  const haystack = condensedContent.length > 0 ? condensedContent : title;
  const normalizedHaystack = haystack.toLowerCase();

  let matchIndex = -1;

  for (const term of searchTerms) {
    const foundAt = normalizedHaystack.indexOf(term);

    if (foundAt !== -1 && (matchIndex === -1 || foundAt < matchIndex)) {
      matchIndex = foundAt;
    }
  }

  if (matchIndex === -1) {
    return haystack.slice(0, 180);
  }

  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(haystack.length, matchIndex + 120);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < haystack.length ? "..." : "";

  return `${prefix}${haystack.slice(start, end)}${suffix}`;
};

const buildSearchScore = (
  candidate: SearchCandidate,
  normalizedQuery: string,
  queryTerms: string[],
): number => {
  const normalizedPath = candidate.path.toLowerCase();
  const normalizedTitle = candidate.title.toLowerCase();
  const normalizedContent = candidate.content.toLowerCase();
  let score = 0;

  if (normalizedPath.includes(normalizedQuery)) {
    score += 30;
  }

  if (normalizedTitle.includes(normalizedQuery)) {
    score += 50;
  }

  if (normalizedContent.includes(normalizedQuery)) {
    score += 10;
  }

  for (const term of queryTerms) {
    score += countOccurrences(normalizedPath, term) * 12;
    score += countOccurrences(normalizedTitle, term) * 20;
    score += countOccurrences(normalizedContent, term) * 4;
  }

  return score;
};

const parseRawFilenameMetadata = (
  relativePath: string,
): { receivedAt?: string; submissionId?: string } => {
  if (!relativePath.startsWith("raw/") || !relativePath.endsWith(".txt")) {
    return {};
  }

  const trimmedPath = relativePath.slice(4, -4);
  const separatorIndex = trimmedPath.lastIndexOf("--");

  if (separatorIndex === -1) {
    return {};
  }

  const rawTimestamp = trimmedPath.slice(0, separatorIndex);
  const submissionId = trimmedPath.slice(separatorIndex + 2);

  if (rawTimestamp.length === 0 || submissionId.length === 0) {
    return {};
  }

  const restoredTimestamp = rawTimestamp.replace(
    /T(\d{2})-(\d{2})-(\d{2}(?:\.\d+)?Z)$/u,
    "T$1:$2:$3",
  );

  return {
    ...(restoredTimestamp.length > 0 ? { receivedAt: restoredTimestamp } : {}),
    ...(submissionId.length > 0 ? { submissionId } : {}),
  };
};

const readDocument = async (
  vaultRepoPath: string,
  relativePath: string,
  titleResolver: (content: string, relativePath: string) => string,
  contentType: "markdown" | "text",
): Promise<KnowledgeReadResult> => {
  const absolutePath = resolveVaultPath(vaultRepoPath, relativePath);
  const [content, fileStats] = await Promise.all([readUtf8File(absolutePath), stat(absolutePath)]);
  const title = titleResolver(content, relativePath);

  return {
    content,
    contentType,
    path: relativePath,
    title,
    updatedAt: fileStats.mtime.toISOString(),
  };
};

const buildSearchResults = async (options: {
  filePaths: string[];
  limit: number | undefined;
  query: string;
  titleResolver: (content: string, relativePath: string) => string;
  vaultRepoPath: string;
}): Promise<KnowledgeSearchResult[]> => {
  const { normalizedQuery, queryTerms } = parseQuery(options.query);
  const limit = parseLimit(options.limit, "search");
  const candidates = await Promise.all(
    options.filePaths.map(async (relativePath) => {
      const absolutePath = resolveVaultPath(options.vaultRepoPath, relativePath);
      const content = await readUtf8File(absolutePath);
      const title = options.titleResolver(content, relativePath);

      return {
        content,
        path: relativePath,
        title,
      } satisfies SearchCandidate;
    }),
  );

  return candidates
    .map((candidate) => {
      const score = buildSearchScore(candidate, normalizedQuery, queryTerms);

      return {
        path: candidate.path,
        score,
        snippet: extractSnippet(candidate.content, queryTerms, candidate.title),
        title: candidate.title,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.path.localeCompare(right.path);
    })
    .slice(0, limit);
};

const listCuratedPaths = async (vaultRepoPath: string): Promise<string[]> => {
  const filePaths = await listFilesRecursive(vaultRepoPath);

  return filePaths.filter((relativePath) => isAllowedCuratedPath(relativePath));
};

const listRawPaths = async (vaultRepoPath: string): Promise<string[]> => {
  const filePaths = await listFilesRecursive(vaultRepoPath);

  return filePaths.filter((relativePath) => isAllowedRawPath(relativePath));
};

export const createKnowledgeService = (vaultRepoPath: string): KnowledgeService => {
  return {
    listRecentIngests: async (limit) => {
      const parsedLimit = parseLimit(limit, "recent");
      const [curatedPaths, rawPaths] = await Promise.all([
        listCuratedPaths(vaultRepoPath),
        listRawPaths(vaultRepoPath),
      ]);
      const curatedContents = Object.fromEntries(
        await Promise.all(
          curatedPaths.map(async (relativePath) => {
            const absolutePath = resolveVaultPath(vaultRepoPath, relativePath);
            return [relativePath, await readUtf8File(absolutePath)] as const;
          }),
        ),
      );

      return Promise.all(
        rawPaths
          .map((relativePath) => ({
            metadata: parseRawFilenameMetadata(relativePath),
            path: relativePath,
          }))
          .sort((left, right) => {
            if (left.metadata.receivedAt && right.metadata.receivedAt) {
              return right.metadata.receivedAt.localeCompare(left.metadata.receivedAt);
            }

            return right.path.localeCompare(left.path);
          })
          .slice(0, parsedLimit)
          .map(async ({ metadata, path: relativePath }) => {
            const absolutePath = resolveVaultPath(vaultRepoPath, relativePath);
            const content = await readUtf8File(absolutePath);

            return {
              ...(metadata.receivedAt ? { receivedAt: metadata.receivedAt } : {}),
              path: relativePath,
              relatedCuratedPaths: curatedPaths.filter((candidatePath) =>
                curatedContents[candidatePath]?.includes(relativePath),
              ),
              snippet: collapseWhitespace(content).slice(0, 180),
              ...(metadata.submissionId ? { submissionId: metadata.submissionId } : {}),
              title: path.basename(relativePath, ".txt"),
            } satisfies RecentIngestResult;
          }),
      );
    },
    readCurated: async (relativePath) => {
      const validatedPath = ensureAllowedPath(relativePath, isAllowedCuratedPath, "curated");

      return readDocument(vaultRepoPath, validatedPath, extractMarkdownTitle, "markdown");
    },
    readRaw: async (relativePath) => {
      const validatedPath = ensureAllowedPath(relativePath, isAllowedRawPath, "raw");

      return readDocument(
        vaultRepoPath,
        validatedPath,
        (_content, currentPath) => path.basename(currentPath, ".txt"),
        "text",
      );
    },
    searchCurated: async (query, limit) => {
      const filePaths = await listCuratedPaths(vaultRepoPath);

      return buildSearchResults({
        filePaths,
        limit,
        query,
        titleResolver: extractMarkdownTitle,
        vaultRepoPath,
      });
    },
    searchRaw: async (query, limit) => {
      const filePaths = await listRawPaths(vaultRepoPath);

      return buildSearchResults({
        filePaths,
        limit,
        query,
        titleResolver: (_content, relativePath) => path.basename(relativePath, ".txt"),
        vaultRepoPath,
      });
    },
  };
};
