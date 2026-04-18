import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants as fileConstants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AppError, errorCodes } from "./errors.ts";

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, fileConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const ensureDirectory = async (directoryPath: string): Promise<void> => {
  await mkdir(directoryPath, { recursive: true });
};

export const resolveVaultPath = (vaultRootPath: string, relativeFilePath: string): string => {
  const sanitizedRelativePath = relativeFilePath.replace(/\\/g, "/");
  const resolvedPath = path.resolve(vaultRootPath, sanitizedRelativePath);
  const relativeToRoot = path.relative(vaultRootPath, resolvedPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new AppError({
      code: errorCodes.validation,
      message: `Path escapes vault root: ${relativeFilePath}`,
      statusCode: 400,
      details: { relativeFilePath },
    });
  }

  return resolvedPath;
};

export const writeFileAtomic = async (targetPath: string, content: string): Promise<void> => {
  await ensureDirectory(path.dirname(targetPath));

  const tempDirectory = await mkdtemp(path.join(tmpdir(), "pkb-backend-"));
  const tempPath = path.join(tempDirectory, path.basename(targetPath));

  try {
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, targetPath);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};

export const readUtf8File = async (filePath: string): Promise<string> => readFile(filePath, "utf8");

export const copyFileIntoDirectory = async (
  sourcePath: string,
  targetPath: string,
): Promise<void> => {
  await ensureDirectory(path.dirname(targetPath));
  await copyFile(sourcePath, targetPath);
};

const listFilesRecursiveInternal = async (
  directoryPath: string,
  rootPath: string,
): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return listFilesRecursiveInternal(absolutePath, rootPath);
      }

      if (!entry.isFile()) {
        return [];
      }

      return [path.relative(rootPath, absolutePath).replace(/\\/g, "/")];
    }),
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
};

export const listFilesRecursive = async (directoryPath: string): Promise<string[]> => {
  if (!(await fileExists(directoryPath))) {
    return [];
  }

  return listFilesRecursiveInternal(directoryPath, directoryPath);
};
