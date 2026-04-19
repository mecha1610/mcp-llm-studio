import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import {
  openaiUrl,
  MCP_SESSIONS_DB,
  authHeaders,
  TIMEOUT_INFERENCE_MS,
  MAX_HISTORY_TURNS,
  MAX_HISTORY_BYTES,
} from '../config.js';
import { ToolResult, errorResult, httpErrorResult } from '../types.js';

interface Row {
  role: string;
  content: string;
}

export function ensureSchema(db: Database.Database): void {
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

function totalContentBytes(rows: Row[]): number {
  let sum = 0;
  for (const r of rows) sum += Buffer.byteLength(r.content, 'utf8');
  return sum;
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
  database: Database.Database,
  options?: { maxHistoryTurns?: number; maxHistoryBytes?: number },
): Promise<ToolResult> {
  const maxHistoryTurns = options?.maxHistoryTurns ?? MAX_HISTORY_TURNS;
  const maxHistoryBytes = options?.maxHistoryBytes ?? MAX_HISTORY_BYTES;
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

  // Preserve the (optional) system prompt at the head, then keep the most
  // recent `maxHistoryTurns` non-system rows — oldest non-system turns are
  // trimmed so a long-lived session cannot grow unbounded and blow the
  // model's context window or inflate request bodies.
  const systemRow = database
    .prepare(
      `SELECT role, content FROM sessions
       WHERE id = ? AND role = 'system'
       ORDER BY rowid ASC LIMIT 1`,
    )
    .get(args.session_id) as Row | undefined;

  const recentRows = database
    .prepare(
      `SELECT role, content FROM (
         SELECT role, content, rowid FROM sessions
         WHERE id = ? AND role != 'system'
         ORDER BY rowid DESC
         LIMIT ?
       ) ORDER BY rowid ASC`,
    )
    .all(args.session_id, maxHistoryTurns) as Row[];

  const history: Row[] = systemRow ? [systemRow, ...recentRows] : recentRows;
  const isNewSession = history.length === 0;
  const userMessage = args.message;

  const messages: Row[] = [...history];
  if (isNewSession && args.system) {
    messages.push({ role: 'system', content: args.system });
  }
  messages.push({ role: 'user', content: userMessage });

  // Turn-level cap (MAX_HISTORY_TURNS) bounds row count but not size. Drop the
  // oldest non-system row until the total serialized content is under the
  // byte budget. The system prompt and the just-pushed user message are
  // preserved — if the user message itself exceeds the budget, we let the
  // single-argument MAX_PROMPT_LEN cap at the Zod boundary do that job.
  while (totalContentBytes(messages) > maxHistoryBytes) {
    const idx = messages.findIndex(
      (m, i) => m.role !== 'system' && i !== messages.length - 1,
    );
    if (idx < 0) break;
    messages.splice(idx, 1);
  }

  try {
    const body: Record<string, unknown> = {
      model: args.model,
      messages,
      temperature: args.temperature ?? 0.7,
      max_tokens: args.max_tokens ?? 2048,
    };
    if (args.draft_model) body.draft_model = args.draft_model;
    if (args.ttl !== undefined) body.ttl = args.ttl;

    const res = await fetch(openaiUrl('chat/completions'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_INFERENCE_MS),
    });

    if (!res.ok) return httpErrorResult(res);

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
    return errorResult(error);
  }
}
