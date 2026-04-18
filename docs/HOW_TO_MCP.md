# How To Use The BrainGarden MCP

This repo exposes a read-only MCP endpoint from the backend at:

```text
http://127.0.0.1:3000/mcp
```

## 1. Configure The Backend

Copy the backend env file and fill in the required values:

```sh
cd /Users/<user>/git/codex-hackathon/backend
cp .env.example .env
```

Important settings in `.env`:

```env
VAULT_REPO_PATH=../vault-repo
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
AUTH_SHARED_SECRET=some-secret
ALLOW_INSECURE_READ_ACCESS=true
```

Recommended local setup:

- keep `AUTH_SHARED_SECRET` set so submission APIs stay protected
- set `ALLOW_INSECURE_READ_ACCESS=true` so local read-only knowledge routes and `/mcp` work without extra MCP auth config

Curated MCP access is intentionally limited to `notes/*.md`.
It does not return `index.md`, `overview.md`, or other top-level vault files.

## 2. Start The Backend

Use Node 24:

```sh
cd /Users/<user>/git/codex-hackathon/backend
~/.nvm/versions/node/v24.15.0/bin/node --env-file .env src/main.ts
```

If your shell is already using Node 24, `pnpm start` also works.

## 3. Verify The MCP Endpoint

List the available tools:

```sh
curl -s http://127.0.0.1:3000/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected tools:

- `search_curated`
- `read_curated`
- `list_recent_ingests`
- `search_raw`
- `read_raw`

## 4. Add The MCP To Codex Desktop

Edit [config.toml](</Users/<user>/.codex/config.toml>) and add:

```toml
[mcp_servers.BrainGarden]
url = "http://127.0.0.1:3000/mcp"
```

Then restart Codex Desktop.

If you use the Codex CLI, you can add it with:

```sh
codex mcp add BrainGarden --url http://127.0.0.1:3000/mcp
```

## 5. Tell Codex To Use It

Add a note to `AGENTS.md` if you want Codex to prefer this server automatically:

```md
Always use the `BrainGarden` MCP server when you need to search or read the Obsidian knowledge base.
Prefer `search_curated` first, then `read_curated`.
Use raw tools only when you need source verification.
```

## 6. Example Prompts

- `Use BrainGarden to find notes about Android share flow.`
- `Search the knowledge base for Obsidian ingest decisions and read the best match.`
- `List recent ingests, then open the most relevant raw source.`
