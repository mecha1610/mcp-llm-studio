# MCP LLM Studio

MCP server that connects Claude Code to your local LM Studio models (v3, hybrid native + OpenAI-compat API).

## Setup

```bash
npm install
npm run build
```

## Register in Claude Code

```bash
claude mcp add llm-studio -- node /absolute/path/to/mcp-llm-studio/dist/server.js
```

To use a custom LM Studio URL:

```bash
claude mcp add llm-studio -e LM_STUDIO_URL=http://your-ip:1234 -- node /absolute/path/to/mcp-llm-studio/dist/server.js
```

## Tools

### Model management (native `/api/v1/*`)

- `model_list` — list loaded models
- `model_load` — load a model into VRAM (sync, up to 5 min for large models)
  - params: `model`, `context_length?`, `gpu?`, `flash_attention?`, `ttl?`
- `model_unload` — unload a model from VRAM
  - params: `model`
- `model_download` — download from catalog or HuggingFace (async, polls for up to 2 min)
  - params: `model`, `quantization?`

### Inference

- `ask` — single-turn via native `/api/v1/chat`, returns text + reasoning + stats
  - params: `model`, `prompt`, `system?`, `temperature?`, `max_tokens?`, `reasoning?`, `context_length?`, `stream?`
- `chat` — multi-turn with SQLite persistence via `/v1/chat/completions`
  - params: `session_id`, `action`, `message?`, `model`, `system?`, `temperature?`, `max_tokens?`, `draft_model?`, `ttl?`
- `embed` — text embeddings via `/v1/embeddings`
  - params: `model`, `input`
