import { logs } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";

import type { Config } from "../config.ts";

type LoggerAttributes = Record<string, string | number | boolean | undefined>;

type LoggerMethodInput = {
  body: string;
  attributes?: LoggerAttributes;
};

export type AppLogger = {
  debug: (input: LoggerMethodInput) => void;
  info: (input: LoggerMethodInput) => void;
  warn: (input: LoggerMethodInput) => void;
  error: (input: LoggerMethodInput) => void;
};

export type TelemetryHandle = {
  logger: AppLogger;
  shutdown: () => Promise<void>;
};

export const createTelemetry = (config: Config): TelemetryHandle => {
  const resource = resourceFromAttributes({
    "service.name": "personal-knowledge-base-backend",
    "service.version": "0.1.0",
    "vault.repo.path": config.vaultRepoPath,
  });

  const sdk = new NodeSDK({
    autoDetectResources: true,
    resource,
  });
  sdk.start();

  const loggerProvider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())],
    resource,
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  const logger = logs.getLogger("personal-knowledge-base-backend");

  const emit = (severityText: string, input: LoggerMethodInput): void => {
    const attributes = Object.fromEntries(
      Object.entries(input.attributes ?? {}).filter(([, value]) => value !== undefined),
    );
    const record = {
      attributes,
      body: input.body,
      severityText,
    };

    logger.emit(record);

    const serializedRecord = JSON.stringify(record);

    if (severityText === "ERROR") {
      console.error(serializedRecord);
      return;
    }

    console.log(serializedRecord);
  };

  return {
    logger: {
      debug: (input) => {
        emit("DEBUG", input);
      },
      error: (input) => {
        emit("ERROR", input);
      },
      info: (input) => {
        emit("INFO", input);
      },
      warn: (input) => {
        emit("WARN", input);
      },
    },
    shutdown: async () => {
      await Promise.all([loggerProvider.shutdown(), sdk.shutdown()]);
    },
  };
};
