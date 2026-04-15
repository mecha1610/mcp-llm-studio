# mcp-llm-studio Production-Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the single-file MCP server into a modular, tested, production-ready package with streaming, persistent chat sessions, CI, and Claude Code registration.

**Architecture:** Move all business logic from `src/index.ts` into focused `src/tools/*.ts` modules, with shared config in `src/config.ts`. `src/server.ts` becomes the pure assembly entrypoint. Tests import real handlers instead of duplicating logic.

**Tech Stack:** TypeScript (ESM, Node16), `@modelcontextprotocol/sdk`, `zod`, `better-sqlite3`, `dotenv`, `vitest`, GitHub Actions

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
cd /Users/thomas/Documents/GitHub/mcp-llm-studio
npm install better-sqlite3 dotenv
npm install --save-dev @types/better-sqlite3
```

- [ ] **Step 2: Verify package.json was updated**

```bash
grep -E '"better-sqlite3"|"dotenv"|"@types/better-sqlite3"' package.json
```

Expected: three matching lines.

- [ ] **Step 3: Commit**

```bash
cd /Users/thomas/Documents/GitHub/mcp-llm-studio
git add package.json package-lock.json
git commit -m "chore: install better-sqlite3, dotenv and types"
```

---

### Task 2: Create `src/config.ts`

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Create the config module**

```typescript
// src/config.ts
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

export const LM_STUDIO_URL = process.env.LM_STUDIO_URL ?? 'http://192.168.10.56:1234';
export const LM_STUDIO_API_KEY = process.env.LM_STUDIO_API_KEY ?? '';
export const MCP_SESSIONS_DB =
  process.env.MCP_SESSIONS_DB ?? path.join(os.homedir(), '.mcp-llm-studio', 'sessions.db');

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (LM_STUDIO_API_KEY) headers['Authorization'] = `Bearer ${LM_STUDIO_API_KEY}`;
  return headers;
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
git commit -m "feat: add src/config.ts — centralized env + auth headers"
```

---

### Task 3: Create `src/tools/models.ts` with tests

**Files:**
- Create: `src/tools/models.ts`
- Create: `tests/tools/models.test.ts`

- [ ] **Step 1: Write the failing test first**

```typescript
// tests/tools/models.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListModels } from '../../src/tools/models.js';

