import { nativeUrl, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleModelUnload(args: {
  model: string;
}): Promise<ToolResult> {
  try {
    const res = await fetch(nativeUrl('models/unload'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ instance_id: args.model }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }
    const data = (await res.json()) as { instance_id: string };
    return { content: [{ type: 'text', text: `Unloaded ${data.instance_id}` }] };
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
