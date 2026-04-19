export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: true;
};

export function errorResult(error: unknown): ToolResult {
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
