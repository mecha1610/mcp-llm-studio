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
