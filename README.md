# MCP LLM Studio

[![CI](https://github.com/mecha1610/mcp-llm-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/mecha1610/mcp-llm-studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org/)

An [MCP](https://modelcontextprotocol.io/) server that bridges [Claude Code](https://claude.com/claude-code) (and any other MCP client) to a local [LM Studio](https://lmstudio.ai/) instance. Load and unload models, download new ones from HuggingFace, run single-turn inference with reasoning and stats, and hold multi-turn chats with SQLite-persisted history — all from inside Claude.

## Why

LM Studio runs LLMs locally. Claude Code doesn't talk to it out of the box. This server gives Claude seven tools that cover the whole local-LLM lifecycle, so you can say things like:

> *"Load `qwen/qwen3.5-9b`, ask it to summarize this log, then unload it."*

…and Claude will orchestrate the calls itself.

The server uses a **hybrid API surface**: LM Studio's native REST API (`/api/v1/*`) for model lifecycle and single-turn `ask` (gets reasoning + per-request stats), and the OpenAI-compatible API (`/v1/*`) for multi-turn `chat` (keeps history in SQLite — needed because the native chat endpoint can't replay assistant messages) and `embed`.

## Requirements

- **Node.js ≥ 20**
- **LM Studio ≥ 0.4.0** (native `/api/v1/*` API required for model management and `ask`)
- An MCP client — **Claude Code**, the Claude desktop app, or any client speaking MCP over stdio

## Quick Start

```bash
git clone https://github.com/mecha1610/mcp-llm-studio.git
cd mcp-llm-studio
npm install
npm run build
```

Register the server with Claude Code:

```bash
claude mcp add llm-studio \
  -e LM_STUDIO_URL=http://localhost:1234 \
  -- node "$(pwd)/dist/server.js"
```

That's it. Start Claude Code and ask it to `list loaded models` — it should hit your LM Studio instance via the `model_list` tool.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LM_STUDIO_URL` | `http://localhost:1234` | Base URL of your LM Studio REST server |
| `LM_STUDIO_API_KEY` | *(empty)* | Optional `Authorization: Bearer <key>` header |
| `MCP_SESSIONS_DB` | `~/.mcp-llm-studio/sessions.db` | SQLite path for `chat` history |

Copy `.env.example` → `.env` for local overrides.

## Tools

### Model management — native `/api/v1/*`

| Tool | Params | Description |
|---|---|---|
| `model_list` | — | List currently loaded models |
| `model_load` | `model`, `context_length?`, `gpu?`, `flash_attention?`, `ttl?` | Load a model into VRAM (synchronous, up to 5 min for large models) |
| `model_unload` | `model` | Unload a model from VRAM |
| `model_download` | `model`, `quantization?` | Download from LM Studio catalog or HuggingFace URL (async, polls up to 2 min, returns progress on timeout) |

### Inference

| Tool | Params | Description |
|---|---|---|
| `ask` | `model`, `prompt`, `system?`, `temperature?`, `max_tokens?`, `reasoning?`, `context_length?`, `stream?` | Single-turn via native `/api/v1/chat`. Supports `reasoning: "off" \| "low" \| "medium" \| "high" \| "on"`. Returns text + reasoning + stats (`tok/s`, TTFT, token counts). |
| `chat` | `session_id`, `action` (`send` \| `reset`), `message?`, `model`, `system?`, `temperature?`, `max_tokens?`, `draft_model?`, `ttl?` | Multi-turn via `/v1/chat/completions`. History is persisted in SQLite — survives restarts. `system` applies only on the first message of a new session. `draft_model` enables speculative decoding; `ttl` auto-evicts after N seconds of inactivity. |
| `embed` | `model`, `input` (string or string[]) | Text embeddings via `/v1/embeddings` |

## Example

```
You:    Use google/gemma-3-4b to summarize this in one sentence: <paste log>
Claude: → ask(model: "google/gemma-3-4b", prompt: "...", reasoning: "off")
        ← "The log shows 12 failed auth attempts from 10.0.0.4 between 14:02 and 14:06."
```

```
You:    Start a session "refactor-plan", keep the system prompt "You are a senior
        TypeScript engineer", and ask it to list the files I should touch.
Claude: → chat(session_id: "refactor-plan", action: "send", model: "...",
                system: "...", message: "...")
        ← "You should touch src/tools/ask.ts, tests/tools/ask.test.ts, ..."
```

## Development

```bash
npm run dev           # watch-mode TypeScript compile
npm run test          # vitest (unit tests, mocked fetch, :memory: SQLite)
npm run test:coverage # + coverage report
npm run build         # tsc → dist/
```

Tests mock `globalThis.fetch` with `vi.spyOn` and inject `:memory:` SQLite for `chat` — no network, no filesystem side effects. CI runs build + tests on every push.

## Architecture

```
src/
  config.ts             env vars + URL helpers (openaiUrl, nativeUrl) + authHeaders
  server.ts             MCP assembly — imports handlers, registers 7 tools, stdio transport
  tools/
    model-list.ts       GET /v1/models
    model-load.ts       POST /api/v1/models/load (sync, 300s timeout)
    model-unload.ts     POST /api/v1/models/unload
    model-download.ts   POST /api/v1/models/download + polling GET .../status/:job_id
    ask.ts              POST /api/v1/chat (store: false) — reasoning + stats
    chat.ts             POST /v1/chat/completions + better-sqlite3 session history
    embed.ts            POST /v1/embeddings
tests/tools/*.test.ts   vitest, 45 tests, fetch mocked
```

## License

[MIT](LICENSE) © mecha1610
