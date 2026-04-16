import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleModelList } from '../../src/tools/model-list.js';

describe('handleModelList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns formatted model list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ id: 'gemma-4-27b' }, { id: 'nomic-embed-text-v1.5' }] }),
        { status: 200 },
      ),
    );

    const result = await handleModelList();
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('gemma-4-27b');
    expect(result.content[0].text).toContain('nomic-embed-text-v1.5');
  });

  it('returns error on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500, statusText: 'Internal Server Error' }),
    );

    const result = await handleModelList();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('500');
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleModelList();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });
});
