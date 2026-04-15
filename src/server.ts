// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleListModels } from './tools/models.js';
import { handleAsk } from './tools/ask.js';
import { handleChat, openProductionDb } from './tools/chat.js';
import { handleEmbed } from './tools/embed.js';

const server = new McpServer(
  { name: 'llm-studio', version: '2.0.0' },
  {
    instructions:
      'MCP server for LM Studio. Use list_models to see available models, ask for single-turn chat (with optional streaming), chat for multi-turn conversations with persistent history, embed to generate embeddings.',
  },
);

server.registerTool(
  'list_models',
  {
    title: 'List Models',
    description: 'List all models currently loaded in LM Studio',
    inputSchema: z.object({}),
  },
  () => handleListModels(),
);

server.registerTool(
  'ask',
  {
    title: 'Ask Model',
    description: 'Send a prompt to a specific LLM model on LM Studio and get a response',
    inputSchema: z.object({
      model: z.string().describe('Model ID from LM Studio (use list_models to see available models)'),
      prompt: z.string().describe('The question or prompt to send'),
      system: z.string().optional().describe('Optional system prompt'),
      temperature: z.number().min(0).max(2).optional().describe('Sampling temperature (default 0.7)'),
      max_tokens: z.number().min(1).optional().describe('Max tokens in response (default 2048)'),
      stream: z.boolean().optional().describe('Enable token streaming (default false)'),
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
      'Multi-turn conversation with persistent history stored in SQLite. Use session_id to resume previous conversations.',
    inputSchema: z.object({
      session_id: z.string().describe('Arbitrary session identifier (e.g. "research-1")'),
      action: z
        .enum(['send', 'reset'])
        .describe('"send" to add a message, "reset" to clear the session'),
      message: z.string().optional().describe('Required when action is "send"'),
      model: z.string().describe('LM Studio model ID'),
      system: z
        .string()
        .optional()
        .describe('System prompt — applied only on first message of a new session'),
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().min(1).optional(),
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
      model: z.string().describe('Embedding model ID (e.g. nomic-embed-text-v1.5)'),
      input: z
        .union([z.string(), z.array(z.string())])
        .describe('Text or array of texts to embed'),
    }),
  },
  (args) => handleEmbed(args),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('LLM Studio MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
