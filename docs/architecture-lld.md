# Low-level design and contracts

Baseline `0313f00`, source 3.1.5. This describes implemented behavior, not every guarantee implied by upstream comments or planned features.

## Routes and ownership

| Tool/source | HTTP route | Main contract / tests |
|---|---|---|
| [model-list](../src/tools/model-list.ts) | GET `/v1/models` | Requires `data` array, returns string IDs; [tests](../tests/tools/model-list.test.ts) |
| [model-load](../src/tools/model-load.ts) | POST `/api/v1/models/load` | Optional context/GPU/flash/TTL passed through; [tests](../tests/tools/model-load.test.ts) |
| [model-unload](../src/tools/model-unload.ts) | POST `/api/v1/models/unload` | Requests upstream unload; [tests](../tests/tools/model-unload.test.ts) |
| [model-download](../src/tools/model-download.ts) | POST `/api/v1/models/download`, GET `/api/v1/models/download/status/{job_id}` | Opaque job ID validated, poll deadline; [tests](../tests/tools/model-download.test.ts) |
| [ask](../src/tools/ask.ts) | POST `/api/v1/chat` | Single-turn, `store:false`, optional SSE consumed into a final result; [tests](../tests/tools/ask.test.ts) |
| [chat](../src/tools/chat.ts) | POST `/v1/chat/completions` | SQLite-backed replay and confirmed-turn persistence; [tests](../tests/tools/chat.test.ts) |
| [embed](../src/tools/embed.ts) | POST `/v1/embeddings` | Single string or list of strings; [tests](../tests/tools/embed.test.ts) |

`openaiUrl`/`nativeUrl` append paths to the configured base. Provide a base without a trailing slash; helpers do not normalize arbitrary URLs or expand shell expressions. `authHeaders` adds Content-Type and optional Bearer token. Model IDs are passed to LM Studio rather than resolved against a local registry. Listing reports upstream IDs; availability semantics depend on LM Studio configuration.

## Session storage and state machine

`ensureSchema` creates `sessions(id TEXT, role TEXT, content TEXT, created_at INTEGER)` and an index on id. This is message rows, not a separate session/tenant table. Ordering uses rowid, not timestamps. There is no stored model binding, expiry, history-prune job or schema-version migration framework.

`chat(send)` requires a nonempty message. It reads the first system row and latest 100 non-system rows, restores ascending rowid order, adds an initial system prompt only for an empty session, then appends the new user message. Byte trimming drops oldest non-system rows; leading orphan assistant rows are removed. The system and newest user message are retained. It sends the HTTP request, then writes system-if-new/user/visible-assistant in one SQLite transaction only after a successful response with choices. Failed HTTP requests leave no orphan user row. Reasoning is returned but excluded from stored assistant content.

The MCP schema still requires `model` for reset, although the reset handler does not use it. `chat(reset)` deletes rows matching session_id and reports row count. It makes no inference call. Deletion is logical SQL deletion, not forensic secure erasure of SQLite pages/backups. History replay limits do not delete stored rows. Concurrent sends to one ID can observe the same prior history; the bridge provides no per-session queue. Use distinct IDs or serialize calls externally.

## Bounds and timeout semantics

| Constant/config | Actual scope |
|---|---|
| MAX_PROMPT_LEN 1,048,576 | Zod string `.max`, JavaScript string length/code units, **not** UTF-8 bytes |
| MAX_ID_LEN 256, MAX_URL_LEN 2048 | String schema lengths, not an upstream URL allowlist |
| MAX_EMBED_INPUT_ITEMS 1024 | Array count; no combined embedding-request byte budget |
| MAX_HISTORY_TURNS 100 | Prior non-system **rows**, not 100 user/assistant pairs; system/new message additional |
| MAX_HISTORY_BYTES 10 MiB | Sum of UTF-8 content bytes; excludes JSON overhead; preserved system/new message may prevent reaching budget |
| MAX_SSE_BYTES 10 MiB | Raw streamed chunk bytes accumulated by ask; not all HTTP responses |
| Default fetch 30 s | list/unload/embed/download-start |
| Inference 120 s / load 300 s | Defaults; positive integer environment overrides in config |
| SSE idle 60 s | Default per-read inactivity check in addition to inference signal |
| Download poll 5 s / budget 120 s | Starts after download initiation; budget expiry normally returns last progress/job ID; an aborted response-body read may return an error instead; neither cancels the upstream download |

Timeout environment parsing uses Number and accepts positive integers; invalid values silently fall back. Other numeric schema fields are not all integers or finitely bounded beyond their declared minima/maxima; do not claim stronger validation than [server.ts](../src/server.ts). Fixed bounds are source constants, not configurable env variables.

## Errors and lifecycle

[types.ts](../src/types.ts) produces text content and `isError:true` for errors; HTTP status and an error-body snippet are returned. The entire body is read before slicing to 1,024 characters, so this is display truncation rather than a response-byte cap. Handlers catch many fetch/runtime failures, but database reads/reset occurring before the chat try block can throw to the MCP framework.

Normal startup opens/creates the database before stdio connection. Permission/path errors are reported to stderr by main; wrong upstream URL usually appears when invoking a tool, not as startup failure. Help/version short-circuit before database initialization. No shutdown backup, secure wipe or explicit database close handler is implemented. Unit tests are contract evidence, not live LM Studio-version acceptance.
