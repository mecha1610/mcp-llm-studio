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

async function askModel(
  baseUrl: string,
  model: string,
  prompt: string,
  system?: string,
  temperature = 0.7,
  max_tokens = 2048,
): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
  });
  if (!res.ok) throw new Error(`LM Studio error: ${res.status} ${res.statusText}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

describe('askModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends chat completion request and returns response', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello from Gemma!' } }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await askModel(LM_STUDIO_URL, 'gemma-4-27b', 'Hi');
    expect(result).toBe('Hello from Gemma!');
    expect(fetch).toHaveBeenCalledWith(
      `${LM_STUDIO_URL}/v1/chat/completions`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('includes system prompt when provided', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Bonjour!' } }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    await askModel(LM_STUDIO_URL, 'gemma-4-27b', 'Hi', 'Reply in French');
    const callBody = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(callBody.messages[0]).toEqual({ role: 'system', content: 'Reply in French' });
    expect(callBody.messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404, statusText: 'Not Found' }),
    );
    await expect(askModel(LM_STUDIO_URL, 'bad-model', 'Hi')).rejects.toThrow('LM Studio error: 404');
  });
});
