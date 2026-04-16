# Agent Integration Guide

Other agents (e.g. `ibkr-agent`) can use the LM Studio MCP server as a subprocess via stdio.

## TypeScript Example

Install `@modelcontextprotocol/sdk` in the consuming agent, then:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/absolute/path/to/mcp-llm-studio/dist/server.js'],
  env: { LM_STUDIO_URL: 'http://localhost:1234' },
});

const client = new Client({ name: 'my-agent', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

// Single-turn ask
const result = await client.callTool({
  name: 'ask',
  arguments: {
    model: 'gemma-4-27b',
    prompt: 'Summarize the S&P 500 today.',
    system: 'You are a financial analyst. Be concise.',
  },
});

// Persistent chat session
const chatResult = await client.callTool({
  name: 'chat',
  arguments: {
    session_id: 'ibkr-research-1',
    action: 'send',
    message: 'What was the trend?',
    model: 'gemma-4-27b',
    system: 'You are a trading assistant.',
  },
});

await client.close();
```

## Session Management

- Each `session_id` maintains its own message history in SQLite
- Call `action: "reset"` to clear a session before starting a new research thread
- The `system` prompt is applied only on the first message of a new session

## Available Tools

| Tool | Purpose |
|------|---------|
| `model_list` | List models loaded in LM Studio |
| `model_load` | Load a model into VRAM (sync) |
| `model_unload` | Unload a model from VRAM |
| `model_download` | Download a model from catalog or HuggingFace (async polling) |
| `ask` | Single-turn via native `/api/v1/chat`, returns text + reasoning + stats |
| `chat` | Multi-turn with `session_id` and `action: send\|reset`, SQLite-backed |
| `embed` | Generate embeddings via `/v1/embeddings` |
