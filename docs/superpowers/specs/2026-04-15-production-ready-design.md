# MCP LLM Studio — Production-Ready Design

**Date:** 2026-04-15
**Status:** Approved

## Context

`mcp-llm-studio` is a stdio MCP server that bridges Claude Code to a local LM Studio instance (Windows 11, Nvidia GPU, `localhost:1234`). Current state: single-file TypeScript, 3 tools (`list_models`, `ask`, `embed`), tests that duplicate logic instead of testing real code, not yet registered in Claude Code.

## Goals

1. **Features** — Add streaming support to `ask`, add persistent `chat` tool with conversation history
2. **Code quality** — Modular architecture, tests that import and test real exported functions
3. **Production-ready** — Registered in Claude Code, GitHub Actions CI, clean config via `.env`, documented agent integration pattern

---

## Architecture

### File structure

```text
src/
  config.ts          # LM_STUDIO_URL, LM_STUDIO_API_KEY, authHeaders(), DB path
  tools/
    models.ts        # list_models handler (exported)
    ask.ts           # ask handler with optional streaming (exported)
    chat.ts          # chat handler with SQLite-backed history (exported)
    embed.ts         # embed handler (exported)
  server.ts          # McpServer assembly + StdioServerTransport — no business logic
tests/
  tools/
    models.test.ts
    ask.test.ts
    chat.test.ts
    embed.test.ts
docs/
  agent-integration.md   # How to use from ibkr-agent or other MCP clients
.env.example
```

`server.ts` is pure assembly: imports tools, registers them, connects transport. All logic lives in `src/tools/*.ts`.

---

## Tools

### `list_models`

Unchanged functionally. Moved to `src/tools/models.ts`, handler exported as `handleListModels`.

### `ask`

Extended with optional `stream` parameter (default `false`). When `true`, consumes the SSE stream from LM Studio's `/v1/chat/completions` endpoint and forwards chunks progressively via MCP streaming protocol. Backward-compatible — callers that don't pass `stream` get the same buffered response as today.

Input schema additions:

- `stream?: boolean` — enable token streaming

### `chat` (new)

Persistent multi-turn conversation tool backed by SQLite.

**Storage:** `better-sqlite3` DB at `MCP_SESSIONS_DB` env var (default: `~/.mcp-llm-studio/sessions.db`). Schema:

```sql
CREATE TABLE sessions (
  id TEXT NOT NULL,
  role TEXT NOT NULL,       -- 'system' | 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL  -- Unix timestamp
);
CREATE INDEX idx_sessions_id ON sessions(id);
```

**Input schema:**

- `session_id: string` — arbitrary identifier (e.g. `"ibkr-research-1"`)
- `action: "send" | "reset"` — send a message or clear the session
- `message?: string` — required when action is `send`
- `model: string` — LM Studio model ID
- `system?: string` — system prompt (applied on first message of session, ignored on subsequent)
- `temperature?: number`
- `max_tokens?: number`

**Behavior:**

- `send`: loads full history from DB, appends user message, calls LM Studio with the `model` passed in the call (model can vary per call — not stored), appends assistant reply, returns reply text
- `reset`: deletes all rows for `session_id`, returns `"Session <id> cleared (N messages deleted)"`
- System prompt: stored as `role: system` on first `send` of a new session; ignored on subsequent calls even if provided

**Testing:** handler accepts optional `db` parameter (injected as `:memory:` SQLite in tests).

### `embed`

Unchanged. Moved to `src/tools/embed.ts`, handler exported as `handleEmbed`.

---

## Config

`.env.example`:

```bash
LM_STUDIO_URL=http://localhost:1234
LM_STUDIO_API_KEY=          # optional Bearer token
MCP_SESSIONS_DB=~/.mcp-llm-studio/sessions.db
```

`src/config.ts` reads env vars, exports constants and `authHeaders()`. All tools import from `config.ts` — no env reads scattered across files.

---

## Testing

Each test file imports real handlers from `src/tools/*.ts`. No logic duplication.

- `fetch` mocked via `vi.spyOn(globalThis, 'fetch')`
- SQLite injected as `:memory:` DB for `chat.test.ts` — no filesystem side effects
- Coverage target: all happy paths + error cases per tool

```typescript
// Example — tests real code
import { handleChat } from '../../src/tools/chat';

it('accumulates history across calls', async () => {
  const db = new Database(':memory:');
  // ... test real handler with real DB
});
```

---

## CI — GitHub Actions

Two jobs on every push and PR:

```yaml
jobs:
  build:
    steps: [npm ci, npm run build]
  test:
    steps: [npm ci, npm test -- --coverage]
```

---

## Registration & Distribution

After build:

```bash
claude mcp add llm-studio -- node /Users/thomas/Documents/GitHub/mcp-llm-studio/dist/server.js
```

With env vars:

```bash
claude mcp add llm-studio \
  -e LM_STUDIO_URL=http://localhost:1234 \
  -- node /Users/thomas/Documents/GitHub/mcp-llm-studio/dist/server.js
```

Documented in `README.md` as the primary install step.

---

## Agent Integration

Other agents (e.g. `ibkr-agent`) can launch the MCP server as a stdio subprocess using the MCP SDK's `StdioClientTransport`. Documented in `docs/agent-integration.md` with a working TypeScript example.

---

## Out of Scope

- HTTP/SSE dual transport (can be added later if needed)
- npm publish
- Docker packaging
