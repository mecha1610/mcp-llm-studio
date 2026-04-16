import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleModelDownload } from '../../src/tools/model-download.js';

function mockFetchSequence(responses: Response[]) {
  const spy = vi.spyOn(globalThis, 'fetch');
  for (const r of responses) spy.mockResolvedValueOnce(r);
  return spy;
}

describe('handleModelDownload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns immediately when model is already_downloaded', async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ status: 'already_downloaded' }), { status: 200 }),
    ]);

    const result = await handleModelDownload(
      { model: 'qwen/qwen3.5-9b' },
      { pollIntervalMs: 1, timeoutMs: 1000 },
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Already downloaded');
    expect(result.content[0].text).toContain('qwen/qwen3.5-9b');
  });

  it('polls until status is completed and returns summary', async () => {
    const startedAt = '2026-04-16T10:00:00.000Z';
    const completedAt = '2026-04-16T10:00:45.000Z';

    mockFetchSequence([
      new Response(
        JSON.stringify({
          job_id: 'job_abc',
          status: 'downloading',
          total_size_bytes: 2_300_000_000,
          started_at: startedAt,
        }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({
          job_id: 'job_abc',
          status: 'downloading',
          total_size_bytes: 2_300_000_000,
          downloaded_bytes: 1_000_000_000,
        }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({
          job_id: 'job_abc',
          status: 'completed',
          total_size_bytes: 2_300_000_000,
          downloaded_bytes: 2_300_000_000,
          started_at: startedAt,
          completed_at: completedAt,
        }),
        { status: 200 },
      ),
    ]);

    const result = await handleModelDownload(
      { model: 'qwen/qwen3.5-9b' },
      { pollIntervalMs: 1, timeoutMs: 5000 },
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Downloaded qwen/qwen3.5-9b');
    expect(result.content[0].text).toContain('2.3 GB');
    expect(result.content[0].text).toContain('45s');
  });

  it('returns error when download fails mid-poll', async () => {
    mockFetchSequence([
      new Response(
        JSON.stringify({
          job_id: 'job_x',
          status: 'downloading',
          total_size_bytes: 1_000_000_000,
          started_at: '2026-04-16T10:00:00.000Z',
        }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({ job_id: 'job_x', status: 'failed' }),
        { status: 200 },
      ),
    ]);

    const result = await handleModelDownload(
      { model: 'bad/model' },
      { pollIntervalMs: 1, timeoutMs: 5000 },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Download failed');
  });

  it('returns progress status with job_id on timeout', async () => {
    mockFetchSequence([
      new Response(
        JSON.stringify({
          job_id: 'job_slow',
          status: 'downloading',
          total_size_bytes: 10_000_000_000,
          started_at: '2026-04-16T10:00:00.000Z',
        }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({
          job_id: 'job_slow',
          status: 'downloading',
          total_size_bytes: 10_000_000_000,
          downloaded_bytes: 3_000_000_000,
        }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({
          job_id: 'job_slow',
          status: 'downloading',
          total_size_bytes: 10_000_000_000,
          downloaded_bytes: 5_000_000_000,
        }),
        { status: 200 },
      ),
    ]);

    const result = await handleModelDownload(
      { model: 'huge/model' },
      { pollIntervalMs: 5, timeoutMs: 20 },
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Still downloading');
    expect(result.content[0].text).toContain('huge/model');
    expect(result.content[0].text).toContain('job_slow');
  });

  it('passes quantization parameter to request body when provided', async () => {
    const fetchSpy = mockFetchSequence([
      new Response(JSON.stringify({ status: 'already_downloaded' }), { status: 200 }),
    ]);

    await handleModelDownload(
      { model: 'https://huggingface.co/some/model', quantization: 'Q4_K_M' },
      { pollIntervalMs: 1, timeoutMs: 1000 },
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body).toEqual({
      model: 'https://huggingface.co/some/model',
      quantization: 'Q4_K_M',
    });
  });

  it('returns error when start request fails', async () => {
    mockFetchSequence([
      new Response('bad request', { status: 400, statusText: 'Bad Request' }),
    ]);

    const result = await handleModelDownload(
      { model: 'bad' },
      { pollIntervalMs: 1, timeoutMs: 1000 },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('400');
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleModelDownload(
      { model: 'm' },
      { pollIntervalMs: 1, timeoutMs: 1000 },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  it('rejects a malformed job_id containing URL control characters', async () => {
    mockFetchSequence([
      new Response(
        JSON.stringify({
          job_id: '../admin/evict',
          status: 'downloading',
          total_size_bytes: 100,
        }),
        { status: 200 },
      ),
    ]);

    const result = await handleModelDownload(
      { model: 'm' },
      { pollIntervalMs: 1, timeoutMs: 1000 },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('malformed job_id');
  });

  it('returns error when poll request hits a network failure', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: 'job_p',
            status: 'downloading',
            total_size_bytes: 1_000_000_000,
            started_at: '2026-04-16T10:00:00.000Z',
          }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleModelDownload(
      { model: 'm' },
      { pollIntervalMs: 1, timeoutMs: 5000 },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });
});
