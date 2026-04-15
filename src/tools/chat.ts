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

  // action === 'send'
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
