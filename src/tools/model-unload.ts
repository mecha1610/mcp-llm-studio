import { nativeUrl, authHeaders, TIMEOUT_DEFAULT_MS } from '../config.js';
import { ToolResult, errorResult, httpErrorResult } from '../types.js';

export async function handleModelUnload(args: {
  model: string;
}): Promise<ToolResult> {
  try {
    const res = await fetch(nativeUrl('models/unload'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ instance_id: args.model }),
      signal: AbortSignal.timeout(TIMEOUT_DEFAULT_MS),
    });
    if (!res.ok) return httpErrorResult(res);
    const data = (await res.json()) as { instance_id: string };
    return { content: [{ type: 'text', text: `Unloaded ${data.instance_id}` }] };
  } catch (error) {
    return errorResult(error);
  }
}
