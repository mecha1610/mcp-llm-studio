import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAsk } from '../../src/tools/ask.js';

describe('handleAsk (native API)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns buffered response with message text only', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [{ type: 'message', content: 'Hello from Gemma!' }],
        }),
        { status: 200 },
      ),
    );

    const result = await handleAsk({ model: 'gemma-4-27b', prompt: 'Hi' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Hello from Gemma!');
  });

  it('includes reasoning separator when reasoning content is present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [
            { type: 'reasoning', content: 'Let me think about this...' },
            { type: 'message', content: 'The answer is 42' },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await handleAsk({
      model: 'qwen/qwen3.5-9b',
      prompt: 'What is the meaning of life?',
      reasoning: 'high',
    });
    expect(result.content[0].text).toContain('The answer is 42');
    expect(result.content[0].text).toContain('---');
    expect(result.content[0].text).toContain('Reasoning:');
    expect(result.content[0].text).toContain('Let me think about this');
  });

  it('includes stats footer when stats are present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [{ type: 'message', content: 'Hi' }],
          stats: {
            tokens_per_second: 42.3,
            time_to_first_token_seconds: 0.4,
            input_tokens: 150,
            total_output_tokens: 200,
          },
        }),
        { status: 200 },
      ),
    );

    const result = await handleAsk({ model: 'm', prompt: 'Hi' });
    expect(result.content[0].text).toContain('42.3 tok/s');
    expect(result.content[0].text).toContain('TTFT 0.4s');
    expect(result.content[0].text).toContain('150 in');
    expect(result.content[0].text).toContain('200 out');
  });

  it('maps prompt to input, system to system_prompt, max_tokens to max_output_tokens, sets store:false', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ output: [{ type: 'message', content: 'ok' }] }),
        { status: 200 },
      ),
    );

    await handleAsk({
      model: 'm',
      prompt: 'Question',
      system: 'Be brief',
      max_tokens: 512,
      temperature: 0.5,
      reasoning: 'medium',
      context_length: 8192,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.model).toBe('m');
    expect(body.input).toBe('Question');
    expect(body.system_prompt).toBe('Be brief');
    expect(body.max_output_tokens).toBe(512);
    expect(body.temperature).toBe(0.5);
    expect(body.reasoning).toBe('medium');
    expect(body.context_length).toBe(8192);
    expect(body.store).toBe(false);
  });

  it('calls the native chat endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ output: [{ type: 'message', content: 'ok' }] }),
        { status: 200 },
      ),
    );

    await handleAsk({ model: 'm', prompt: 'Hi' });

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/chat');
    expect(url).not.toContain('/v1/chat/completions');
  });

  it('accumulates streamed message deltas and reasoning deltas', async () => {
    const sseChunks = [
      'data: {"type":"chat.start","model_instance_id":"m"}\n\n',
      'data: {"type":"reasoning.delta","content":"thinking"}\n\n',
      'data: {"type":"reasoning.delta","content":" done"}\n\n',
      'data: {"type":"message.delta","content":"Hello"}\n\n',
      'data: {"type":"message.delta","content":" world"}\n\n',
      'data: {"type":"chat.end","result":{"stats":{"tokens_per_second":30}}}\n\n',
    ];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(stream, { status: 200 }),
    );

    const result = await handleAsk({ model: 'm', prompt: 'Hi', stream: true });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Hello world');
    expect(result.content[0].text).toContain('thinking done');
    expect(result.content[0].text).toContain('30.0 tok/s');
  });

  it('reassembles SSE events split across chunk boundaries', async () => {
    // A single `data:` event is intentionally split mid-JSON across two chunks.
    // Without a carry-forward buffer, both halves fail to parse and content
    // is silently dropped.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"message.del'));
        controller.enqueue(encoder.encode('ta","content":"hello"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"message.delta","content":" wo'));
        controller.enqueue(encoder.encode('rld"}\n\ndata: {"type":"chat.end","result":{"stats":{"tokens_per_second":10}}}\n\n'));
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(stream, { status: 200 }),
    );

    const result = await handleAsk({ model: 'm', prompt: 'Hi', stream: true });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('hello world');
    expect(result.content[0].text).toContain('10.0 tok/s');
  });

  it('truncates and errors when SSE response exceeds the byte cap', async () => {
    const encoder = new TextEncoder();
    // Each chunk is ~1 KiB of padding hidden inside a valid SSE event. We
    // set maxBytes below the sum so the third chunk trips the cap.
    const pad = 'x'.repeat(1024);
    const chunks = [
      `data: {"type":"message.delta","content":"${pad}"}\n\n`,
      `data: {"type":"message.delta","content":"${pad}"}\n\n`,
      `data: {"type":"message.delta","content":"${pad}"}\n\n`,
    ];
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(stream, { status: 200 }),
    );

    const result = await handleAsk(
      { model: 'm', prompt: 'Hi', stream: true },
      { maxBytes: 2048 },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('truncated');
    expect(result.content[0].text).toContain('2048');
  });

  it('returns error on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404, statusText: 'Not Found' }),
    );

    const result = await handleAsk({ model: 'bad', prompt: 'Hi' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('404');
  });

  it('surfaces LM Studio JSON error body in the error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: 'Model not loaded: qwen-7b' } }),
        { status: 422, statusText: 'Unprocessable Entity' },
      ),
    );

    const result = await handleAsk({ model: 'qwen-7b', prompt: 'Hi' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('422');
    expect(result.content[0].text).toContain('Model not loaded: qwen-7b');
  });

  it('surfaces plain-text error body when response is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('VRAM allocation failed', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    const result = await handleAsk({ model: 'm', prompt: 'Hi' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('VRAM allocation failed');
  });

  it('coerces null content items without producing "null" text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [
            { type: 'message', content: null },
            { type: 'message', content: 'actual reply' },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await handleAsk({ model: 'm', prompt: 'Hi' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).not.toContain('null');
    expect(result.content[0].text).toContain('actual reply');
  });

  it('aborts the SSE reader when no chunk arrives within the idle timeout', async () => {
    // Stream that sends one chunk then hangs indefinitely.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"type":"message.delta","content":"hi"}\n\n'),
        );
        // never close, never push again → reader.read() blocks forever
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(stream, { status: 200 }),
    );

    const result = await handleAsk(
      { model: 'm', prompt: 'Hi', stream: true },
      { idleTimeoutMs: 50 },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('idle');
    expect(result.content[0].text).toContain('50');
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleAsk({ model: 'm', prompt: 'Hi' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });
});
