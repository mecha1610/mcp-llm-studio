import { openaiUrl, authHeaders, TIMEOUT_DEFAULT_MS } from '../config.js';
import { ToolResult, errorResult, httpErrorResult } from '../types.js';

export async function handleEmbed(args: {
  model: string;
  input: string | string[];
}): Promise<ToolResult> {
  try {
    const res = await fetch(openaiUrl('embeddings'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model: args.model, input: args.input }),
      signal: AbortSignal.timeout(TIMEOUT_DEFAULT_MS),
    });
    if (!res.ok) return httpErrorResult(res);
    const data = (await res.json()) as {
      data?: { embedding?: number[]; index?: number }[];
    };
    if (!Array.isArray(data?.data)) {
      return {
        content: [{ type: 'text', text: 'LM Studio returned an unexpected embeddings shape (no "data" array)' }],
        isError: true,
      };
    }
    const summary = data.data
      .map((d) => `[${d.index ?? '?'}] ${d.embedding?.length ?? 0} dimensions`)
      .join('\n');
    return {
      content: [
        { type: 'text', text: `Embeddings generated:\n${summary}` },
        { type: 'text', text: JSON.stringify(data.data) },
      ],
    };
  } catch (error) {
    return errorResult(error);
  }
}
