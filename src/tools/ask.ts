import { LM_STUDIO_URL, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleAsk(args: {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}): Promise<ToolResult> {
  try {
    const messages: { role: string; content: string }[] = [];
    if (args.system) messages.push({ role: 'system', content: args.system });
    messages.push({ role: 'user', content: args.prompt });

    const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: args.model,
        messages,
        temperature: args.temperature ?? 0.7,
        max_tokens: args.max_tokens ?? 2048,
        stream: args.stream ?? false,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }

    if (args.stream) {
      const text = await consumeSSEStream(res);
      return { content: [{ type: 'text', text }] };
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const reply = data.choices[0]?.message?.content ?? '(empty response)';
    return { content: [{ type: 'text', text: reply }] };
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

async function consumeSSEStream(res: Response): Promise<string> {
  if (!res.body) {
    return '(empty stream)';
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices: { delta?: { content?: string } }[];
        };
        accumulated += parsed.choices[0]?.delta?.content ?? '';
      } catch {
        // malformed SSE line — skip
      }
    }
  }

  return accumulated;
}
