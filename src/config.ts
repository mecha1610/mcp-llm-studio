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

export function openaiUrl(path: string): string {
  return `${LM_STUDIO_URL}/v1/${path.replace(/^\//, '')}`;
}

export function nativeUrl(path: string): string {
  return `${LM_STUDIO_URL}/api/v1/${path.replace(/^\//, '')}`;
}
