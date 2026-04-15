import { describe, it, expect, vi, beforeEach } from 'vitest';

const LM_STUDIO_URL = 'http://192.168.10.56:1234';

async function fetchModels(baseUrl: string): Promise<{ id: string }[]> {
  const res = await fetch(`${baseUrl}/v1/models`);
  if (!res.ok) throw new Error(`LM Studio error: ${res.status} ${res.statusText}`);
  const data = await res.json() as { data: { id: string }[] };
  return data.data;
}

describe('fetchModels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns model list from LM Studio API', async () => {
    const mockResponse = {
      data: [
        { id: 'gemma-4-27b' },
        { id: 'nomic-embed-text-v1.5' },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const models = await fetchModels(LM_STUDIO_URL);
    expect(models).toEqual([
      { id: 'gemma-4-27b' },
      { id: 'nomic-embed-text-v1.5' },
    ]);
    expect(fetch).toHaveBeenCalledWith(`${LM_STUDIO_URL}/v1/models`);
  });

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500, statusText: 'Internal Server Error' }),
    );
    await expect(fetchModels(LM_STUDIO_URL)).rejects.toThrow('LM Studio error: 500');
  });
});
