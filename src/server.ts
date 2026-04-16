// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  VERSION,
  MAX_ID_LEN,
  MAX_PROMPT_LEN,
  MAX_EMBED_INPUT_ITEMS,
} from './config.js';
import { handleModelList } from './tools/model-list.js';
import { handleModelLoad } from './tools/model-load.js';
import { handleModelUnload } from './tools/model-unload.js';
import { handleModelDownload } from './tools/model-download.js';
import { handleAsk } from './tools/ask.js';
import { handleChat, openProductionDb } from './tools/chat.js';
import { handleEmbed } from './tools/embed.js';

const server = new McpServer(
  { name: 'llm-studio', version: VERSION },
  {
    instructions:
      'MCP server for LM Studio (v3 hybrid native + OpenAI-compat). Tools: model_list/load/unload/download for lifecycle management, ask (native API with reasoning and stats), chat (multi-turn with SQLite persistence), embed (text embeddings).',
  },
);

server.registerTool(
  'model_list',
  {
    title: 'List Models',
    description: 'List all models currently loaded in LM Studio',
    inputSchema: z.object({}),
  },
  () => handleModelList(),
);

server.registerTool(
  'model_load',
  {
    title: 'Load Model',
    description: 'Load a model into VRAM. Synchronous — blocks until the model is ready (up to 5 minutes for large models).',
    inputSchema: z.object({
      model: z.string().max(MAX_ID_LEN).describe('Model identifier (e.g. "qwen/qwen3.5-9b")'),
      context_length: z.number().min(1).optional().describe('Override default context window size'),
      gpu: z.number().min(0).max(1).optional().describe('GPU offload ratio 0-1 (llama.cpp)'),
      flash_attention: z.boolean().optional().describe('Enable flash attention (llama.cpp)'),
      ttl: z.number().optional().describe('Seconds before auto-evict (-1 = never)'),
    }),
  },
  (args) => handleModelLoad(args),
);

server.registerTool(
  'model_unload',
  {
    title: 'Unload Model',
    description: 'Unload a model from VRAM to free memory',
    inputSchema: z.object({
      model: z.string().max(MAX_ID_LEN).describe('Model identifier to unload'),
    }),
  },
  (args) => handleModelUnload(args),
);

server.registerTool(
  'model_download',
  {
    title: 'Download Model',
    description: 'Download a model from the LM Studio catalog or HuggingFace. Polls progress internally for up to 2 minutes.',
    inputSchema: z.object({
      model: z.string().max(MAX_PROMPT_LEN).describe('Catalog model ID or HuggingFace URL'),
      quantization: z.string().max(MAX_ID_LEN).optional().describe('e.g. "Q4_K_M" (HuggingFace URLs only)'),
    }),
  },
  (args) => handleModelDownload(args),
);

server.registerTool(
  'ask',
  {
    title: 'Ask Model',
    description: 'Single-turn inference via LM Studio native chat API. Supports reasoning control and returns per-request stats.',
    inputSchema: z.object({
      model: z.string().max(MAX_ID_LEN).describe('Model ID (use model_list to see loaded models)'),
      prompt: z.string().max(MAX_PROMPT_LEN).describe('The question or prompt to send'),
      system: z.string().max(MAX_PROMPT_LEN).optional().describe('Optional system prompt'),
      temperature: z.number().min(0).max(2).optional().describe('Sampling temperature (default 0.7)'),
      max_tokens: z.number().min(1).optional().describe('Max output tokens (default 2048)'),
      reasoning: z
        .enum(['off', 'low', 'medium', 'high', 'on'])
        .optional()
        .describe('Thinking effort control for reasoning-capable models'),
      context_length: z.number().min(1).optional().describe('Override context window per-request'),
      stream: z.boolean().optional().describe('Enable SSE streaming (default false)'),
    }),
  },
  (args) => handleAsk(args),
);

const chatDb = openProductionDb();

server.registerTool(
  'chat',
  {
    title: 'Chat (Persistent)',
    description:
      'Multi-turn conversation with persistent history stored in SQLite. Use session_id to resume previous conversations. Supports speculative decoding and auto-evict.',
    inputSchema: z.object({
      session_id: z.string().max(MAX_ID_LEN).describe('Arbitrary session identifier (e.g. "research-1")'),
      action: z
        .enum(['send', 'reset'])
        .describe('"send" to add a message, "reset" to clear the session'),
      message: z.string().max(MAX_PROMPT_LEN).optional().describe('Required when action is "send"'),
      model: z.string().max(MAX_ID_LEN).describe('LM Studio model ID'),
      system: z
        .string()
        .max(MAX_PROMPT_LEN)
        .optional()
        .describe('System prompt — applied only on first message of a new session'),
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().min(1).optional(),
      draft_model: z.string().max(MAX_ID_LEN).optional().describe('Draft model for speculative decoding'),
      ttl: z.number().optional().describe('Auto-evict the model after N seconds of inactivity'),
    }),
  },
  (args) => handleChat(args, chatDb),
);

server.registerTool(
  'embed',
  {
    title: 'Embed Text',
    description: 'Generate embeddings for text using an embedding model on LM Studio',
    inputSchema: z.object({
      model: z.string().max(MAX_ID_LEN).describe('Embedding model ID (e.g. nomic-embed-text-v1.5)'),
      input: z
        .union([
          z.string().max(MAX_PROMPT_LEN),
          z.array(z.string().max(MAX_PROMPT_LEN)).max(MAX_EMBED_INPUT_ITEMS),
        ])
        .describe('Text or array of texts to embed'),
    }),
  },
  (args) => handleEmbed(args),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`LLM Studio MCP Server v${VERSION} running on stdio`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
