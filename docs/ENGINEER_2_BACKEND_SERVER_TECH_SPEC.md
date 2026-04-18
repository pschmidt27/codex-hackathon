# Technical Spec: Engineer 2 Backend/Server

## Status

Proposed hackathon implementation spec for the backend/server workstream in `PLAN.md`.

## Objective

Build a single-user backend that accepts shared text from the Android app, stores every submission as an initial raw source document, runs an LLM-driven maintainer pass against an Obsidian vault, allows the model to edit vault files directly, and commits/pushes the resulting changes to git.

This spec optimizes for:

- fast hackathon implementation
- obvious operational behavior
- type-safe Node.js + TypeScript code
- low accidental complexity
- easy inspection of both raw inputs and derived outputs

## Scope

This backend owns:

- ingest API for Android text submissions
- lightweight in-memory submission tracking
- initial raw source persistence
- serialized vault mutation workflow
- LLM maintainer orchestration
- vault file updates for `raw/`, `notes/`, `index.md`, `log.md`, and `overview.md`
- git commit + push after successful processing

This backend does not own:

- Android UI/Share flow details
- URL fetching/parsing
- image/PDF ingestion
- user-facing editing workflows
- multi-user auth or tenancy
- advanced search or read APIs

## Recommended stack

### Runtime and language

- **Node.js:** `>=22.19.0`
- **TypeScript:** `^6`
- **Module system:** native ESM (`"type": "module"`)

### Why this stack

The implementation should explicitly incorporate the Node.js and TypeScript guidance from the local skills:

- use modern Node 22+ APIs
- keep the service fully typed in TypeScript
- use explicit file extensions in imports
- use `import type` for type-only imports
- avoid `ts-node`/`tsx`-style runtime transpilers
- keep code straightforward and fail fast

### TypeScript execution model

Use a split that keeps local iteration fast and deployment conservative:

- **Local development:** run `.ts` files directly with native Node.js type stripping when convenient
- **Validation/build/deploy:** compile with `tsc` and run emitted `dist/*.js`

That gives the project the simplicity of modern Node-native TypeScript while still preserving a standard build artifact for deployment and CI.

### TypeScript rules

To stay compatible with Node-native TypeScript and keep the codebase easy to reason about:

- use `import type` for types
- use explicit `.ts` extensions in local source imports
- do not use `enum`; prefer `as const` objects
- do not use namespaces
- avoid constructor parameter properties
- enable strict compiler settings and `verbatimModuleSyntax`

### Suggested libraries

- **HTTP server:** `hono`
- **validation:** `zod`
- **queue/state:** Node.js in-process queue plus in-memory maps
- **logging:** `@opentelemetry/sdk-logs` and `@opentelemetry/sdk-node`
- **LLM provider:** OpenAI via the official `openai` SDK
- **git integration:** spawn the system `git` CLI via `zx`

Rationale:

- Hono gives a small, modern HTTP layer with good TypeScript ergonomics.
- Zod keeps request and LLM-response validation explicit.
- An in-process queue is enough for the hackathon and keeps the implementation very small.
- OpenTelemetry gives the service structured logs through a standard observability stack without introducing a separate app-specific logger.
- Shelling out to `git` via `zx` is simple, readable, and easy to debug.

## High-level architecture

```text
Android share client
  -> POST /v1/submissions
  -> Ingest API validates request and enqueues work in memory
  -> Single-process worker dequeues next job
  -> Raw source file written to vault repo
  -> LLM maintainer agent runs with vault-repo file tools
  -> Model directly edits vault files in place
  -> Server runs post-edit health checks
  -> Server creates git commit
  -> Server pushes to remote
  -> In-memory job status marked completed
```

## Core design decisions

### 1. The vault repo is the writable working set

In this variant, the model is allowed to directly edit any file inside the vault repo, including `raw/`, `notes/`, `index.md`, `log.md`, `overview.md`, and `schema.md`.

That is a deliberate hackathon tradeoff in favor of implementation speed and agent flexibility.

