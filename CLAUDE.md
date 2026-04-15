# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that bridges Claude Code to local LM Studio models. It exposes three tools over stdio transport: `list_models`, `ask` (chat completions), and `embed` (text embeddings). All tools proxy requests to the LM Studio OpenAI-compatible API.

## Commands

```bash
npm run build      # Compile TypeScript → dist/
npm run dev        # Watch mode compilation
npm run start      # Run the compiled server (stdio transport)
npm run test       # Run tests with vitest
```

## Architecture

Single-file server (`src/index.ts`) using `@modelcontextprotocol/sdk`. Each tool is registered via `server.registerTool()` with Zod input schemas. Tools make HTTP requests to LM Studio's `/v1/models`, `/v1/chat/completions`, and `/v1/embeddings` endpoints. The server communicates with Claude Code over `StdioServerTransport`.

## Configuration

- `LM_STUDIO_URL` env var — LM Studio base URL (default: `http://192.168.10.56:1234`)
- `LM_STUDIO_API_KEY` env var — optional Bearer token for authenticated LM Studio instances

## Testing

Tests are in `tests/index.test.ts` using vitest. They define standalone helper functions (mirroring server logic) and mock `globalThis.fetch` with `vi.spyOn`. Tests do not start the MCP server or require a running LM Studio instance.

## Registration

```bash
claude mcp add llm-studio -- node /absolute/path/to/mcp-llm-studio/dist/index.js
```
