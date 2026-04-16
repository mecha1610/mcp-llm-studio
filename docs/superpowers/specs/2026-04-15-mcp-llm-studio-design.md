# MCP LLM Studio — Design Spec

## Overview

A Model Context Protocol (MCP) server that acts as a multi-model hub, routing requests from Claude Code to local LLM models running on LM Studio.

## Architecture

```
Claude Code  <--stdio-->  mcp-llm-studio (Node.js)  <--HTTP-->  LM Studio API (localhost:1234)
```

- **Transport:** stdio (Claude Code launches the process directly)
- **Backend:** LM Studio OpenAI-compatible API
- **Language:** TypeScript with `@modelcontextprotocol/sdk`

## MCP Tools

### `list_models`

Lists all currently loaded models in LM Studio.

- **Parameters:** none
- **API call:** `GET /v1/models`
- **Returns:** Array of `{ id, name }` for each loaded model

### `ask`

Sends a chat completion request to a specific model.

- **Parameters:**
  - `model` (string, required) — the model ID from LM Studio
  - `prompt` (string, required) — the user message
  - `system` (string, optional) — system prompt
  - `temperature` (number, optional, default 0.7) — sampling temperature
  - `max_tokens` (number, optional, default 2048) — max tokens in response
- **API call:** `POST /v1/chat/completions`
- **Returns:** The model's text response

### `embed`

Generates embeddings for text input.

- **Parameters:**
  - `model` (string, required) — the embedding model ID
  - `input` (string or string[], required) — text to encode
- **API call:** `POST /v1/embeddings`
- **Returns:** Array of embedding vectors

## Configuration

- `LM_STUDIO_URL` environment variable (default: `http://localhost:1234`)

## Project Structure

```
mcp-llm-studio/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts        # MCP server entry point with 3 tools
└── README.md
```

## Installation in Claude Code

```bash
npm run build
claude mcp add llm-studio -- node /path/to/mcp-llm-studio/dist/index.js
```

## Available Models (current)

| Model | Type |
|-------|------|
| Gemma 4 26B | Chat |
| GLM 4.7 Flash | Chat |
| Qwen 3.5 9B | Chat |
| Gemma 3 4B | Chat |
| Ministral 3 14B | Chat |
| Nomic Embeddings | Embedding |

## Error Handling

- If LM Studio is unreachable, tools return a clear error message
- If a model ID is invalid, the LM Studio API error is forwarded to the user
- Network timeouts set to 60s for chat completions, 30s for embeddings and model listing
