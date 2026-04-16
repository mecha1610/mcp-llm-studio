# MCP LLM Studio v3 — Native API Integration

## Summary

Evolve the MCP server from v2 (4 tools, OpenAI-compat only) to v3 (7 tools, hybrid native + OpenAI-compat). The native LM Studio REST API (`/api/v1/*`, introduced in v0.4.0) enables full model lifecycle management (load/unload/download) and richer inference with reasoning control and per-request stats. Chat persistence via SQLite is retained — LM Studio's native stateful chats are in-memory only and do not survive server restarts.

## Constraints

- Chat history must persist across LM Studio restarts (SQLite stays)
- Native `/api/v1/chat` does not support assistant messages in requests — multi-turn chat cannot replay history from SQLite on this endpoint
- Tool calling (function calling) is only available on OpenAI-compat `/v1/chat/completions`
- Model load is synchronous (blocks until complete); model download is asynchronous (polling via job_id)
- Tool renaming is acceptable; respect LM Studio API documentation naming

## Tool Inventory & API Mapping

| MCP Tool | LM Studio Endpoint | API Surface | Role |
|---|---|---|---|
| `model_list` | `GET /v1/models` | OpenAI compat | List loaded models |
| `model_load` | `POST /api/v1/models/load` | Native | Load a model into VRAM |
| `model_unload` | `POST /api/v1/models/unload` | Native | Unload a model from VRAM |
| `model_download` | `POST /api/v1/models/download` + `GET /api/v1/models/download/status/:job_id` | Native | Download from HuggingFace (async + polling) |
| `ask` | `POST /api/v1/chat` | Native | Single-turn inference with reasoning, stats |
| `chat` | `POST /v1/chat/completions` | OpenAI compat | Multi-turn with SQLite persistence |
| `embed` | `POST /v1/embeddings` | OpenAI compat | Text embeddings |

Architecture is hybrid: native API for model management + `ask`, OpenAI compat for `chat`/`embed` (technical constraint: native endpoint cannot replay message history).

`ask` migrates to native because it is single-turn (no need for assistant messages in request) and gains: `reasoning` param, `context_length` per-request, response stats (tokens/sec, TTFT).

## File Structure

```
src/
  config.ts              — base URL helpers for both API surfaces
  server.ts              — v3.0.0, registers 7 tools
  tools/
    model-list.ts        — GET /v1/models
    model-load.ts        — POST /api/v1/models/load (sync)
    model-unload.ts      — POST /api/v1/models/unload
    model-download.ts    — POST /api/v1/models/download + internal polling
    ask.ts               — POST /api/v1/chat (rewritten)
    chat.ts              — POST /v1/chat/completions + SQLite (evolved)
    embed.ts             — POST /v1/embeddings (unchanged)
```

### Config changes

`config.ts` adds two URL helpers:

- `openaiUrl(path)` — `${LM_STUDIO_URL}/v1/${path}` (chat/completions, embeddings, models)
- `nativeUrl(path)` — `${LM_STUDIO_URL}/api/v1/${path}` (models/load, models/unload, chat)

Existing exports unchanged: `LM_STUDIO_URL`, `LM_STUDIO_API_KEY`, `MCP_SESSIONS_DB`, `authHeaders()`.

### Deleted files

- `src/tools/models.ts` — replaced by `model-list.ts`

## Tool Contracts

### model_list

```
Input:  (none)
Output: "Loaded models:\n- model_id (type)\n..."
```

Calls `GET /v1/models`.

### model_load

```
Input:
  model: string              — required, model identifier (e.g. "qwen/qwen3.5-9b")
  context_length?: number    — override default context window
  gpu?: number               — GPU offload ratio 0-1 (llama.cpp)
  flash_attention?: boolean  — attention optimization (llama.cpp)
  ttl?: number               — seconds before auto-evict (-1 = never)

Output: "Loaded qwen/qwen3.5-9b (llm) in 9.1s — context: 16384"
```

Calls `POST /api/v1/models/load`. Synchronous — blocks until loaded. Timeout: 300s. Passes `echo_load_config: true` to get config in response.

### model_unload

```
Input:
  model: string  — required, model identifier (e.g. "qwen/qwen3.5-9b")

Output: "Unloaded qwen/qwen3.5-9b"
```

Calls `POST /api/v1/models/unload`. Maps `model` param to `instance_id` in the request body (LM Studio uses `instance_id` internally, but our MCP param is `model` for consistency with other tools).

### model_download

```
Input:
  model: string          — required, catalog ID or HuggingFace URL
  quantization?: string  — e.g. "Q4_K_M" (HF links only)

Output: "Downloaded model-name (2.3 GB) in 45s"
    or: "Downloading model-name: 67% (1.5/2.3 GB) — timeout, call model_download again to check"
```

