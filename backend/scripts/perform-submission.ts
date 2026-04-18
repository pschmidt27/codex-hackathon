#!/usr/bin/env node
/* eslint-disable n/no-process-env */
/* eslint-disable n/no-process-exit */
/* eslint-disable no-console */

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const defaultUrl = "http://127.0.0.1:3000/v1/submissions";
const sharedSecretHeaderName = "x-shared-secret";

type SubmissionRequest = {
  capturedAt?: string;
  sourceApp?: string;
  submissionId: string;
  text: string;
};

const printUsage = (): void => {
  console.error(`Usage:
  node scripts/perform-submission.ts --text "My submission"
  node scripts/perform-submission.ts --file ./submission.txt

Options:
  --url <url>              Submission endpoint URL
                           Default: ${defaultUrl}
  --text <text>            Submission text payload
  --file <path>            Read submission text from a file
  --submission-id <uuid>   Submission ID to send
                           Default: randomly generated UUID
  --source-app <name>      Optional sourceApp value
  --captured-at <iso>      Optional capturedAt ISO-8601 timestamp
  --shared-secret <value>  Optional value for ${sharedSecretHeaderName}
  --help                   Show this help message

Environment variables:
  SUBMISSION_URL
  SUBMISSION_TEXT
  SUBMISSION_FILE
  SUBMISSION_ID
  SUBMISSION_SOURCE_APP
  SUBMISSION_CAPTURED_AT
  AUTH_SHARED_SECRET
`);
};

const fail = (message: string): never => {
  console.error(`Error: ${message}`);
  process.exit(1);
};

const readSubmissionText = async (text?: string, filePath?: string): Promise<string> => {
  if (text && filePath) {
    fail("Provide either --text or --file, not both.");
  }

  if (typeof text === "string") {
    return text;
  }

  if (typeof filePath === "string") {
    return readFile(filePath, "utf8");
  }

  throw new Error(
    "Submission text not provided. Use --text or --file option, or set SUBMISSION_TEXT or SUBMISSION_FILE environment variable.",
  );
};

const validateIsoDatetime = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    fail(`Invalid ISO datetime: ${value}`);
  }

  return value;
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "captured-at": { type: "string" },
      file: { type: "string" },
      help: { type: "boolean", short: "h" },
      "shared-secret": { type: "string" },
      "source-app": { type: "string" },
      "submission-id": { type: "string" },
      text: { type: "string" },
      url: { type: "string" },
    },
    strict: true,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const url = values.url ?? process.env["SUBMISSION_URL"] ?? defaultUrl;
  const submissionId = values["submission-id"] ?? process.env["SUBMISSION_ID"] ?? randomUUID();
  const sourceApp = values["source-app"] ?? process.env["SUBMISSION_SOURCE_APP"];
  const capturedAtRaw = values["captured-at"] ?? process.env["SUBMISSION_CAPTURED_AT"];
  const sharedSecret = values["shared-secret"] ?? process.env["AUTH_SHARED_SECRET"];
  const text = await readSubmissionText(
    values.text ?? process.env["SUBMISSION_TEXT"],
    values.file ?? process.env["SUBMISSION_FILE"],
  );

  const body: SubmissionRequest = {
    submissionId,
    text,
    ...(sourceApp ? { sourceApp } : {}),
    ...(capturedAtRaw ? { capturedAt: validateIsoDatetime(capturedAtRaw) } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sharedSecret ? { [sharedSecretHeaderName]: sharedSecret } : {}),
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  const parsedBody = responseText
    ? (() => {
        try {
          return JSON.parse(responseText) as unknown;
        } catch {
          return responseText;
        }
      })()
    : null;

  console.log(
    JSON.stringify(
      {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        body: parsedBody,
      },
      null,
      2,
    ),
  );

  if (!response.ok) {
    // eslint-disable-next-line require-atomic-updates
    process.exitCode = 1;
  }
};

await main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
