import { openaiUrl, authHeaders, TIMEOUT_DEFAULT_MS } from '../config.js';
import { ToolResult, errorResult, httpErrorResult } from '../types.js';

export async function handleModelList(): Promise<ToolResult> {
  try {
    const res = await fetch(openaiUrl('models'), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_DEFAULT_MS),
    });
    if (!res.ok) return httpErrorResult(res);
    const data = (await res.json()) as { data?: { id?: string }[] };
    if (!Array.isArray(data?.data)) {
      return {
        content: [{ type: 'text', text: 'LM Studio returned an unexpected model list shape (no "data" array)' }],
        isError: true,
      };
    }
    const models = data.data.map((m) => m.id).filter((id): id is string => typeof id === 'string');
    return {
      content: [
        { type: 'text', text: `Loaded models:\n${models.map((m) => `- ${m}`).join('\n')}` },
      ],
    };
  } catch (error) {
    return errorResult(error);
  }
}
