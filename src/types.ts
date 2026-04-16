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

export function httpErrorResult(res: Response): ToolResult {
  return {
    content: [
      { type: 'text', text: `LM Studio error: ${res.status} ${res.statusText}` },
    ],
    isError: true,
  };
}
