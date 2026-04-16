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

  it('returns error on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404, statusText: 'Not Found' }),
    );

    const result = await handleAsk({ model: 'bad', prompt: 'Hi' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('404');
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleAsk({ model: 'm', prompt: 'Hi' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });
});