### 2. Processing is serialized

Only one ingest job mutates the vault at a time.

This avoids:

- concurrent file write races
- conflicting git commits
- nondeterministic LLM context windows
- complex locking across filesystem, queue state, and git

For hackathon scale, single-job concurrency is the simplest correct design.

### 3. API acknowledgment is asynchronous

The ingest endpoint should return once the submission has been validated and placed onto the in-process queue, not after the entire LLM + git workflow completes.

That means:

- Android gets a fast acknowledgment
- LLM latency does not hold open HTTP requests
- the service stays simple for the hackathon

Tradeoff:

- queued work is not crash-durable until the worker writes the raw source file
- job status is only available for the lifetime of the running process

### 4. The LLM edits the vault directly

The maintainer runs as a tool-using agent with direct read/write access to the vault repo. Instead of returning a typed patch plan, it inspects files and edits them in place.

This is intentionally high-trust. The backend does not restrict which vault files may change during ingest.

## Repository and runtime layout

The backend code repo and the Obsidian vault repo should be **separate git
repositories**.

Recommended local layout:

```text
workspace/
  backend/
    package.json
    tsconfig.json
    tsconfig.build.json
    src/
      server.ts
      app.ts
      config.ts
      routes/
        submissions.ts
      domain/
        submissions.ts
        queue.ts
        vault.ts
        git.ts
        llm-maintainer.ts
      lib/
        fs.ts
        telemetry.ts
        zx.ts
        errors.ts
        state.ts
      types/
  vault-repo/
    raw/
    notes/
    index.md
    log.md
    overview.md
    schema.md
```

`vault-repo/` is a separate checked-out Obsidian vault git repository managed
by the backend service through `VAULT_REPO_PATH`.

This should not be committed inside the backend code repository. Keeping it
separate avoids nested-repo confusion, keeps application code and knowledge
content on independent git histories, and lets the backend update/push the
vault without mixing those commits with backend code changes.

`schema.md` is the maintainer contract for the vault itself. It explains the
vault structure, note conventions, ingest rules, log format, and any
standing instructions the backend wants the LLM to follow.

## API specification

### `POST /v1/submissions`

Accept a single shared text payload.

#### Request body

```json
{
  "submissionId": "2c8fba73-64cf-4f5c-8f69-8a79d5db7b6c",
  "text": "captured text from Android share flow",
  "capturedAt": "2026-04-18T12:00:00.000Z",
  "sourceApp": "com.example.app"
}
```

#### Field rules

- `submissionId`: required UUID from the client for idempotency
- `text`: required non-empty string
- `capturedAt`: optional ISO timestamp from device
- `sourceApp`: optional package/app identifier for debugging only

#### Response

Return `202 Accepted` after validation and enqueue.

```json
{
  "submissionId": "2c8fba73-64cf-4f5c-8f69-8a79d5db7b6c",
  "status": "accepted"
}
```

#### Idempotency behavior

If the same `submissionId` is posted again during the lifetime of the running process:

- if already accepted or processing, return `202`
- if already completed, return `200` with `status: "completed"`
- if previously failed, return `409` or allow an explicit retry path depending on implementation choice

For hackathon simplicity, the recommended behavior is:

- identical `submissionId` + identical payload => treat as idempotent retry
- identical `submissionId` + different payload => reject with `409 Conflict`

Important limitation:

- this is only best-effort idempotency while the process is running
- after a restart, in-memory status is lost unless the team later adds durable state

### Optional debug endpoint: `GET /v1/submissions/:submissionId`

Not required for the product, but useful during the hackathon to inspect pipeline state.

Suggested response:

```json
{
  "submissionId": "2c8fba73-64cf-4f5c-8f69-8a79d5db7b6c",
  "status": "completed",
  "receivedAt": "2026-04-18T12:00:01.000Z",
  "completedAt": "2026-04-18T12:00:08.000Z",
  "error": null
}
```

## Operational state model

