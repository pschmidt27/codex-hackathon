export const jobStatuses = {
  queued: "queued",
  processing: "processing",
  completed: "completed",
  failed: "failed",
} as const;

export type JobStatus = (typeof jobStatuses)[keyof typeof jobStatuses];

export type SubmissionRecord = {
  submissionId: string;
  payloadText: string;
  payloadSha256: string;
  capturedAt?: string;
  sourceApp?: string;
  receivedAt: string;
};

export type JobRecord = {
  submissionId: string;
  status: JobStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  gitCommitSha?: string;
};

export type AcceptedSubmission = SubmissionRecord & {
  payloadBytes: number;
};

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
