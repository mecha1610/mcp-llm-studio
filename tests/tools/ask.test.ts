import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAsk } from '../../src/tools/ask.js';

describe('handleAsk', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns buffered response without stream flag', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Hello from Gemma!' } }] }),
        { status: 200 },
      ),
    );

    const result = await handleAsk({ model: 'gemma-4-27b', prompt: 'Hi' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Hello from Gemma!');
  });

  it('includes system prompt in messages array when provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Bonjour!' } }] }),
        { status: 200 },
      ),
    );

    await handleAsk({ model: 'gemma-4-27b', prompt: 'Hi', system: 'Reply in French' });

    const callBody = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(callBody.messages[0]).toEqual({ role: 'system', content: 'Reply in French' });
    expect(callBody.messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('returns streamed response when stream: true', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
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

    const result = await handleAsk({ model: 'gemma-4-27b', prompt: 'Hi', stream: true });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Hello world');
  });

  it('returns error on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404, statusText: 'Not Found' }),
    );

    const result = await handleAsk({ model: 'bad-model', prompt: 'Hi' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('404');
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleAsk({ model: 'gemma-4-27b', prompt: 'Hi' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });
});
