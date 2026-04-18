# BrainGarden

BrainGarden is a capture-to-knowledge system. It lets you share content from Android, stores the raw source on a backend, curates it into an Obsidian vault, and exposes that knowledge through MCP so any compatible agent can use it.

## What It Does

- Capture text from the native Android Share sheet
- Send it to a backend for processing
- Preserve each submission as an immutable raw source
- Update curated notes, logs, and overview files in an Obsidian vault
- Expose the vault through a read-only MCP server for agents

## Core Flow

1. Share text from any Android app to `BrainGarden`.
2. The Android client submits it to `POST /v1/submissions`.
3. The backend stores the raw capture in `raw/`.
4. The maintainer updates curated content in `notes/`, `log.md`, `overview.md`, and `index.md`.
5. The vault can then be searched and read by MCP-compatible agents.

## Repo Structure

- `client/android` — Android capture app built around the native Share flow
- `backend` — submission API, vault maintenance pipeline, and MCP endpoint
- `docs` — plans, MCP setup notes, and submission material
- `assets` — project branding assets

## Why It Matters

Most knowledge tools make capture easy but leave organization to the user. BrainGarden is built to remove that second step. It combines fast mobile capture with automatic curation, so information is not just collected, but turned into something reusable.

## MCP Access

BrainGarden includes a read-only MCP endpoint at `/mcp`. This makes the curated vault available beyond one app or one assistant.

Available tools:

- `search_curated`
- `read_curated`
- `list_recent_ingests`
- `search_raw`
- `read_raw`

This lets any compatible agent search notes, inspect recent ingests, and ground responses in the user’s own knowledge base.

For full MCP setup details, see [docs/HOW_TO_MCP.md](/Users/philipschmidt/Lemon/git/codex-hackathon/docs/HOW_TO_MCP.md).

## Quick Start

### Backend

```sh
cd backend
cp .env.example .env
pnpm install
pnpm start
```

Required configuration lives in `backend/.env`. At minimum, set:

- `VAULT_REPO_PATH`
- `OPENAI_API_KEY`
- `AUTH_SHARED_SECRET`

For local MCP testing, `ALLOW_INSECURE_READ_ACCESS=true` is useful.

### Android Client

The Android app lives in `client/android` and is designed to receive shared content from the Android Share sheet and send it to the backend.

## Submission Helper

For backend testing without the Android client, use:

```sh
cd backend
pnpm exec node scripts/perform-submission.ts --text "My submission"
```

The helper sends a request to `/v1/submissions` and prints the HTTP result.

## Project Summary

BrainGarden turns quick captures into durable knowledge. It is both a fast mobile capture workflow and a shared knowledge layer for AI agents: capture once, preserve the source, curate automatically, and make the result available through MCP.
