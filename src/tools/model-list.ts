import { openaiUrl, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleModelList(): Promise<ToolResult> {
  try {
    const res = await fetch(openaiUrl('models'), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }
    const data = (await res.json()) as { data: { id: string }[] };
    const models = data.data.map((m) => m.id);
    return {
      content: [
        { type: 'text', text: `Loaded models:\n${models.map((m) => `- ${m}`).join('\n')}` },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to reach LM Studio: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
