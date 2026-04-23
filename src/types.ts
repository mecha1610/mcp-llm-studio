import { LM_STUDIO_URL } from './config.js';

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: true;
};

export function errorResult(error: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: formatErrorMessage(error) }],
    isError: true,
  };
}

// Turn raw fetch/runtime errors into actionable text. The most common failure
// mode is LM Studio not running — a bare "fetch failed" gives users no
// direction, so we detect the underlying Node error code and cite the URL
// that was attempted along with the fix.
function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = (error.cause as { code?: unknown })?.code;
    if (code === 'ECONNREFUSED') {
      return `Failed: cannot reach LM Studio at ${LM_STUDIO_URL}. Is the LM Studio server running? (LM Studio → Developer tab → Start Server)`;
    }
    if (code === 'ENOTFOUND') {
      return `Failed: LM Studio hostname in LM_STUDIO_URL (${LM_STUDIO_URL}) could not be resolved`;
    }
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return `Failed: request to LM Studio timed out. For very large models, raise LM_STUDIO_TIMEOUT_LOAD_MS / LM_STUDIO_TIMEOUT_INFERENCE_MS`;
    }
    return `Failed: ${error.message}`;
  }
  return `Failed: ${String(error)}`;
}

const MAX_ERROR_BODY_SNIPPET = 1024;

export async function httpErrorResult(res: Response): Promise<ToolResult> {
  let detail = '';
  try {
    const body = await res.text();
    if (body) {
      const snippet =
        body.length > MAX_ERROR_BODY_SNIPPET
          ? body.slice(0, MAX_ERROR_BODY_SNIPPET) + '…'
          : body;
      detail = `: ${extractMessage(snippet) ?? snippet}`;
    }
  } catch {
    // Body already consumed or unavailable — fall back to status line only.
  }
  return {
    content: [
      { type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}${detail}` },
    ],
    isError: true,
  };
}

// LM Studio errors arrive as JSON with one of these shapes. Pick the most
// informative string available; fall back to the raw snippet otherwise.
function extractMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as {
      message?: unknown;
      error?: unknown;
    };
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.error === 'string') return parsed.error;
    if (
      parsed.error &&
      typeof parsed.error === 'object' &&
      'message' in parsed.error &&
      typeof (parsed.error as { message: unknown }).message === 'string'
    ) {
      return (parsed.error as { message: string }).message;
    }
  } catch {
    // not JSON — caller will use the raw snippet
  }
  return undefined;
}