Use a Node.js in-process queue plus in-memory maps for job tracking. The vault files remain the real knowledge source.

### In-memory structures

Recommended runtime state:

```ts
export type JobStatus = "queued" | "processing" | "completed" | "failed";

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
```

Suggested implementation:

- one FIFO array for queued `submissionId` values
- one `Map<string, SubmissionRecord>` for request metadata
- one `Map<string, JobRecord>` for current job state
- one boolean worker lock so only one job is processed at a time

### Tradeoffs

This is intentionally minimal and acceptable for the hackathon, but it means:

- queued work is lost if the process crashes before writing the raw source file
- in-memory job history is lost on restart
- crash recovery and durable retries are out of scope for now

Because raw source files and git commits are the real persisted artifacts, this simplification is acceptable for an architecture probe.

## Vault file conventions

### Raw source file naming

Store each raw source as a separate initial plain-text document:

```text
raw/YYYY/MM/DD/<timestamp>--<submissionId>.txt
```

Example:

```text
raw/2026/04/18/2026-04-18T12-00-01.000Z--2c8fba73-64cf-4f5c-8f69-8a79d5db7b6c.txt
```

### Raw source file format

The raw source file contains only the exact shared text payload.

```text
<verbatim shared text>
```

Rules:

- the initial raw file is created from the exact submitted text payload
- filename contains the durable submission identifier
- the raw file contains no markdown wrapper, no frontmatter, and no synthetic headings
- ingest metadata lives outside the raw document itself, primarily in the filename and `log.md`
- later agent runs may still modify the file because the vault repo is intentionally fully writable

### Derived file rules

- `notes/` contains topic notes maintained by the LLM
- `index.md` is the top-level note catalog and navigation layer
- `log.md` is chronological ingest history
- `overview.md` is the high-level vault summary
- `schema.md` tells the LLM how to maintain the vault consistently

In this variant, all files inside the vault repo are writable by the maintainer agent.

`index.md` and `log.md` serve different purposes:

- `index.md` is content-oriented and helps the LLM find relevant notes quickly
- `log.md` is time-oriented and helps both the user and the LLM understand recent activity

### Note contract

Every note in `notes/` must:

- have a clear human-readable title
- start with a short summary paragraph under the title
- make its purpose obvious to a reader who did not author it
- link back to relevant raw sources where helpful
- preserve or add useful wiki-style cross-links to related notes when appropriate

### Log format contract

`log.md` should use a stable heading prefix so both humans and simple CLI tools
can inspect recent activity quickly.

Recommended format:

```md
## [2026-04-18T12:00:01.000Z] ingest | <submissionId> | <short title>

- raw source: `raw/...txt`
- capturedAt: `2026-04-18T12:00:00.000Z`
- sourceApp: `com.example.app`
- notes touched: `notes/...`, `notes/...`
- summary: one or two sentences
```

## Processing pipeline

### Step 1: Accept submission

On `POST /v1/submissions`:

1. validate request body with Zod
2. normalize text line endings
3. reject empty or over-limit payloads
4. compute `payload_sha256`
5. store submission metadata in memory
6. enqueue the `submissionId`
7. wake the worker
8. return `202 Accepted`

Suggested guardrails:

- maximum payload size: 64 KiB for hackathon v1
- content type: `application/json`
- reject blank or whitespace-only text

### Step 2: Worker claims next job

A single in-process worker loop:

1. selects the oldest queued job
2. marks it `processing` in memory
3. loads current vault state
4. processes the submission to completion
5. marks success or failure in memory

On startup, there is no persisted queue to restore. That is an intentional hackathon tradeoff.

### Step 3: Persist the initial raw source document

Before asking the LLM to update the vault:

1. create the raw file under `raw/`
2. write the exact normalized text payload via temp file + atomic rename
3. do not add markdown framing, frontmatter, or any generated prose
4. fsync if needed for extra durability

The LLM should always see the new raw source as part of its input context.

