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
  const userMessage = args.message;

  const messages: Row[] = [...history];
  if (isNewSession && args.system) {
    messages.push({ role: 'system', content: args.system });
  }
  messages.push({ role: 'user', content: userMessage });

  try {
    const body: Record<string, unknown> = {
      model: args.model,
      messages,
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
      choices?: { message: { content: string; reasoning_content?: string } }[];
    };
    if (!data.choices?.length) {
      return {
        content: [{ type: 'text', text: 'LM Studio returned no choices in response' }],
        isError: true,
      };
    }
    const message = data.choices[0].message;
    const reply = message?.content ?? '(empty response)';
    const reasoning = message?.reasoning_content;

    // Persist the full turn atomically only after a confirmed response.
    // If the fetch throws or returns non-OK, nothing is written — no orphan
    // user row can corrupt the history on the next call.
    const now = Date.now();
    const insert = database.prepare(
      'INSERT INTO sessions (id, role, content, created_at) VALUES (?, ?, ?, ?)',
    );
    const persistTurn = database.transaction(() => {
      if (isNewSession && args.system) {
        insert.run(args.session_id, 'system', args.system, now);
      }
      insert.run(args.session_id, 'user', userMessage, now + 1);
      insert.run(args.session_id, 'assistant', reply, now + 2);
    });
    persistTurn();

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
