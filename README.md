# MCP LLM Studio

MCP server that connects Claude Code to your local LM Studio models.

## Setup

```bash
npm install
npm run build
```

## Register in Claude Code

```bash
claude mcp add llm-studio -- node /absolute/path/to/mcp-llm-studio/dist/index.js
```

To use a custom LM Studio URL:

```bash
claude mcp add llm-studio -e LM_STUDIO_URL=http://your-ip:1234 -- node /absolute/path/to/mcp-llm-studio/dist/index.js
```

## Tools

### `list_models`
Lists all loaded models in LM Studio.

### `ask`
Chat with a model. Parameters:
- `model` (required) - model ID
- `prompt` (required) - your message
- `system` (optional) - system prompt
- `temperature` (optional, default 0.7)
- `max_tokens` (optional, default 2048)

### `embed`
Generate embeddings. Parameters:
- `model` (required) - embedding model ID
- `input` (required) - text or array of texts