describe('handleListModels', () => {
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

    const result = await handleListModels();
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('gemma-4-27b');
    expect(result.content[0].text).toContain('nomic-embed-text-v1.5');
  });

  it('returns error on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500, statusText: 'Internal Server Error' }),
    );

    const result = await handleListModels();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('500');
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleListModels();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/thomas/Documents/GitHub/mcp-llm-studio
npx vitest run tests/tools/models.test.ts
```

Expected: FAIL — `Cannot find module '../../src/tools/models.js'`

- [ ] **Step 3: Create the handler**

```typescript
// src/tools/models.ts
import { LM_STUDIO_URL, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleListModels(): Promise<ToolResult> {
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/models`, {
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
        { type: 'text', text: `Available models:\n${models.map((m) => `- ${m}`).join('\n')}` },
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

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run tests/tools/models.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/tools/models.ts tests/tools/models.test.ts
git commit -m "feat: add models tool with tests"
```

---

### Task 4: Create `src/tools/embed.ts` with tests

**Files:**
- Create: `src/tools/embed.ts`
- Create: `tests/tools/embed.test.ts`

- [ ] **Step 1: Write the failing test first**

```typescript
// tests/tools/embed.test.ts
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
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/tools/embed.test.ts
```

Expected: FAIL — `Cannot find module '../../src/tools/embed.js'`

- [ ] **Step 3: Create the handler**

```typescript
// src/tools/embed.ts
import { LM_STUDIO_URL, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleEmbed(args: {
  model: string;
  input: string | string[];
}): Promise<ToolResult> {
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/embeddings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model: args.model, input: args.input }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }
    const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    const summary = data.data
      .map((d) => `[${d.index}] ${d.embedding.length} dimensions`)
      .join('\n');
    return {
      content: [
        { type: 'text', text: `Embeddings generated:\n${summary}` },
        { type: 'text', text: JSON.stringify(data.data) },
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

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run tests/tools/embed.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/tools/embed.ts tests/tools/embed.test.ts
git commit -m "feat: add embed tool with tests"
```

---

### Task 5: Create `src/tools/ask.ts` with streaming and tests

**Files:**
- Create: `src/tools/ask.ts`
- Create: `tests/tools/ask.test.ts`

- [ ] **Step 1: Write the failing test first**

```typescript
// tests/tools/ask.test.ts
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
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/tools/ask.test.ts
```

Expected: FAIL — `Cannot find module '../../src/tools/ask.js'`

- [ ] **Step 3: Create the handler**

```typescript
// src/tools/ask.ts
import { LM_STUDIO_URL, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

export async function handleAsk(args: {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}): Promise<ToolResult> {
  try {
    const messages: { role: string; content: string }[] = [];
    if (args.system) messages.push({ role: 'system', content: args.system });
    messages.push({ role: 'user', content: args.prompt });

    const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: args.model,
        messages,
        temperature: args.temperature ?? 0.7,
        max_tokens: args.max_tokens ?? 2048,
        stream: args.stream ?? false,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }

    if (args.stream) {
      const text = await consumeSSEStream(res);
      return { content: [{ type: 'text', text }] };
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const reply = data.choices[0]?.message?.content ?? '(empty response)';
    return { content: [{ type: 'text', text: reply }] };
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

async function consumeSSEStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices: { delta?: { content?: string } }[];
        };
        accumulated += parsed.choices[0]?.delta?.content ?? '';
      } catch {
        // malformed SSE line — skip
      }
    }
  }

  return accumulated;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run tests/tools/ask.test.ts
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/tools/ask.ts tests/tools/ask.test.ts
git commit -m "feat: add ask tool with optional SSE streaming and tests"
```

---

### Task 6: Create `src/tools/chat.ts` with SQLite sessions and tests

**Files:**
- Create: `src/tools/chat.ts`
- Create: `tests/tools/chat.test.ts`

- [ ] **Step 1: Write the failing test first**

```typescript
// tests/tools/chat.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { handleChat } from '../../src/tools/chat.js';

function makeDb() {
  return new Database(':memory:');
}

describe('handleChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores first message with system prompt and returns assistant reply', async () => {
    const db = makeDb();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Hi there!' } }] }),
        { status: 200 },
      ),
    );

    const result = await handleChat(
      {
        session_id: 'test-1',
        action: 'send',
        message: 'Hello',
        model: 'gemma-4-27b',
        system: 'Be brief.',
      },
      db,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Hi there!');

    const rows = db
      .prepare('SELECT role FROM sessions WHERE id = ?')
      .all('test-1') as { role: string }[];
    expect(rows.map((r) => r.role)).toEqual(['system', 'user', 'assistant']);
  });

  it('accumulates history across multiple calls', async () => {
    const db = makeDb();

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'Reply 1' } }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'Reply 2' } }] }),
          { status: 200 },
        ),
      );

    await handleChat({ session_id: 's1', action: 'send', message: 'Msg 1', model: 'gemma' }, db);
    await handleChat({ session_id: 's1', action: 'send', message: 'Msg 2', model: 'gemma' }, db);

    const rows = db
      .prepare('SELECT role FROM sessions WHERE id = ?')
      .all('s1') as { role: string }[];
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('ignores system prompt on subsequent sends', async () => {
    const db = makeDb();

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'R1' } }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'R2' } }] }),
          { status: 200 },
        ),
      );

    await handleChat(
      { session_id: 's2', action: 'send', message: 'First', model: 'gemma', system: 'Be a pirate.' },
      db,
    );
    await handleChat(
      {
        session_id: 's2',
        action: 'send',
        message: 'Second',
        model: 'gemma',
        system: 'Ignored system.',
      },
      db,
    );

    const rows = db
      .prepare("SELECT * FROM sessions WHERE id = ? AND role = 'system'")
      .all('s2') as { content: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('Be a pirate.');
  });

  it('reset clears session and returns confirmation', async () => {
    const db = makeDb();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Hi' } }] }),
        { status: 200 },
      ),
    );

    await handleChat({ session_id: 'r1', action: 'send', message: 'Hello', model: 'gemma' }, db);

    const result = await handleChat({ session_id: 'r1', action: 'reset', model: 'gemma' }, db);
    expect(result.content[0].text).toMatch(/Session r1 cleared \(\d+ messages deleted\)/);

    const rows = db.prepare('SELECT * FROM sessions WHERE id = ?').all('r1');
    expect(rows).toHaveLength(0);
  });

  it('returns error when message missing on send', async () => {
    const db = makeDb();
    const result = await handleChat({ session_id: 's3', action: 'send', model: 'gemma' }, db);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('message');
  });

  it('returns error on LM Studio non-OK response', async () => {
    const db = makeDb();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 503, statusText: 'Service Unavailable' }),
    );

    const result = await handleChat(
      { session_id: 's4', action: 'send', message: 'Hi', model: 'gemma' },
      db,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('503');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/tools/chat.test.ts
```

Expected: FAIL — `Cannot find module '../../src/tools/chat.js'`

- [ ] **Step 3: Create the handler**

```typescript
// src/tools/chat.ts
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
  return new Database(MCP_SESSIONS_DB);
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
  },
  db?: Database.Database,
): Promise<ToolResult> {
  const database = db ?? openProductionDb();
  ensureSchema(database);

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

  // action === 'send'
  if (!args.message) {
    return {
      content: [{ type: 'text', text: 'Error: message is required when action is "send"' }],
      isError: true,
    };
  }

  const history = database
    .prepare('SELECT role, content FROM sessions WHERE id = ? ORDER BY created_at ASC')
    .all(args.session_id) as Row[];

  const isNewSession = history.length === 0;
  const now = Date.now();
  const insert = database.prepare(
    'INSERT INTO sessions (id, role, content, created_at) VALUES (?, ?, ?, ?)',
  );

  // System prompt stored only on first message of session
  if (isNewSession && args.system) {
    insert.run(args.session_id, 'system', args.system, now);
    history.push({ role: 'system', content: args.system });
  }

  insert.run(args.session_id, 'user', args.message, now + 1);
  history.push({ role: 'user', content: args.message });

  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: args.model,
        messages: history,
        temperature: args.temperature ?? 0.7,
        max_tokens: args.max_tokens ?? 2048,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const reply = data.choices[0]?.message?.content ?? '(empty response)';

    insert.run(args.session_id, 'assistant', reply, now + 2);

    return { content: [{ type: 'text', text: reply }] };
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

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run tests/tools/chat.test.ts
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/tools/chat.ts tests/tools/chat.test.ts
git commit -m "feat: add chat tool with SQLite-backed session history and tests"
```

---

### Task 7: Create `src/server.ts` and run full test suite

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Create the server assembly**

```typescript
// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleListModels } from './tools/models.js';
import { handleAsk } from './tools/ask.js';
import { handleChat, openProductionDb } from './tools/chat.js';
import { handleEmbed } from './tools/embed.js';

const server = new McpServer(
  { name: 'llm-studio', version: '2.0.0' },
  {
    instructions:
      'MCP server for LM Studio. Use list_models to see available models, ask for single-turn chat (with optional streaming), chat for multi-turn conversations with persistent history, embed to generate embeddings.',
  },
);

server.registerTool(
  'list_models',
  {
    title: 'List Models',
    description: 'List all models currently loaded in LM Studio',
    inputSchema: z.object({}),
  },
  () => handleListModels(),
);

server.registerTool(
  'ask',
  {
    title: 'Ask Model',
    description: 'Send a prompt to a specific LLM model on LM Studio and get a response',
    inputSchema: z.object({
      model: z.string().describe('Model ID from LM Studio (use list_models to see available models)'),
      prompt: z.string().describe('The question or prompt to send'),
      system: z.string().optional().describe('Optional system prompt'),
      temperature: z.number().min(0).max(2).optional().describe('Sampling temperature (default 0.7)'),
      max_tokens: z.number().min(1).optional().describe('Max tokens in response (default 2048)'),
      stream: z.boolean().optional().describe('Enable token streaming (default false)'),
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
      'Multi-turn conversation with persistent history stored in SQLite. Use session_id to resume previous conversations.',
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
  console.error('LLM Studio MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /Users/thomas/Documents/GitHub/mcp-llm-studio
npx vitest run
```

Expected: All tests in `tests/tools/` pass.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: add src/server.ts — pure MCP assembly using modular tool handlers"
```

---

### Task 8: Update package.json, delete old files, add .env.example

**Files:**
- Modify: `package.json`
- Delete: `src/index.ts`, `tests/index.test.ts`
- Create: `.env.example`

- [ ] **Step 1: Update package.json**

Edit `package.json` to set `"main": "dist/server.js"`, `"version": "2.0.0"`, and add `test:coverage` script:

```json
{
  "name": "mcp-llm-studio",
  "version": "2.0.0",
  "description": "MCP server for LM Studio multi-model hub",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^9.0.0",
    "dotenv": "^16.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

Keep the exact semver ranges from `package-lock.json` — only update `"main"` and `"version"` if the template above shows different installed ranges.

- [ ] **Step 2: Delete old files**

```bash
cd /Users/thomas/Documents/GitHub/mcp-llm-studio
rm src/index.ts tests/index.test.ts
```

- [ ] **Step 3: Create .env.example**

Create `.env.example`:

```bash
LM_STUDIO_URL=http://192.168.10.56:1234
LM_STUDIO_API_KEY=          # optional Bearer token
MCP_SESSIONS_DB=~/.mcp-llm-studio/sessions.db
```

- [ ] **Step 4: Run full test suite and build**

```bash
npx vitest run && npm run build
```

Expected: all tests pass, `dist/server.js` generated cleanly.

- [ ] **Step 5: Commit**

```bash
git add package.json .env.example
git rm src/index.ts tests/index.test.ts
git commit -m "chore: remove old index.ts, update package.json to server.js entrypoint, add .env.example"
```

---

### Task 9: Add GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --coverage
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions build + test workflow"
```

---

### Task 10: Register with Claude Code and update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Register the server with Claude Code**

```bash
claude mcp add llm-studio \
  -e LM_STUDIO_URL=http://192.168.10.56:1234 \
  -- node /Users/thomas/Documents/GitHub/mcp-llm-studio/dist/server.js
```

- [ ] **Step 2: Verify registration**

```bash
claude mcp list
```

Expected: `llm-studio` appears in the list.

- [ ] **Step 3: Update CLAUDE.md**

Replace the full contents of `CLAUDE.md` with:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that bridges Claude Code to local LM Studio models. It exposes four tools over stdio transport: `list_models`, `ask` (chat completions with optional streaming), `chat` (persistent multi-turn sessions via SQLite), and `embed` (text embeddings). All tools proxy requests to the LM Studio OpenAI-compatible API.

## Commands

```bash
npm run build           # Compile TypeScript → dist/
npm run dev             # Watch mode compilation
npm run start           # Run the compiled server (stdio transport)
npm run test            # Run tests with vitest
npm run test:coverage   # Run tests with coverage report
```

## Architecture

- `src/config.ts` — env vars, LM_STUDIO_URL, MCP_SESSIONS_DB, authHeaders()
- `src/tools/models.ts` — handleListModels()
- `src/tools/ask.ts` — handleAsk() with optional SSE streaming
- `src/tools/chat.ts` — handleChat() with SQLite-backed session history, openProductionDb()
- `src/tools/embed.ts` — handleEmbed()
- `src/server.ts` — MCP assembly: imports handlers, registers tools, connects StdioServerTransport

## Configuration

- `LM_STUDIO_URL` — LM Studio base URL (default: `http://192.168.10.56:1234`)
- `LM_STUDIO_API_KEY` — optional Bearer token
- `MCP_SESSIONS_DB` — SQLite DB path (default: `~/.mcp-llm-studio/sessions.db`)

Copy `.env.example` to `.env` for local overrides.

## Testing

Tests are in `tests/tools/*.test.ts` using vitest. They import real handlers from `src/tools/*.ts` and mock `globalThis.fetch` with `vi.spyOn`. The chat handler accepts an optional `db` parameter injected as `:memory:` SQLite — no filesystem side effects.

## Registration

```bash
claude mcp add llm-studio \
  -e LM_STUDIO_URL=http://192.168.10.56:1234 \
  -- node /Users/thomas/Documents/GitHub/mcp-llm-studio/dist/server.js
```
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for modular architecture and registration"
```

---

### Task 11: Create `docs/agent-integration.md`

**Files:**
- Create: `docs/agent-integration.md`

- [ ] **Step 1: Create the integration guide**

```markdown
# Agent Integration Guide

Other agents (e.g. `ibkr-agent`) can use the LM Studio MCP server as a subprocess via stdio.

## TypeScript Example

Install `@modelcontextprotocol/sdk` in the consuming agent, then:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/thomas/Documents/GitHub/mcp-llm-studio/dist/server.js'],
  env: { LM_STUDIO_URL: 'http://192.168.10.56:1234' },
});

const client = new Client({ name: 'my-agent', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

// Single-turn ask
const result = await client.callTool({
  name: 'ask',
  arguments: {
    model: 'gemma-4-27b',
    prompt: 'Summarize the S&P 500 today.',
    system: 'You are a financial analyst. Be concise.',
  },
});

// Persistent chat session
const chatResult = await client.callTool({
  name: 'chat',
  arguments: {
    session_id: 'ibkr-research-1',
    action: 'send',
    message: 'What was the trend?',
    model: 'gemma-4-27b',
    system: 'You are a trading assistant.',
  },
});

await client.close();
```

## Session Management

- Each `session_id` maintains its own message history in SQLite
- Call `action: "reset"` to clear a session before starting a new research thread
- The `system` prompt is applied only on the first message of a new session

## Available Tools

| Tool | Purpose |
|------|---------|
| `list_models` | List models loaded in LM Studio |
| `ask` | Single-turn prompt, optional `stream: true` |
| `chat` | Multi-turn with `session_id` and `action: send\|reset` |
| `embed` | Generate embeddings via `/v1/embeddings` |
```

- [ ] **Step 2: Commit**

```bash
git add docs/agent-integration.md
git commit -m "docs: add agent integration guide with TypeScript example"
```

---

## Self-Review

| Spec requirement | Task |
|---|---|
| `src/config.ts` with LM_STUDIO_URL, MCP_SESSIONS_DB, authHeaders() | Task 2 |
| `src/tools/models.ts` — handleListModels exported | Task 3 |
| `src/tools/embed.ts` — handleEmbed exported | Task 4 |
| `src/tools/ask.ts` — optional streaming | Task 5 |
| `src/tools/chat.ts` — SQLite sessions, reset, system on first send only | Task 6 |
| `src/server.ts` — pure MCP assembly | Task 7 |
| Tests import real handlers (no logic duplication) | Tasks 3–6 |
| SQLite `:memory:` injection for tests | Task 6 |
| `better-sqlite3`, `dotenv` installed | Task 1 |
| `.env.example` | Task 8 |
| `package.json` main → server.js | Task 8 |
| Old `src/index.ts` and `tests/index.test.ts` deleted | Task 8 |
| GitHub Actions CI (build + test jobs) | Task 9 |
| `claude mcp add llm-studio` registration | Task 10 |
| `docs/agent-integration.md` | Task 11 |
| `reset` returns "Session <id> cleared (N messages deleted)" | Task 6 tests |
| System prompt ignored on subsequent sends | Task 6 tests |
| Model not stored in DB (passed per call) | Task 6 implementation |

All spec requirements covered. No gaps.