Note: after this initial write, the maintainer agent is still allowed to modify the raw file later in the same run because the vault repo is intentionally fully writable.

### Step 4: Build maintainer context

For hackathon scale, use a simple context assembly strategy:

- new raw source content
- all existing note files in `notes/`
- current `index.md`
- current `log.md`
- current `overview.md`
- current `schema.md`

Because the vault is expected to stay small during the hackathon, sending the full derived vault is simpler than implementing retrieval.

If token limits become a problem later, add note selection heuristics or local wiki search as a post-hackathon optimization.

At hackathon scale, the spec intentionally relies on `index.md` plus the full
small vault snapshot instead of adding retrieval infrastructure early.

### Step 5: Run the maintainer agent with direct file editing

The maintainer should run as a tool-using OpenAI agent with access to vault-repo file operations such as:

- list files
- read files
- create files
- edit files
- delete or rename files if it decides that is useful

The maintainer prompt should instruct the model to:

- inspect the current vault state before making edits
- decide whether to update existing files or create new ones
- keep notes concise and reader-friendly
- preserve or improve cross-links between related notes
- note contradictions or changed understanding when new input conflicts with existing notes
- keep `index.md`, `log.md`, `overview.md`, and `schema.md` useful
- freely edit any file in the vault repo if it believes that improves the system

The backend should capture a before/after diff of the vault repo for observability and git commit creation.

### Step 6: Run post-edit health checks

Because the model edits files directly, validation moves to the end of the run.

The server should perform lightweight health checks such as:

- the vault repo still exists and is readable
- `index.md`, `log.md`, `overview.md`, and `schema.md` still exist after the run
- changed note files still satisfy minimum structure checks where practical
- the git working tree is in a committable state

If these checks fail, mark the job failed in memory and keep failure metadata in logs for debugging.

### Step 7: Prepare repo changes for commit

After the agent finishes and health checks pass:

1. inspect `git status --porcelain`
2. review the resulting file diff for observability
3. stage the changed vault files
4. verify the repo is in a committable state

### Step 8: Commit and push

After filesystem updates succeed:

1. run `git status --porcelain`
2. stage expected files only
3. create one commit for this submission
4. push to configured remote/branch

Suggested commit message:

```text
ingest: <submissionId>
```

Optionally add a short suffix if a stable title is available:

```text
ingest: <submissionId> add note on personal knowledge management
```

### Step 9: Mark job complete

Store in memory:

- completion timestamp
- resulting commit SHA
- final status `completed`

## LLM maintainer contract

Use the official OpenAI SDK behind a small local integration boundary so prompt construction, tool wiring, and application logic stay separated.

```ts
export type MaintainerInput = {
  rawSourcePath: string;
  submissionId: string;
  capturedAt?: string;
  sourceApp?: string;
};

export type MaintainerResult = {
  summary: string;
  filesChanged: string[];
};
```

Use a small integration function such as `runMaintainerAgent(input): Promise<MaintainerResult>` backed by the official OpenAI SDK.

The maintainer agent should receive file tools scoped to the vault repo and may directly read or modify any file inside that repo.

This keeps the rest of the codebase easy to test while embracing a fully agentic editing model for the vault.

## Git integration details

### Preconditions

On startup, verify:

- vault directory exists
- vault directory is a git repo
- current branch matches configured branch
- working tree is clean before processing new jobs
- remote is configured

### Failure policy

If `git push` fails:

- mark the job failed
- record the local commit SHA
- do not continue processing later jobs until the repo state is reconciled

This fail-fast behavior is preferable to silently diverging local and remote history during the hackathon.

## Config

Use environment variables with validation at startup.

Suggested config:

```text
PORT=3000
HOST=0.0.0.0
VAULT_REPO_PATH=../vault-repo
GIT_REMOTE=origin
GIT_BRANCH=main
OPENAI_MODEL=<model-name>
OPENAI_API_KEY=<secret>
MAX_SUBMISSION_BYTES=65536
```

Rules:

