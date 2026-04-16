import { nativeUrl, authHeaders, TIMEOUT_INFERENCE_MS } from '../config.js';
import { ToolResult, errorResult, httpErrorResult } from '../types.js';

type Stats = {
  tokens_per_second?: number;
  time_to_first_token_seconds?: number;
  input_tokens?: number;
  total_output_tokens?: number;
  reasoning_output_tokens?: number;
};

export async function handleAsk(args: {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  reasoning?: 'off' | 'low' | 'medium' | 'high' | 'on';
  context_length?: number;
  stream?: boolean;
}): Promise<ToolResult> {
  try {
    const body: Record<string, unknown> = {
      model: args.model,
      input: args.prompt,
      store: false,
      max_output_tokens: args.max_tokens ?? 2048,
      stream: args.stream ?? false,
    };
    if (args.system) body.system_prompt = args.system;
    if (args.temperature !== undefined) body.temperature = args.temperature;
    if (args.reasoning) body.reasoning = args.reasoning;
    if (args.context_length !== undefined) body.context_length = args.context_length;

    const res = await fetch(nativeUrl('chat'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_INFERENCE_MS),
    });
    if (!res.ok) return httpErrorResult(res);

    if (args.stream) {
      const { text, reasoning, stats } = await consumeNativeSSE(res);
      return { content: [{ type: 'text', text: formatAskOutput(text, reasoning, stats) }] };
    }

    const data = (await res.json()) as {
      output: { type: string; content: string }[];
      stats?: Stats;
    };

    let text = '';
    let reasoning = '';
    for (const item of data.output ?? []) {
      if (item.type === 'message') text += item.content;
      else if (item.type === 'reasoning') reasoning += item.content;
    }

    return {
      content: [{ type: 'text', text: formatAskOutput(text, reasoning, data.stats) }],
    };
  } catch (error) {
    return errorResult(error);
  }
}

function formatAskOutput(text: string, reasoning: string, stats?: Stats): string {
  let out = text || '(empty response)';
  if (reasoning) out += `\n\n---\nReasoning: ${reasoning}`;
  if (stats) {
    const parts: string[] = [];
    if (stats.tokens_per_second !== undefined)
      parts.push(`${stats.tokens_per_second.toFixed(1)} tok/s`);
    if (stats.time_to_first_token_seconds !== undefined)
      parts.push(`TTFT ${stats.time_to_first_token_seconds.toFixed(1)}s`);
    if (stats.input_tokens !== undefined && stats.total_output_tokens !== undefined)
      parts.push(`${stats.input_tokens} in → ${stats.total_output_tokens} out`);
    if (parts.length) out += `\n\n📊 ${parts.join(' | ')}`;
  }
  return out;
}

async function consumeNativeSSE(
  res: Response,
): Promise<{ text: string; reasoning: string; stats?: Stats }> {
  if (!res.body) return { text: '(empty stream)', reasoning: '' };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let reasoning = '';
  let stats: Stats | undefined;
  let buffer = '';

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    try {
      const event = JSON.parse(payload) as {
        type?: string;
        content?: string;
        result?: { stats?: Stats };
      };
      if (event.type === 'message.delta' && event.content) text += event.content;
      else if (event.type === 'reasoning.delta' && event.content) reasoning += event.content;
      else if (event.type === 'chat.end') stats = event.result?.stats;
    } catch {
      // malformed SSE line — skip
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Split on CRLF or LF. Keep the trailing (possibly incomplete) line
    // in the buffer so an event split across chunks is reassembled.
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
  }

  // Flush any final decoded bytes and leftover line.
  buffer += decoder.decode();
  if (buffer.length > 0) handleLine(buffer);

  return { text, reasoning, stats };
}
