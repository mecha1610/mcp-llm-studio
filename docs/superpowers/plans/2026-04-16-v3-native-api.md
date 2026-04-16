# mcp-llm-studio v3 — Native API Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the MCP server from v2 (4 tools, OpenAI-compat only) to v3 (7 tools, hybrid native + OpenAI-compat), adding full model lifecycle management (load/unload/download) and rewriting `ask` to use LM Studio's native `/api/v1/chat` endpoint with reasoning control and per-request stats.

**Architecture:** Hybrid API surface — LM Studio native REST (`/api/v1/*`) for model management and `ask`, OpenAI-compat (`/v1/*`) for `chat` (multi-turn with SQLite replay) and `embed`. SQLite retained for chat persistence across LM Studio restarts. One handler file per tool, matching existing v2 structure.

**Tech Stack:** TypeScript (ESM, Node16), `@modelcontextprotocol/sdk`, `zod`, `better-sqlite3`, `dotenv`, `vitest`

**Reference spec:** `docs/superpowers/specs/2026-04-16-v3-native-api-design.md`

---

### Task 1: Add URL helpers to config.ts

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add `openaiUrl` and `nativeUrl` helpers**

Replace the contents of `src/config.ts` with:

```typescript
// src/config.ts
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

export const LM_STUDIO_URL = process.env.LM_STUDIO_URL ?? 'http://localhost:1234';
export const LM_STUDIO_API_KEY = process.env.LM_STUDIO_API_KEY ?? '';
export const MCP_SESSIONS_DB =
  process.env.MCP_SESSIONS_DB ?? path.join(os.homedir(), '.mcp-llm-studio', 'sessions.db');

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (LM_STUDIO_API_KEY) headers['Authorization'] = `Bearer ${LM_STUDIO_API_KEY}`;
  return headers;
}

export function openaiUrl(path: string): string {
  return `${LM_STUDIO_URL}/v1/${path.replace(/^\//, '')}`;
}

export function nativeUrl(path: string): string {
  return `${LM_STUDIO_URL}/api/v1/${path.replace(/^\//, '')}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/thomas/Documents/GitHub/mcp-llm-studio
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat(config): add openaiUrl and nativeUrl helpers for v3 hybrid API"
```

---

### Task 2: Bump version to 3.0.0

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

In `package.json`, change `"version": "2.0.0"` to `"version": "3.0.0"`.

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 3.0.0 for v3 native API integration"
```

---

### Task 3: Implement `model_list` (renamed from `list_models`)

**Files:**
- Create: `src/tools/model-list.ts`
- Create: `tests/tools/model-list.test.ts`
- Delete (end of task): `src/tools/models.ts`, `tests/tools/models.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/model-list.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/thomas/Documents/GitHub/mcp-llm-studio
npx vitest run tests/tools/model-list.test.ts
```

Expected: FAIL with "Cannot find module '../../src/tools/model-list.js'".

- [ ] **Step 3: Write the implementation**

Create `src/tools/model-list.ts`:

```typescript
import { openaiUrl, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleModelList(): Promise<ToolResult> {
  try {
    const res = await fetch(openaiUrl('models'), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }
    const data = (await res.json()) as { data: { id: string }[] };
    const models = data.data.map((m) => m.id);
    return {
      content: [
        { type: 'text', text: `Loaded models:\n${models.map((m) => `- ${m}`).join('\n')}` },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to reach LM Studio: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/model-list.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Delete the old `models.ts` and its test**

```bash
rm src/tools/models.ts tests/tools/models.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/model-list.ts tests/tools/model-list.test.ts src/tools/models.ts tests/tools/models.test.ts
git commit -m "feat(model-list): rename list_models to model_list with new module layout"
```

---

### Task 4: Implement `model_unload`

**Files:**
- Create: `src/tools/model-unload.ts`
- Create: `tests/tools/model-unload.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/model-unload.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/model-unload.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

Create `src/tools/model-unload.ts`:

```typescript
import { nativeUrl, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleModelUnload(args: {
  model: string;
}): Promise<ToolResult> {
  try {
    const res = await fetch(nativeUrl('models/unload'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ instance_id: args.model }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }
    const data = (await res.json()) as { instance_id: string };
    return { content: [{ type: 'text', text: `Unloaded ${data.instance_id}` }] };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/model-unload.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/model-unload.ts tests/tools/model-unload.test.ts
git commit -m "feat(model-unload): add native API tool to unload models from VRAM"
```

---

### Task 5: Implement `model_load`

**Files:**
- Create: `src/tools/model-load.ts`
- Create: `tests/tools/model-load.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/model-load.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/model-load.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

Create `src/tools/model-load.ts`:

```typescript
import { nativeUrl, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleModelLoad(args: {
  model: string;
  context_length?: number;
  gpu?: number;
  flash_attention?: boolean;
  ttl?: number;
}): Promise<ToolResult> {
  try {
    const body: Record<string, unknown> = {
      model: args.model,
      echo_load_config: true,
    };
    if (args.context_length !== undefined) body.context_length = args.context_length;
    if (args.gpu !== undefined) body.gpu = args.gpu;
    if (args.flash_attention !== undefined) body.flash_attention = args.flash_attention;
    if (args.ttl !== undefined) body.ttl = args.ttl;

    const res = await fetch(nativeUrl('models/load'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }
    const data = (await res.json()) as {
      type: string;
      instance_id: string;
      load_time_seconds: number;
      status: string;
      load_config?: { context_length?: number };
    };
    const contextInfo = data.load_config?.context_length
      ? ` — context: ${data.load_config.context_length}`
      : '';
    return {
      content: [
        {
          type: 'text',
          text: `Loaded ${data.instance_id} (${data.type}) in ${data.load_time_seconds.toFixed(1)}s${contextInfo}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/model-load.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/model-load.ts tests/tools/model-load.test.ts
git commit -m "feat(model-load): add native API tool to load models into VRAM"
```

---

### Task 6: Implement `model_download` (async with polling)

**Files:**
- Create: `src/tools/model-download.ts`
- Create: `tests/tools/model-download.test.ts`

**Design note:** The handler accepts an optional second arg `options?: { pollIntervalMs?: number; timeoutMs?: number }` so tests can inject small intervals without waiting 5 seconds per poll.

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/model-download.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/model-download.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

Create `src/tools/model-download.ts`:

```typescript
import { nativeUrl, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

type StartResponse = {
  job_id?: string;
  status: string;
  total_size_bytes?: number;
  started_at?: string;
};

type PollResponse = {
  job_id: string;
  status: 'downloading' | 'paused' | 'completed' | 'failed';
  total_size_bytes?: number;
  downloaded_bytes?: number;
  started_at?: string;
  completed_at?: string;
  bytes_per_second?: number;
  estimated_completion?: string;
};

export async function handleModelDownload(
  args: { model: string; quantization?: string },
  options?: { pollIntervalMs?: number; timeoutMs?: number },
): Promise<ToolResult> {
  const pollMs = options?.pollIntervalMs ?? 5000;
  const timeoutMs = options?.timeoutMs ?? 120_000;

  try {
    const startBody: Record<string, unknown> = { model: args.model };
    if (args.quantization) startBody.quantization = args.quantization;

    const startRes = await fetch(nativeUrl('models/download'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(startBody),
      signal: AbortSignal.timeout(30_000),
    });
    if (!startRes.ok) {
      return {
        content: [
          { type: 'text', text: `LM Studio error: ${startRes.status} ${startRes.statusText}` },
        ],
        isError: true,
      };
    }
    const startData = (await startRes.json()) as StartResponse;

    if (startData.status === 'already_downloaded') {
      return {
        content: [{ type: 'text', text: `Already downloaded: ${args.model}` }],
      };
    }
    if (startData.status === 'failed') {
      return {
        content: [{ type: 'text', text: `Download failed: ${args.model}` }],
        isError: true,
      };
    }
    if (!startData.job_id) {
      return {
        content: [{ type: 'text', text: `Unexpected response: no job_id returned` }],
        isError: true,
      };
    }

    const deadline = Date.now() + timeoutMs;
    let lastStatus: PollResponse = {
      job_id: startData.job_id,
      status: 'downloading',
      total_size_bytes: startData.total_size_bytes,
      started_at: startData.started_at,
    };

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs));
      const pollRes = await fetch(
        nativeUrl(`models/download/status/${startData.job_id}`),
        {
          headers: authHeaders(),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!pollRes.ok) {
        return {
          content: [
            { type: 'text', text: `Poll error: ${pollRes.status} ${pollRes.statusText}` },
          ],
          isError: true,
        };
      }
      lastStatus = (await pollRes.json()) as PollResponse;

      if (lastStatus.status === 'completed') {
        const gb = (lastStatus.total_size_bytes ?? 0) / 1e9;
        const elapsed =
          lastStatus.completed_at && lastStatus.started_at
            ? (Date.parse(lastStatus.completed_at) - Date.parse(lastStatus.started_at)) / 1000
            : 0;
        return {
          content: [
            {
              type: 'text',
              text: `Downloaded ${args.model} (${gb.toFixed(1)} GB) in ${elapsed.toFixed(0)}s`,
            },
          ],
        };
      }
      if (lastStatus.status === 'failed') {
        return {
          content: [{ type: 'text', text: `Download failed: ${args.model}` }],
          isError: true,
        };
      }
    }

    const downloadedGB = (lastStatus.downloaded_bytes ?? 0) / 1e9;
    const totalGB = (lastStatus.total_size_bytes ?? 0) / 1e9;
    const pct = totalGB > 0 ? ((downloadedGB / totalGB) * 100).toFixed(0) : '?';
    return {
      content: [
        {
          type: 'text',
          text: `Still downloading ${args.model}: ${pct}% (${downloadedGB.toFixed(1)}/${totalGB.toFixed(1)} GB) — internal poll timeout (job_id: ${startData.job_id})`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/model-download.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/model-download.ts tests/tools/model-download.test.ts
git commit -m "feat(model-download): add native API tool to download models with async polling"
```

---

### Task 7: Rewrite `ask` for native API

**Files:**
- Modify: `src/tools/ask.ts` (full rewrite)
- Modify: `tests/tools/ask.test.ts` (full rewrite)

**Design note:** The native `/api/v1/chat` endpoint returns `{ output: [{type: 'message'|'reasoning', content}], stats }` instead of OpenAI's `{ choices: [{ message }] }`. Streaming SSE events use a JSON payload with a `type` field (e.g. `message.delta`, `reasoning.delta`, `chat.end`) — we assume this format based on LM Studio docs. If the actual SSE stream uses the `event:` line header instead, adjust `consumeNativeSSE` accordingly.

- [ ] **Step 1: Replace the test file**

Replace the full contents of `tests/tools/ask.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/tools/ask.test.ts
```

Expected: FAIL (old ask.ts sends to /v1/chat/completions and uses old payload format).

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `src/tools/ask.ts`:

```typescript
import { nativeUrl, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

type Stats = {
  tokens_per_second?: number;
  time_to_first_token_seconds?: number;
  input_tokens?: number;
  total_output_tokens?: number;
  reasoning_output_tokens?: number;
};

export async function handleAsk(args: {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  reasoning?: 'off' | 'low' | 'medium' | 'high' | 'on';
  context_length?: number;
  stream?: boolean;
}): Promise<ToolResult> {
  try {
    const body: Record<string, unknown> = {
      model: args.model,
      input: args.prompt,
      store: false,
      max_output_tokens: args.max_tokens ?? 2048,
      stream: args.stream ?? false,
    };
    if (args.system) body.system_prompt = args.system;
    if (args.temperature !== undefined) body.temperature = args.temperature;
    if (args.reasoning) body.reasoning = args.reasoning;
    if (args.context_length !== undefined) body.context_length = args.context_length;

    const res = await fetch(nativeUrl('chat'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }

    if (args.stream) {
      const { text, reasoning, stats } = await consumeNativeSSE(res);
      return { content: [{ type: 'text', text: formatAskOutput(text, reasoning, stats) }] };
    }

    const data = (await res.json()) as {
      output: { type: string; content: string }[];
      stats?: Stats;
    };

    let text = '';
    let reasoning = '';
    for (const item of data.output ?? []) {
      if (item.type === 'message') text += item.content;
      else if (item.type === 'reasoning') reasoning += item.content;
    }

    return {
      content: [{ type: 'text', text: formatAskOutput(text, reasoning, data.stats) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

function formatAskOutput(text: string, reasoning: string, stats?: Stats): string {
  let out = text || '(empty response)';
  if (reasoning) out += `\n\n---\nReasoning: ${reasoning}`;
  if (stats) {
    const parts: string[] = [];
    if (stats.tokens_per_second !== undefined)
      parts.push(`${stats.tokens_per_second.toFixed(1)} tok/s`);
    if (stats.time_to_first_token_seconds !== undefined)
      parts.push(`TTFT ${stats.time_to_first_token_seconds.toFixed(1)}s`);
    if (stats.input_tokens !== undefined && stats.total_output_tokens !== undefined)
      parts.push(`${stats.input_tokens} in → ${stats.total_output_tokens} out`);
    if (parts.length) out += `\n\n📊 ${parts.join(' | ')}`;
  }
  return out;
}

async function consumeNativeSSE(
  res: Response,
): Promise<{ text: string; reasoning: string; stats?: Stats }> {
  if (!res.body) return { text: '(empty stream)', reasoning: '' };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let reasoning = '';
  let stats: Stats | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          content?: string;
          result?: { stats?: Stats };
        };
        if (event.type === 'message.delta' && event.content) text += event.content;
        else if (event.type === 'reasoning.delta' && event.content) reasoning += event.content;
        else if (event.type === 'chat.end') stats = event.result?.stats;
      } catch {
        // malformed SSE line — skip
      }
    }
  }

  return { text, reasoning, stats };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/tools/ask.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/ask.ts tests/tools/ask.test.ts
git commit -m "feat(ask)!: rewrite ask on native /api/v1/chat with reasoning and stats"
```

---

### Task 8: Evolve `chat` with `draft_model`, `ttl`, and `reasoning_content` parsing

**Files:**
- Modify: `src/tools/chat.ts`
- Modify: `tests/tools/chat.test.ts` (add new tests, keep existing)

- [ ] **Step 1: Add new tests to existing file**

Append these tests inside the `describe('handleChat', ...)` block in `tests/tools/chat.test.ts`, just before the closing `});` of the describe:

```typescript
  it('passes draft_model and ttl to request body when provided', async () => {
    const db = makeDb();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      ),
    );

    await handleChat(
      {
        session_id: 's-spec',
        action: 'send',
        message: 'Hi',
        model: 'qwen-7b',
        draft_model: 'qwen-0.5b',
        ttl: 600,
      },
      db,
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.draft_model).toBe('qwen-0.5b');
    expect(body.ttl).toBe(600);
  });

  it('omits draft_model and ttl from body when not provided', async () => {
    const db = makeDb();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      ),
    );

    await handleChat(
      { session_id: 's-plain', action: 'send', message: 'Hi', model: 'm' },
      db,
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.draft_model).toBeUndefined();
    expect(body.ttl).toBeUndefined();
  });

  it('appends reasoning_content as a separator block when present in response', async () => {
    const db = makeDb();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Final answer: 42',
                reasoning_content: 'I considered multiple approaches',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await handleChat(
      { session_id: 's-reason', action: 'send', message: 'Q', model: 'deepseek-r1' },
      db,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Final answer: 42');
    expect(result.content[0].text).toContain('---');
    expect(result.content[0].text).toContain('Reasoning:');
    expect(result.content[0].text).toContain('I considered multiple approaches');
  });

  it('stores only the visible assistant content (not reasoning) in session history', async () => {
    const db = makeDb();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Visible reply',
                reasoning_content: 'Hidden thinking',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await handleChat(
      { session_id: 's-store', action: 'send', message: 'Q', model: 'm' },
      db,
    );

    const rows = db
      .prepare("SELECT content FROM sessions WHERE id = ? AND role = 'assistant'")
      .all('s-store') as { content: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('Visible reply');
    expect(rows[0].content).not.toContain('Hidden thinking');
  });
```

- [ ] **Step 2: Run tests to verify new ones fail**

```bash
npx vitest run tests/tools/chat.test.ts
```

Expected: the 4 new tests fail (existing 7 pass). Failures: "body.draft_model to be 'qwen-0.5b'", "content to contain '---'", etc.

- [ ] **Step 3: Modify the implementation**

Replace the full contents of `src/tools/chat.ts`:

```typescript
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { LM_STUDIO_URL, MCP_SESSIONS_DB, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

interface Row {
  role: string;
  content: string;
}

function ensureSchema(db: Database.Database): void {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id)`,
  ).run();
}

export function openProductionDb(): Database.Database {
  const dir = path.dirname(MCP_SESSIONS_DB);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(MCP_SESSIONS_DB);
  ensureSchema(db);
  return db;
}

export async function handleChat(
  args: {
    session_id: string;
    action: 'send' | 'reset';
    message?: string;
    model: string;
    system?: string;
    temperature?: number;
    max_tokens?: number;
    draft_model?: string;
    ttl?: number;
  },
  db?: Database.Database,
): Promise<ToolResult> {
  const database = db ?? openProductionDb();

  if (args.action === 'reset') {
    const info = database
      .prepare('DELETE FROM sessions WHERE id = ?')
      .run(args.session_id);
    return {
      content: [
        {
          type: 'text',
          text: `Session ${args.session_id} cleared (${info.changes} messages deleted)`,
        },
      ],
    };
  }

  if (!args.message) {
    return {
      content: [{ type: 'text', text: 'Error: message is required when action is "send"' }],
      isError: true,
    };
  }

  const history = database
    .prepare('SELECT role, content FROM sessions WHERE id = ? ORDER BY rowid ASC')
    .all(args.session_id) as Row[];

  const isNewSession = history.length === 0;
  const now = Date.now();
  const insert = database.prepare(
    'INSERT INTO sessions (id, role, content, created_at) VALUES (?, ?, ?, ?)',
  );

  if (isNewSession && args.system) {
    insert.run(args.session_id, 'system', args.system, now);
    history.push({ role: 'system', content: args.system });
  }

  insert.run(args.session_id, 'user', args.message, now + 1);
  history.push({ role: 'user', content: args.message });

  try {
    const body: Record<string, unknown> = {
      model: args.model,
      messages: history,
      temperature: args.temperature ?? 0.7,
      max_tokens: args.max_tokens ?? 2048,
    };
    if (args.draft_model) body.draft_model = args.draft_model;
    if (args.ttl !== undefined) body.ttl = args.ttl;

    const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }

    const data = (await res.json()) as {
      choices: { message: { content: string; reasoning_content?: string } }[];
    };
    const message = data.choices[0]?.message;
    const reply = message?.content ?? '(empty response)';
    const reasoning = message?.reasoning_content;

    insert.run(args.session_id, 'assistant', reply, now + 2);

    const output = reasoning
      ? `${reply}\n\n---\nReasoning: ${reasoning}`
      : reply;

    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
npx vitest run tests/tools/chat.test.ts
```

Expected: PASS (11 tests total — 7 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/tools/chat.ts tests/tools/chat.test.ts
git commit -m "feat(chat): add draft_model, ttl params and reasoning_content parsing"
```

---

### Task 9: Wire up all 7 tools in server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Replace server.ts with v3 registration**

Replace the full contents of `src/server.ts`:

```typescript
// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleModelList } from './tools/model-list.js';
import { handleModelLoad } from './tools/model-load.js';
import { handleModelUnload } from './tools/model-unload.js';
import { handleModelDownload } from './tools/model-download.js';
import { handleAsk } from './tools/ask.js';
import { handleChat, openProductionDb } from './tools/chat.js';
import { handleEmbed } from './tools/embed.js';

const server = new McpServer(
  { name: 'llm-studio', version: '3.0.0' },
  {
    instructions:
      'MCP server for LM Studio (v3 hybrid native + OpenAI-compat). Tools: model_list/load/unload/download for lifecycle management, ask (native API with reasoning and stats), chat (multi-turn with SQLite persistence), embed (text embeddings).',
  },
);

server.registerTool(
  'model_list',
  {
    title: 'List Models',
    description: 'List all models currently loaded in LM Studio',
    inputSchema: z.object({}),
  },
  () => handleModelList(),
);

server.registerTool(
  'model_load',
  {
    title: 'Load Model',
    description: 'Load a model into VRAM. Synchronous — blocks until the model is ready (up to 5 minutes for large models).',
    inputSchema: z.object({
      model: z.string().describe('Model identifier (e.g. "qwen/qwen3.5-9b")'),
      context_length: z.number().min(1).optional().describe('Override default context window size'),
      gpu: z.number().min(0).max(1).optional().describe('GPU offload ratio 0-1 (llama.cpp)'),
      flash_attention: z.boolean().optional().describe('Enable flash attention (llama.cpp)'),
      ttl: z.number().optional().describe('Seconds before auto-evict (-1 = never)'),
    }),
  },
  (args) => handleModelLoad(args),
);

server.registerTool(
  'model_unload',
  {
    title: 'Unload Model',
    description: 'Unload a model from VRAM to free memory',
    inputSchema: z.object({
      model: z.string().describe('Model identifier to unload'),
    }),
  },
  (args) => handleModelUnload(args),
);

server.registerTool(
  'model_download',
  {
    title: 'Download Model',
    description: 'Download a model from the LM Studio catalog or HuggingFace. Polls progress internally for up to 2 minutes.',
    inputSchema: z.object({
      model: z.string().describe('Catalog model ID or HuggingFace URL'),
      quantization: z.string().optional().describe('e.g. "Q4_K_M" (HuggingFace URLs only)'),
    }),
  },
  (args) => handleModelDownload(args),
);

server.registerTool(
  'ask',
  {
    title: 'Ask Model',
    description: 'Single-turn inference via LM Studio native chat API. Supports reasoning control and returns per-request stats.',
    inputSchema: z.object({
      model: z.string().describe('Model ID (use model_list to see loaded models)'),
      prompt: z.string().describe('The question or prompt to send'),
      system: z.string().optional().describe('Optional system prompt'),
      temperature: z.number().min(0).max(2).optional().describe('Sampling temperature (default 0.7)'),
      max_tokens: z.number().min(1).optional().describe('Max output tokens (default 2048)'),
      reasoning: z
        .enum(['off', 'low', 'medium', 'high', 'on'])
        .optional()
        .describe('Thinking effort control for reasoning-capable models'),
      context_length: z.number().min(1).optional().describe('Override context window per-request'),
      stream: z.boolean().optional().describe('Enable SSE streaming (default false)'),
    }),
  },
  (args) => handleAsk(args),
);

const chatDb = openProductionDb();

server.registerTool(
  'chat',
  {
    title: 'Chat (Persistent)',
    description:
      'Multi-turn conversation with persistent history stored in SQLite. Use session_id to resume previous conversations. Supports speculative decoding and auto-evict.',
    inputSchema: z.object({
      session_id: z.string().describe('Arbitrary session identifier (e.g. "research-1")'),
      action: z
        .enum(['send', 'reset'])
        .describe('"send" to add a message, "reset" to clear the session'),
      message: z.string().optional().describe('Required when action is "send"'),
      model: z.string().describe('LM Studio model ID'),
      system: z
        .string()
        .optional()
        .describe('System prompt — applied only on first message of a new session'),
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().min(1).optional(),
      draft_model: z.string().optional().describe('Draft model for speculative decoding'),
      ttl: z.number().optional().describe('Auto-evict the model after N seconds of inactivity'),
    }),
  },
  (args) => handleChat(args, chatDb),
);

server.registerTool(
  'embed',
  {
    title: 'Embed Text',
    description: 'Generate embeddings for text using an embedding model on LM Studio',
    inputSchema: z.object({
      model: z.string().describe('Embedding model ID (e.g. nomic-embed-text-v1.5)'),
      input: z
        .union([z.string(), z.array(z.string())])
        .describe('Text or array of texts to embed'),
    }),
  },
  (args) => handleEmbed(args),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('LLM Studio MCP Server v3.0.0 running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/thomas/Documents/GitHub/mcp-llm-studio
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (should be 37 total: 3 model-list + 5 model-unload + 6 model-load + 7 model-download + 8 ask + 11 chat + 4 embed).

- [ ] **Step 4: Build the project**

```bash
npm run build
```

Expected: no errors, `dist/` regenerated.

- [ ] **Step 5: Smoke-test the compiled server starts**

```bash
node dist/server.js < /dev/null
```

Expected: prints `LLM Studio MCP Server v3.0.0 running on stdio` to stderr, then exits when stdin closes. If you see a crash or missing-import error, fix before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat(server): register 7 tools for v3 hybrid native + OpenAI-compat API"
```

---

### Task 10: Update README and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the current README**

```bash
cat /Users/thomas/Documents/GitHub/mcp-llm-studio/README.md
```

- [ ] **Step 2: Update the README tool list**

In `README.md`, find the section that describes the MCP tools (currently 4 tools: `list_models`, `ask`, `chat`, `embed`) and replace it with a section describing the 7 v3 tools. Use this content:

```markdown
## Tools

### Model management (native `/api/v1/*`)

- `model_list` — list loaded models
- `model_load` — load a model into VRAM (sync, up to 5 min for large models)
  - params: `model`, `context_length?`, `gpu?`, `flash_attention?`, `ttl?`
- `model_unload` — unload a model from VRAM
  - params: `model`
- `model_download` — download from catalog or HuggingFace (async, polls for up to 2 min)
  - params: `model`, `quantization?`

### Inference

- `ask` — single-turn via native `/api/v1/chat`, returns text + reasoning + stats
  - params: `model`, `prompt`, `system?`, `temperature?`, `max_tokens?`, `reasoning?`, `context_length?`, `stream?`
- `chat` — multi-turn with SQLite persistence via `/v1/chat/completions`
  - params: `session_id`, `action`, `message?`, `model`, `system?`, `temperature?`, `max_tokens?`, `draft_model?`, `ttl?`
- `embed` — text embeddings via `/v1/embeddings`
  - params: `model`, `input`
```

Also update any reference to `list_models` in the README to `model_list`, and bump the version references from 2.0.0 to 3.0.0.

- [ ] **Step 3: Update CLAUDE.md**

In `/Users/thomas/Documents/GitHub/mcp-llm-studio/CLAUDE.md`, replace the "What This Is" paragraph with:

```markdown
## What This Is

An MCP (Model Context Protocol) server that bridges Claude Code to local LM Studio models. It exposes seven tools over stdio transport, using a hybrid API surface: LM Studio's native REST API (`/api/v1/*`) for model lifecycle management (`model_list`, `model_load`, `model_unload`, `model_download`) and single-turn inference (`ask`), and the OpenAI-compatible API (`/v1/*`) for multi-turn chat with SQLite persistence (`chat`) and embeddings (`embed`).
```

In the "Architecture" section, replace the file list with:

```markdown
## Architecture

- `src/config.ts` — env vars, URL helpers (`openaiUrl`, `nativeUrl`), authHeaders()
- `src/tools/model-list.ts` — list loaded models (OpenAI compat)
- `src/tools/model-load.ts` — load model into VRAM (native API, sync)
- `src/tools/model-unload.ts` — unload from VRAM (native API)
- `src/tools/model-download.ts` — download + internal polling (native API, async)
- `src/tools/ask.ts` — single-turn via native `/api/v1/chat` with reasoning + stats
- `src/tools/chat.ts` — multi-turn with SQLite-backed session history (OpenAI compat)
- `src/tools/embed.ts` — text embeddings (OpenAI compat)
- `src/server.ts` — MCP assembly: imports handlers, registers 7 tools, connects StdioServerTransport
```

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update README and CLAUDE.md for v3 hybrid API and 7 tools"
```

---

### Task 11: Final verification

**Files:** (none modified)

- [ ] **Step 1: Full test run**

```bash
cd /Users/thomas/Documents/GitHub/mcp-llm-studio
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Coverage report**

```bash
npm run test:coverage
```

Expected: reasonable coverage on all tool handlers (>80% for handler logic).

- [ ] **Step 3: Clean build**

```bash
rm -rf dist
npm run build
```

Expected: no errors, fresh `dist/` with all 7 compiled tool files.

- [ ] **Step 4: Verify `dist/server.js` starts**

```bash
node dist/server.js < /dev/null
```

Expected: prints `LLM Studio MCP Server v3.0.0 running on stdio` to stderr.

- [ ] **Step 5: Live integration test against real LM Studio (manual, if available)**

If LM Studio is running on `http://localhost:1234` with a model loaded, run this quick smoke test from a Node REPL or a scratch file to verify the native API actually works. This is optional but recommended before claiming v3 is done:

```bash
curl -s http://localhost:1234/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-3-4b","input":"Say hello in one word","store":false,"max_output_tokens":20}' \
  | head -c 500
```

Expected: JSON response with `output` array containing a `message` object. If the response structure differs from what `src/tools/ask.ts` expects, fix the handler before marking v3 complete.

- [ ] **Step 6: Final commit log check**

```bash
git log --oneline -12
```

Verify you see all the v3 commits in order: config helpers, version bump, model-list, model-unload, model-load, model-download, ask rewrite, chat evolution, server wire-up, docs update.
