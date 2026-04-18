export const jobStatuses = {
  queued: "queued",
  processing: "processing",
  completed: "completed",
  failed: "failed",
} as const;

export type JobStatus = (typeof jobStatuses)[keyof typeof jobStatuses];

export const imageSubmissionMimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type ImageMimeType =
  (typeof imageSubmissionMimeTypes)[keyof typeof imageSubmissionMimeTypes];

export type ImageFileExtension = "jpg" | "png" | "webp";

export type SubmissionBase = {
  submissionId: string;
  kind: "text" | "image";
  capturedAt?: string;
  sourceApp?: string;
  receivedAt: string;
};

export type TextSubmissionRecord = SubmissionBase & {
  kind: "text";
  payloadText: string;
  payloadSha256: string;
};

export type ImageSubmissionRecord = SubmissionBase & {
  kind: "image";
  captionText?: string;
  image: {
    bytes: Uint8Array;
    extension: ImageFileExtension;
    mimeType: ImageMimeType;
    originalFilename?: string;
    sha256: string;
    sizeBytes: number;
  };
};

export type SubmissionRecord = TextSubmissionRecord | ImageSubmissionRecord;

export type JobRecord = {
  submissionId: string;
  status: JobStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  gitCommitSha?: string;
};

export type AcceptedTextSubmission = TextSubmissionRecord & {
  payloadBytes: number;
};

export type AcceptedImageSubmission = ImageSubmissionRecord;

export type AcceptedSubmission = AcceptedTextSubmission | AcceptedImageSubmission;

export type SubmissionStatusResponse = {
  submissionId: string;
  status: JobStatus | "accepted";
  receivedAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  gitCommitSha?: string;
};

export type DebugStateResponse = {
  acceptingNewSubmissions: boolean;
  blockedReason?: string;
  queue: string[];
  failedSubmissionIds: string[];
  lastCommitSha?: string;
  currentSubmissionId?: string;
  vaultGitStatus: string;
};
