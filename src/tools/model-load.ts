import { nativeUrl, authHeaders, TIMEOUT_LOAD_MS } from '../config.js';
import { ToolResult, errorResult, httpErrorResult } from '../types.js';

export async function handleModelLoad(args: {
  model: string;
  context_length?: number;
  gpu?: number;
  flash_attention?: boolean;
  ttl?: number;
}): Promise<ToolResult> {
  try {
    const body: Record<string, unknown> = {
      model: args.model,
      echo_load_config: true,
    };
    if (args.context_length !== undefined) body.context_length = args.context_length;
    if (args.gpu !== undefined) body.gpu = args.gpu;
    if (args.flash_attention !== undefined) body.flash_attention = args.flash_attention;
    if (args.ttl !== undefined) body.ttl = args.ttl;

    const res = await fetch(nativeUrl('models/load'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_LOAD_MS),
    });
    if (!res.ok) return httpErrorResult(res);
    const data = (await res.json()) as {
      type: string;
      instance_id: string;
      load_time_seconds: number;
      status: string;
      load_config?: { context_length?: number };
    };
    const contextInfo = data.load_config?.context_length
      ? ` — context: ${data.load_config.context_length}`
      : '';
    return {
      content: [
        {
          type: 'text',
          text: `Loaded ${data.instance_id} (${data.type}) in ${data.load_time_seconds.toFixed(1)}s${contextInfo}`,
        },
      ],
    };
  } catch (error) {
    return errorResult(error);
  }
}
