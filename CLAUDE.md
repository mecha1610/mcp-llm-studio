# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that bridges Claude Code to local LM Studio models. It exposes four tools over stdio transport: `list_models`, `ask` (chat completions with optional streaming), `chat` (persistent multi-turn sessions via SQLite), and `embed` (text embeddings). All tools proxy requests to the LM Studio OpenAI-compatible API.

## Commands

```bash
npm run build           # Compile TypeScript → dist/
npm run dev             # Watch mode compilation
npm run start           # Run the compiled server (stdio transport)
npm run test            # Run tests with vitest
npm run test:coverage   # Run tests with coverage report
```

## Architecture

- `src/config.ts` — env vars, LM_STUDIO_URL, MCP_SESSIONS_DB, authHeaders()
- `src/tools/models.ts` — handleListModels()
- `src/tools/ask.ts` — handleAsk() with optional SSE streaming
- `src/tools/chat.ts` — handleChat() with SQLite-backed session history, openProductionDb()
- `src/tools/embed.ts` — handleEmbed()
- `src/server.ts` — MCP assembly: imports handlers, registers tools, connects StdioServerTransport

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
