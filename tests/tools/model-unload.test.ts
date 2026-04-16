import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleModelUnload } from '../../src/tools/model-unload.js';

describe('handleModelUnload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('unloads a model and returns confirmation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ instance_id: 'qwen/qwen3.5-9b' }), { status: 200 }),
    );

    const result = await handleModelUnload({ model: 'qwen/qwen3.5-9b' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Unloaded qwen/qwen3.5-9b');
  });

  it('sends instance_id (mapped from model) in request body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ instance_id: 'gemma' }), { status: 200 }),
    );

    await handleModelUnload({ model: 'gemma' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body).toEqual({ instance_id: 'gemma' });
  });

  it('calls the native unload endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ instance_id: 'm' }), { status: 200 }),
    );

    await handleModelUnload({ model: 'm' });

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/models/unload');
  });

  it('returns error on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404, statusText: 'Not Found' }),
    );

    const result = await handleModelUnload({ model: 'missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('404');
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleModelUnload({ model: 'm' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });
});
