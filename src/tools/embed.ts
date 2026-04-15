import { LM_STUDIO_URL, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleEmbed(args: {
  model: string;
  input: string | string[];
}): Promise<ToolResult> {
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/embeddings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model: args.model, input: args.input }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }
    const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    const summary = data.data
      .map((d) => `[${d.index}] ${d.embedding.length} dimensions`)
      .join('\n');
    return {
      content: [
        { type: 'text', text: `Embeddings generated:\n${summary}` },
        { type: 'text', text: JSON.stringify(data.data) },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
