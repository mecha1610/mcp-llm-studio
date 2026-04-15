import { LM_STUDIO_URL, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleListModels(): Promise<ToolResult> {
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/models`, {
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
        { type: 'text', text: `Available models:\n${models.map((m) => `- ${m}`).join('\n')}` },
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
