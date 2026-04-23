// src/config.ts
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

export const LM_STUDIO_URL = process.env.LM_STUDIO_URL ?? 'http://localhost:1234';
export const LM_STUDIO_API_KEY = process.env.LM_STUDIO_API_KEY ?? '';
export const MCP_SESSIONS_DB =
  process.env.MCP_SESSIONS_DB ?? path.join(os.homedir(), '.mcp-llm-studio', 'sessions.db');

// Parse a positive-integer env var, falling back to the given default when the
// variable is unset, empty, non-numeric, non-integer, or non-positive. Exported
// for tests.
export function readEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
}

export const TIMEOUT_DEFAULT_MS = readEnvInt('LM_STUDIO_TIMEOUT_DEFAULT_MS', 30_000);
export const TIMEOUT_INFERENCE_MS = readEnvInt('LM_STUDIO_TIMEOUT_INFERENCE_MS', 120_000);
export const TIMEOUT_LOAD_MS = readEnvInt('LM_STUDIO_TIMEOUT_LOAD_MS', 300_000);

// Idle timeout for SSE read loop. A slow-drip upstream can keep the TCP
// connection open while sending no data; the overall fetch timeout may not
// fire because headers already arrived. We abort the reader if no chunk
// arrives for this many ms.
export const SSE_IDLE_TIMEOUT_MS = readEnvInt('LM_STUDIO_SSE_IDLE_TIMEOUT_MS', 60_000);

// Polling cadence and overall deadline for model_download status polling.
// Exposed so operators on slow networks (or huge models) can extend the
// internal budget without hitting the "still downloading" early-return.
export const DOWNLOAD_POLL_INTERVAL_MS = readEnvInt(
  'LM_STUDIO_DOWNLOAD_POLL_INTERVAL_MS',
  5_000,
);
export const DOWNLOAD_POLL_TIMEOUT_MS = readEnvInt(
  'LM_STUDIO_DOWNLOAD_POLL_TIMEOUT_MS',
  120_000,
);

// Cap on the bytes we will accumulate from a single SSE response. Prevents a
// runaway server (or adversarial response) from forcing unbounded growth of
// the text/reasoning/buffer strings in consumeNativeSSE.
export const MAX_SSE_BYTES = 10 * 1024 * 1024;

// Cap on the number of rows replayed into the LM Studio request for a chat
// session. Without this, long sessions quietly blow the model's context
// window and inflate request bodies.
export const MAX_HISTORY_TURNS = 100;

// Additional byte-level cap on the replayed history. MAX_HISTORY_TURNS alone
// is not enough: each row can be up to MAX_PROMPT_LEN (1 MiB), so 100 rows
// could produce a ~100 MiB request body. Oldest non-system rows are dropped
// until the total is under this budget.
export const MAX_HISTORY_BYTES = 10 * 1024 * 1024;

// Input bounds enforced at the MCP boundary (Zod). Values are generous but
// prevent a single oversized argument from allocating hundreds of MB.
export const MAX_ID_LEN = 256;
export const MAX_URL_LEN = 2048;
export const MAX_PROMPT_LEN = 1_048_576; // 1 MiB
export const MAX_EMBED_INPUT_ITEMS = 1024;

export const VERSION = '3.1.4';

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
