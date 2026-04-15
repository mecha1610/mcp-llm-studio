import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const LM_STUDIO_URL = process.env.LM_STUDIO_URL ?? 'http://192.168.10.56:1234';

const server = new McpServer(
  { name: 'llm-studio', version: '1.0.0' },
  { instructions: 'MCP server for LM Studio. Use list_models to see available models, ask to chat, embed to generate embeddings.' },
);

// --- list_models ---
server.registerTool(
  'list_models',
  {
    title: 'List Models',
    description: 'List all models currently loaded in LM Studio',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const res = await fetch(`${LM_STUDIO_URL}/v1/models`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        return { content: [{ type: 'text' as const, text: `LM Studio error: ${res.status} ${res.statusText}` }], isError: true };
      }
      const data = (await res.json()) as { data: { id: string; object: string }[] };
      const models = data.data.map((m) => m.id);
      return { content: [{ type: 'text' as const, text: `Available models:\n${models.map((m) => `- ${m}`).join('\n')}` }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Failed to reach LM Studio: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// --- ask ---
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
    }),
  },
  async ({ model, prompt, system, temperature, max_tokens }) => {
    try {
      const messages: { role: string; content: string }[] = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 2048,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        return { content: [{ type: 'text' as const, text: `LM Studio error: ${res.status} ${res.statusText}` }], isError: true };
      }

      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const reply = data.choices[0]?.message?.content ?? '(empty response)';
      return { content: [{ type: 'text' as const, text: reply }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// --- embed ---
server.registerTool(
  'embed',
  {
    title: 'Embed Text',
    description: 'Generate embeddings for text using an embedding model on LM Studio',
    inputSchema: z.object({
      model: z.string().describe('Embedding model ID (e.g. nomic-embed-text-v1.5)'),
      input: z.union([z.string(), z.array(z.string())]).describe('Text or array of texts to embed'),
    }),
  },
  async ({ model, input }) => {
    try {
      const res = await fetch(`${LM_STUDIO_URL}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        return { content: [{ type: 'text' as const, text: `LM Studio error: ${res.status} ${res.statusText}` }], isError: true };
      }

      const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      const summary = data.data.map((d) => `[${d.index}] ${d.embedding.length} dimensions`).join('\n');
      return {
        content: [
          { type: 'text' as const, text: `Embeddings generated:\n${summary}` },
          { type: 'text' as const, text: JSON.stringify(data.data) },
        ],
      };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// --- Transport ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('LLM Studio MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
