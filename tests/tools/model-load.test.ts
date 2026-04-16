import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleModelLoad } from '../../src/tools/model-load.js';

describe('handleModelLoad', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads a model with default params and returns confirmation with context info', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: 'llm',
          instance_id: 'qwen/qwen3.5-9b',
          load_time_seconds: 9.1,
          status: 'loaded',
          load_config: { context_length: 16384 },
        }),
        { status: 200 },
      ),
    );

    const result = await handleModelLoad({ model: 'qwen/qwen3.5-9b' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Loaded qwen/qwen3.5-9b');
    expect(result.content[0].text).toContain('(llm)');
    expect(result.content[0].text).toContain('9.1s');
    expect(result.content[0].text).toContain('16384');
  });

  it('passes optional params to the API body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: 'llm',
          instance_id: 'm',
          load_time_seconds: 1,
          status: 'loaded',
        }),
        { status: 200 },
      ),
    );

    await handleModelLoad({
      model: 'm',
      context_length: 8192,
      gpu: 0.8,
      flash_attention: true,
      ttl: 3600,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.model).toBe('m');
    expect(body.context_length).toBe(8192);
    expect(body.gpu).toBe(0.8);
    expect(body.flash_attention).toBe(true);
    expect(body.ttl).toBe(3600);
    expect(body.echo_load_config).toBe(true);
  });

  it('omits undefined optional params from the body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: 'llm',
          instance_id: 'm',
          load_time_seconds: 1,
          status: 'loaded',
        }),
        { status: 200 },
      ),
    );

    await handleModelLoad({ model: 'm' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body).toEqual({ model: 'm', echo_load_config: true });
  });

  it('calls the native load endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: 'llm',
          instance_id: 'm',
          load_time_seconds: 1,
          status: 'loaded',
        }),
        { status: 200 },
      ),
    );

    await handleModelLoad({ model: 'm' });

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/models/load');
  });

  it('returns error on non-OK response (e.g. VRAM full)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('insufficient memory', { status: 507, statusText: 'Insufficient Storage' }),
    );

    const result = await handleModelLoad({ model: 'huge-model' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('507');
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleModelLoad({ model: 'm' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });
});
