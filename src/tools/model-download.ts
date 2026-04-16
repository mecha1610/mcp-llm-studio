import { nativeUrl, authHeaders } from '../config.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

type StartResponse = {
  job_id?: string;
  status: string;
  total_size_bytes?: number;
  started_at?: string;
};

type PollResponse = {
  job_id: string;
  status: 'downloading' | 'paused' | 'completed' | 'failed';
  total_size_bytes?: number;
  downloaded_bytes?: number;
  started_at?: string;
  completed_at?: string;
  bytes_per_second?: number;
  estimated_completion?: string;
};

export async function handleModelDownload(
  args: { model: string; quantization?: string },
  options?: { pollIntervalMs?: number; timeoutMs?: number },
): Promise<ToolResult> {
  const pollMs = options?.pollIntervalMs ?? 5000;
  const timeoutMs = options?.timeoutMs ?? 120_000;

  try {
    const startBody: Record<string, unknown> = { model: args.model };
    if (args.quantization) startBody.quantization = args.quantization;

    const startRes = await fetch(nativeUrl('models/download'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(startBody),
      signal: AbortSignal.timeout(30_000),
    });
    if (!startRes.ok) {
      return {
        content: [
          { type: 'text', text: `LM Studio error: ${startRes.status} ${startRes.statusText}` },
        ],
        isError: true,
      };
    }
    const startData = (await startRes.json()) as StartResponse;

    if (startData.status === 'already_downloaded') {
      return {
        content: [{ type: 'text', text: `Already downloaded: ${args.model}` }],
      };
    }
    if (startData.status === 'failed') {
      return {
        content: [{ type: 'text', text: `Download failed: ${args.model}` }],
        isError: true,
      };
    }
    if (!startData.job_id) {
      return {
        content: [{ type: 'text', text: `Unexpected response: no job_id returned` }],
        isError: true,
      };
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let lastStatus: PollResponse = {
      job_id: startData.job_id,
      status: 'downloading',
      total_size_bytes: startData.total_size_bytes,
      started_at: startData.started_at,
    };

    while (!controller.signal.aborted) {
      await new Promise((r) => setTimeout(r, pollMs));
      if (controller.signal.aborted) break;
      let pollRes: Response;
      try {
        pollRes = await fetch(nativeUrl(`models/download/status/${startData.job_id}`), {
          headers: authHeaders(),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) break;
        throw err;
      }
      if (!pollRes.ok) {
        clearTimeout(timeoutHandle);
        return {
          content: [
            { type: 'text', text: `Poll error: ${pollRes.status} ${pollRes.statusText}` },
          ],
          isError: true,
        };
      }
      lastStatus = (await pollRes.json()) as PollResponse;

      if (lastStatus.status === 'completed') {
        clearTimeout(timeoutHandle);
        const gb = (lastStatus.total_size_bytes ?? 0) / 1e9;
        const elapsed =
          lastStatus.completed_at && lastStatus.started_at
            ? (Date.parse(lastStatus.completed_at) - Date.parse(lastStatus.started_at)) / 1000
            : 0;
        return {
          content: [
            {
              type: 'text',
              text: `Downloaded ${args.model} (${gb.toFixed(1)} GB) in ${elapsed.toFixed(0)}s`,
            },
          ],
        };
      }
      if (lastStatus.status === 'failed') {
        clearTimeout(timeoutHandle);
        return {
          content: [{ type: 'text', text: `Download failed: ${args.model}` }],
          isError: true,
        };
      }
    }
    clearTimeout(timeoutHandle);

    const downloadedGB = (lastStatus.downloaded_bytes ?? 0) / 1e9;
    const totalGB = (lastStatus.total_size_bytes ?? 0) / 1e9;
    const pct = totalGB > 0 ? ((downloadedGB / totalGB) * 100).toFixed(0) : '?';
    return {
      content: [
        {
          type: 'text',
          text: `Still downloading ${args.model}: ${pct}% (${downloadedGB.toFixed(1)}/${totalGB.toFixed(1)} GB) — internal poll timeout (job_id: ${startData.job_id})`,
        },
      ],
    };
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
