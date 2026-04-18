# Personal Knowledge Base Hackathon Plan

## Goal

Build a hackathon prototype for a personal knowledge base that captures shared text from Android, sends it to a server, and lets an LLM maintain an Obsidian markdown vault.

This is **not** a polished product v1. It is an **architecture + workflow probe** to test whether this feels exciting enough to continue.

## Core workflow

1. User shares text from any Android app via the native Share flow.
2. The Android app accepts **text only** in this hackathon version.
3. The Android app sends the shared text to the backend/server.
4. The server stores each submission as an **immutable raw source document**.
5. The server runs an **LLM maintainer** that updates a derived Obsidian vault.
6. The server updates the vault files.
7. The server commits and pushes the updated vault to git.
8. Clients pull the repo locally and browse it in Obsidian.

## Product/architecture decisions

### Scope

- Single-user only
- Android first
- Mobile app is capture-only
- Primary reading surface is Obsidian
- No editing/correction loop in the hackathon version

### Input model

- Arbitrary shared text from any app
- Treat all input as opaque text
- Even if the text is just a URL, store it as plain text for now
- One shared snippet = one raw source document

### Knowledge model

- **Raw sources are the source of truth**
- The wiki is a **derived artifact**
- The system should auto-file aggressively for now
- Prefer updating an existing note when there is a strong thematic match
- Otherwise create a new note

### Storage/sync model

- Server receives and processes submissions
- Server also stores the Obsidian vault
- Vault is git-backed
- After each successful ingest, server commits and pushes
- Clients pull and read locally in Obsidian

## Vault structure

Minimal schema:

- `raw/` — immutable source documents
- `notes/` — LLM-maintained notes
- `index.md` — catalog/navigation
- `log.md` — chronological ingest history
- `overview.md` — top-level summary

Recommended note constraint:

- every note should have a clear title
- every note should start with a short summary
- every note should make it obvious why it exists

## Non-goals for the hackathon

Do not build these now:

- iOS app
- URL fetching/parsing
- image ingestion
- PDF ingestion
- multi-user support
- collaborative editing
- correction workflows
- rich mobile browsing/search UI
- polished product narrative

## Success criteria

The hackathon is successful if:

- text can be shared from Android into the app
- the app sends it to the server successfully
- the server creates a raw source file
- the LLM updates one or more notes
- `index.md`, `log.md`, and `overview.md` are updated
- the server commits and pushes the repo
- the user can pull locally and inspect the result in Obsidian
- the overall workflow feels promising enough to continue

## Team split

Two engineers, split by vertical responsibility.

### Engineer 1: Android share flow

Own the Android capture client.

Responsibilities:

- create a minimal Android app that appears in the native Share sheet
- accept shared text from other apps
- show minimal confirmation/error state
- POST the text payload to the backend
- keep scope limited to capture-only behavior

Deliverable:

- a working Android app that can receive text from Share and submit it to the server reliably

### Engineer 2: Backend/server

Own the ingest pipeline and wiki maintenance loop.

Responsibilities:

- expose an endpoint that receives shared text submissions
- persist each submission as an immutable raw source document
- maintain the Obsidian vault on the server
- invoke the LLM maintainer to update the vault
- update `raw/`, `notes/`, `index.md`, `log.md`, and `overview.md`
- commit and push changes to git after successful processing

Deliverable:

- a working backend that turns text submissions into vault updates committed to a git-backed repo

## Suggested implementation order

1. Define the exact vault conventions and file formats
2. Implement backend endpoint + raw source persistence
3. Draft the LLM maintainer prompt/schema
4. Implement Android Share flow + server submission
5. Connect backend processing to vault updates
6. Add git commit/push step
7. Test with 10–20 real captures

## Open questions for later

These are intentionally deferred:

- how URL ingestion should work
- how image/PDF ingestion should work
- how users should correct wrong classifications
- whether note granularity should become more structured
- how local client pull/sync should be automated
- whether to add a conversational interface for interacting with the wiki
