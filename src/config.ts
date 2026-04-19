// src/config.ts
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

export const LM_STUDIO_URL = process.env.LM_STUDIO_URL ?? 'http://localhost:1234';
export const LM_STUDIO_API_KEY = process.env.LM_STUDIO_API_KEY ?? '';
export const MCP_SESSIONS_DB =
  process.env.MCP_SESSIONS_DB ?? path.join(os.homedir(), '.mcp-llm-studio', 'sessions.db');

export const TIMEOUT_DEFAULT_MS = 30_000;
export const TIMEOUT_INFERENCE_MS = 120_000;
export const TIMEOUT_LOAD_MS = 300_000;

// Cap on the bytes we will accumulate from a single SSE response. Prevents a
// runaway server (or adversarial response) from forcing unbounded growth of
// the text/reasoning/buffer strings in consumeNativeSSE.
export const MAX_SSE_BYTES = 10 * 1024 * 1024;

// Cap on the number of rows replayed into the LM Studio request for a chat
// session. Without this, long sessions quietly blow the model's context
// window and inflate request bodies.
export const MAX_HISTORY_TURNS = 100;

// Input bounds enforced at the MCP boundary (Zod). Values are generous but
// prevent a single oversized argument from allocating hundreds of MB.
export const MAX_ID_LEN = 256;
export const MAX_PROMPT_LEN = 1_048_576; // 1 MiB
export const MAX_EMBED_INPUT_ITEMS = 1024;

export const VERSION = '3.1.0';

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