- validate all config once at boot
- crash immediately on invalid or missing required config
- never read `process.env` directly outside the config module

## Error handling and reliability

Incorporate Node.js operational best practices:

- classify errors as validation, external dependency, filesystem, git, or LLM errors
- log structured context with `submissionId`
- treat uncaught exceptions as fatal
- treat unhandled promise rejections as fatal after logging
- shut down gracefully on `SIGINT`/`SIGTERM`

### Graceful shutdown sequence

1. stop accepting new HTTP requests
2. stop claiming new jobs
3. let the current job finish or abort at a safe boundary
4. flush final logs if needed
5. exit with explicit status code

### Logging

Use `@opentelemetry/sdk-node` plus `@opentelemetry/sdk-logs` for structured application logs.

For the hackathon, emitting structured logs to stdout is sufficient. Keep log records simple and attach operational context as attributes.

Recommended fields:

- `severityText`
- `body`
- `submissionId`
- `jobStatus`
- `gitCommitSha`
- `durationMs`

`src/lib/telemetry.ts` should own logger provider setup, exporter setup, and shutdown flushing.

## Security and abuse posture

Because this is a single-user hackathon backend, keep security simple but explicit:

- bind to a trusted network or protect with a shared secret header
- cap payload size
- never execute submitted text
- sanitize all file paths
- do not allow the LLM to pick arbitrary output locations
- store secrets only in environment variables

If the service is exposed beyond a trusted network, add authentication before expanding scope.

## Suggested implementation modules

### `src/routes/submissions.ts`

- request schema
- route handler
- idempotency behavior
- fast failure for invalid input

### `src/domain/submissions.ts`

- submission creation
- normalization
- hashing

### `src/domain/queue.ts`

- enqueue/dequeue/status transitions
- single-worker lock
- in-memory submission and job maps

### `src/domain/vault.ts`

- raw source writing
- vault file tool implementation
- repo health checks after agent edits

### `src/domain/llm-maintainer.ts`

- prompt construction
- OpenAI SDK integration
- agent loop and file-tool wiring

### `src/domain/git.ts`

- repo health checks
- staging
- commit creation
- push handling

## Observability and manual debugging

For hackathon debugging, add one lightweight admin/debug command or endpoint to print:

- current queued submissions
- failed submission IDs from in-memory state
- last commit SHA
- vault repo status

This is optional but highly useful when the pipeline fails halfway through LLM or git operations.

## Incremental implementation plan

1. scaffold Node.js + TypeScript project and config
2. implement `POST /v1/submissions` with in-memory queueing
3. implement single-worker queue
4. implement raw source file persistence
5. stub LLM maintainer with deterministic fake file edits for local testing
6. implement vault file tools and post-edit health checks
7. implement git commit/push integration
8. connect the real OpenAI SDK integration
9. run 10-20 real ingest samples and tune prompt/file conventions

## Acceptance criteria

The backend is done for the hackathon when all of the following are true:

- Android can submit text successfully to `POST /v1/submissions`
- each accepted submission is queued successfully in the running process
- each submission creates an initial raw source file in the vault repo
- the worker updates notes plus `index.md`, `log.md`, and `overview.md`
- the vault repo receives one commit per successful submission
- successful commits are pushed to the configured remote
- failures are visible in logs and in-memory job state without silent corruption

## Deliberate simplifications

These are intentional to keep the hackathon buildable:

- single process
- single worker
- single user
- in-memory queue instead of durable job infrastructure
- full-trust maintainer with write access to the entire vault repo
- local filesystem vault instead of object storage
- direct agentic file editing instead of a structured patch DSL

## Follow-up work after the hackathon

If the prototype feels promising, the next upgrades should be:

1. retry and dead-letter handling for failed jobs
2. local search or retrieval/scoping when vault size grows
3. auth beyond a shared secret
4. better provenance links from notes to raw sources
5. correction/review workflow for bad classifications
6. explicit query and lint operations, including filing useful query outputs back into the vault
7. sync/notification support for downstream Obsidian clients
