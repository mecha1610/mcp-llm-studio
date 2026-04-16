# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that bridges Claude Code to local LM Studio models. It exposes seven tools over stdio transport, using a hybrid API surface: LM Studio's native REST API (`/api/v1/*`) for model lifecycle management (`model_list`, `model_load`, `model_unload`, `model_download`) and single-turn inference (`ask`), and the OpenAI-compatible API (`/v1/*`) for multi-turn chat with SQLite persistence (`chat`) and embeddings (`embed`).

## Commands

```bash
npm run build           # Compile TypeScript → dist/
npm run dev             # Watch mode compilation
npm run start           # Run the compiled server (stdio transport)
npm run test            # Run tests with vitest
npm run test:coverage   # Run tests with coverage report
```

## Architecture

- `src/config.ts` — env vars, URL helpers (`openaiUrl`, `nativeUrl`), authHeaders()
- `src/tools/model-list.ts` — list loaded models (OpenAI compat)
- `src/tools/model-load.ts` — load model into VRAM (native API, sync)
- `src/tools/model-unload.ts` — unload from VRAM (native API)
- `src/tools/model-download.ts` — download + internal polling (native API, async)
- `src/tools/ask.ts` — single-turn via native `/api/v1/chat` with reasoning + stats
- `src/tools/chat.ts` — multi-turn with SQLite-backed session history (OpenAI compat)
- `src/tools/embed.ts` — text embeddings (OpenAI compat)
- `src/server.ts` — MCP assembly: imports handlers, registers 7 tools, connects StdioServerTransport

## Configuration

- `LM_STUDIO_URL` — LM Studio base URL (default: `http://192.168.10.56:1234`)
- `LM_STUDIO_API_KEY` — optional Bearer token
- `MCP_SESSIONS_DB` — SQLite DB path (default: `~/.mcp-llm-studio/sessions.db`)

Copy `.env.example` to `.env` for local overrides.

## Testing

Tests are in `tests/tools/*.test.ts` using vitest. They import real handlers from `src/tools/*.ts` and mock `globalThis.fetch` with `vi.spyOn`. The chat handler accepts an optional `db` parameter injected as `:memory:` SQLite — no filesystem side effects.

## Registration

```bash
claude mcp add llm-studio \
  -e LM_STUDIO_URL=http://192.168.10.56:1234 \
  -- node /Users/thomas/Documents/GitHub/mcp-llm-studio/dist/server.js
```
