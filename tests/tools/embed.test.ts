import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleEmbed } from '../../src/tools/embed.js';

describe('handleEmbed', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns embedding summary for a single string', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }] }),
        { status: 200 },
      ),
    );

    const result = await handleEmbed({ model: 'nomic-embed', input: 'hello' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('3 dimensions');
    expect(JSON.parse(result.content[1].text)).toEqual([{ embedding: [0.1, 0.2, 0.3], index: 0 }]);
  });

  it('returns embedding summary for multiple strings', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { embedding: [0.1, 0.2], index: 0 },
            { embedding: [0.3, 0.4], index: 1 },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await handleEmbed({ model: 'nomic-embed', input: ['hello', 'world'] });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('[0]');
    expect(result.content[0].text).toContain('[1]');
  });

  it('returns error on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500, statusText: 'Server Error' }),
    );

    const result = await handleEmbed({ model: 'nomic-embed', input: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('500');
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleEmbed({ model: 'nomic-embed', input: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  it('surfaces an actionable message when LM Studio refuses the connection', async () => {
    // Node's real undici error wraps the cause with {code:'ECONNREFUSED'}.
    const err = new TypeError('fetch failed');
    (err as { cause?: unknown }).cause = { code: 'ECONNREFUSED' };
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(err);

    const result = await handleEmbed({ model: 'nomic-embed', input: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/cannot reach LM Studio/i);
    expect(result.content[0].text).toMatch(/Start Server/i);
  });

  it('returns a typed error when LM Studio responds without a data array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'something' }), { status: 200 }),
    );

    const result = await handleEmbed({ model: 'nomic-embed', input: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/unexpected embeddings shape/i);
  });
});