Calls `POST /api/v1/models/download`, then polls `GET /api/v1/models/download/status/:job_id` every 5 seconds. Internal timeout: 120s. If `already_downloaded`, returns immediately.

### ask (rewritten — native API)

```
Input:
  model: string                                       — required
  prompt: string                                      — required, mapped to "input"
  system?: string                                     — mapped to "system_prompt"
  temperature?: number                                — 0-2
  max_tokens?: number                                 — mapped to "max_output_tokens" (default 2048)
  reasoning?: "off"|"low"|"medium"|"high"|"on"        — thinking effort control
  context_length?: number                             — override context window per-request
  stream?: boolean                                    — SSE streaming

Output: "Response text\n\n---\nReasoning: ...\n\n📊 42.3 tok/s | TTFT 0.4s | 150 in → 200 out"
```

Calls `POST /api/v1/chat` with `store: false`. Parses structured output array (`message`, `reasoning` types) and stats from response.

Streaming: when `stream: true`, consumes SSE events (`message.delta`, `reasoning.delta`, `chat.end` for stats). If the model is not loaded, LM Studio JIT-loads it and emits `model_load.progress` events — these are silently consumed (no output until inference starts). Accumulates text and returns the final result.

### chat (evolved — OpenAI compat + SQLite)

```
Input:
  session_id: string
  action: "send" | "reset"
  message?: string         — required when action is "send"
  model: string
  system?: string          — applied only on first message of new session
  temperature?: number
  max_tokens?: number
  draft_model?: string     — speculative decoding model
  ttl?: number             — auto-evict after N seconds of inactivity

Output: "Response text"
```

Stays on `POST /v1/chat/completions` + SQLite. Adds `draft_model` and `ttl` to request body when provided. Parses `reasoning_content` from response if present and includes it in output.

### embed (unchanged)

```
Input:
  model: string
  input: string | string[]

Output: "Embeddings (1536 dimensions):\n[0.023, -0.041, ...]"
```

## Data Flow

### ask (native API)

```
Claude → MCP ask(model, prompt, reasoning: "high")
  → POST /api/v1/chat {input, system_prompt, reasoning, max_output_tokens, store: false}
  ← {output: [{type:"message",...}, {type:"reasoning",...}], stats: {...}}
  → format: text + reasoning + stats
← return to MCP client
```

### model_download (async with polling)

```
Claude → MCP model_download(model: "qwen/qwen3.5-9b")
  → POST /api/v1/models/download {model}
  ← {job_id, status: "downloading", total_size_bytes}
  → loop: GET /api/v1/models/download/status/:job_id every 5s
    ← status "downloading" → continue
    ← status "completed" → break
    ← status "failed" → break with error
    ← 120s elapsed → break with last progress
← return (success, failure, or "in progress with progress info")
```

## Error Handling

Same pattern as v2: try/catch with `isError: true` return.

| Scenario | Behavior |
|---|---|
| LM Studio unreachable | `"Failed to reach LM Studio: <error>"` |
| Model not loaded (ask/chat) | Relay LM Studio 4xx message |
| Load fails (insufficient VRAM) | Relay LM Studio error |
| Download — model not found | `status: "failed"` from poll → error |
| Download timeout 120s | Not an error — return progress + job_id |
| `model_load` timeout | Timeout at 300s (large models load slowly) |

## Testing Strategy

Same approach as v2: vitest + `globalThis.fetch` mock + SQLite `:memory:` injection for chat.

| Tool | Key tests |
|---|---|
| `model_list` | OK response, LM Studio down |
| `model_load` | Load OK with config echo, VRAM error, timeout |
| `model_unload` | Unload OK, unknown instance |
| `model_download` | Already downloaded (immediate), poll → completed, poll → failed, poll → timeout |
| `ask` | Simple response, response with reasoning, streaming, stats parsing, store:false verified |
| `chat` | Multi-turn SQLite, reset, reasoning_content parsing, draft_model passthrough |
| `embed` | Unchanged |

`model_download` tests mock a fetch call sequence (download start → N polling statuses → completed/failed) via a call counter in the mock.

No integration tests against a real LM Studio instance — unit mocks only, consistent with v2.

## Migration from v2

- `list_models` → `model_list` (rename in MCP registration and any calling configs)
- `ask` — new params added (reasoning, context_length), response format changes (includes stats)
- `chat` — new optional params (draft_model, ttl), backward compatible
- `embed` — unchanged
- `better-sqlite3` dependency retained
- Version bump: `2.0.0` → `3.0.0`
