import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { handleChat } from '../../src/tools/chat.js';

function makeDb() {
  const db = new Database(':memory:');
  db.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  ).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id)`).run();
  return db;
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

  it('returns error on network failure', async () => {
    const db = makeDb();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await handleChat(
      { session_id: 's5', action: 'send', message: 'Hi', model: 'gemma' },
      db,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

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

  it('does not persist the user message when fetch throws a network error', async () => {
    const db = makeDb();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await handleChat(
      { session_id: 'corrupt-1', action: 'send', message: 'Hi', model: 'm', system: 'Sys' },
      db,
    );

    expect(result.isError).toBe(true);
    const rows = db.prepare('SELECT role FROM sessions WHERE id = ?').all('corrupt-1');
    expect(rows).toHaveLength(0);
  });

  it('does not persist the user message when LM Studio returns non-OK', async () => {
    const db = makeDb();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 503, statusText: 'Service Unavailable' }),
    );

    const result = await handleChat(
      { session_id: 'corrupt-2', action: 'send', message: 'Hi', model: 'm', system: 'Sys' },
      db,
    );

    expect(result.isError).toBe(true);
    const rows = db.prepare('SELECT role FROM sessions WHERE id = ?').all('corrupt-2');
    expect(rows).toHaveLength(0);
  });

  it('recovers cleanly — a failed send leaves no trace, next send is still a new session', async () => {
    const db = makeDb();
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'Welcome!' } }] }),
          { status: 200 },
        ),
      );

    await handleChat(
      { session_id: 'recover', action: 'send', message: 'Lost', model: 'm', system: 'Sys' },
      db,
    );
    await handleChat(
      { session_id: 'recover', action: 'send', message: 'Kept', model: 'm', system: 'Sys' },
      db,
    );

    const rows = db
      .prepare('SELECT role, content FROM sessions WHERE id = ? ORDER BY rowid ASC')
      .all('recover') as { role: string; content: string }[];
    expect(rows.map((r) => r.role)).toEqual(['system', 'user', 'assistant']);
    expect(rows.find((r) => r.role === 'user')?.content).toBe('Kept');
  });

  it('returns error when LM Studio response has no choices', async () => {
    const db = makeDb();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );

    const result = await handleChat(
      { session_id: 'empty', action: 'send', message: 'Hi', model: 'm' },
      db,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no choices');
    const rows = db.prepare('SELECT role FROM sessions WHERE id = ?').all('empty');
    expect(rows).toHaveLength(0);
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
});
