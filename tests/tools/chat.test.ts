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
});
