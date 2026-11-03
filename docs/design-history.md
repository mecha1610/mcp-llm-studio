# Design history

This is a summary of the April 2026 design stages, not an implementation backlog
or a current API specification. Use the [README](../README.md) for installation,
configuration and tool parameters, the [agent integration guide](agent-integration.md)
for an SDK example, and the [changelog](../CHANGELOG.md) for released changes.

## How the design evolved

| Stage | Original intent | Outcome to retain |
|---|---|---|
| Initial bridge, 15 April | A single TypeScript stdio server with `list_models`, `ask` and `embed`, using OpenAI-compatible HTTP endpoints | Local LM Studio stays behind an MCP subprocess; the later `model_list` name replaces `list_models`. The original `src/index.ts` / `dist/index.js` entrypoints are historical. |
| Modular server, 15 April | Separate handlers, shared configuration, streaming, SQLite chat and tests importing real code | `src/server.ts` assembles the server, `src/config.ts` centralizes configuration and each tool has its own handler. The executable is `dist/server.js`. |
| Native API integration, 16 April (v3) | Seven tools with a hybrid native/OpenAI-compatible API | Native model lifecycle and single-turn reasoning/statistics, with SQLite-backed multi-turn replay kept on the OpenAI-compatible endpoint. |

## Decisions that still explain the code

- **Keep the hybrid API.** `ask` uses native `/api/v1/chat` with `store: false`
  for single-turn text, reasoning and statistics. The v3 design kept `chat` on
  `/v1/chat/completions` because the native endpoint could not replay assistant
  messages from SQLite. The v3 specification also recorded tool/function calling
  as available only on `/v1/chat/completions`; this explains the API choice, not
  a promise that this server exposes function calling. `model_list` uses `/v1/models`, and `embed` uses
  `/v1/embeddings`; load, unload and download use native `/api/v1/models/*`.
  Revisit both upstream constraints before changing that split.
- **Keep chat persistence independent of LM Studio restarts.** At the time of
  the v3 design, native stateful chats were in-memory only. SQLite stores
  session history; the system prompt applies only on a session's first send,
  the model is supplied per call, and `action: "reset"` clears that session.
  The database contains raw prompts and replies: follow the README security note
  and [security policy](../SECURITY.md) for its storage location.
- **Loading and downloading have different lifecycles.** Load is synchronous;
  download starts a job and polls its status. Exhausting the internal download
  poll budget returns progress and a job ID rather than claiming the download
  failed. Unload maps the public `model` argument to LM Studio's `instance_id`.
  Timeout defaults and overrides are maintained in the README and `src/config.ts`.
- **Streaming is accumulated before the tool result returns.** `ask` collects
  text/reasoning deltas and final statistics; model-load progress is not returned
  as generated text. This is not a second MCP HTTP/SSE transport.
- **Test real handlers.** Unit tests mock `fetch`; chat tests inject an in-memory
  SQLite database and download tests can shorten polling intervals. Historical
  test counts, dependency ranges, model inventories and hard-coded machine paths
  in the old plans are snapshots, not current setup instructions.
- **The v2-to-v3 migration changed the interface.** `list_models` became
  `model_list`; `ask` gained reasoning/context controls and statistics; `chat`
  gained optional `draft_model` and `ttl`; `embed` kept its role. See the current
  tool reference for the implemented parameters, and [src/config.ts](../src/config.ts)
  for centralized input, history and response limits.

The original production-ready design excluded HTTP/SSE transport, Docker packaging
and npm publishing from that stage. Those were stage boundaries, not permanent
prohibitions: npm distribution was added later. CI/release behavior is defined by
the existing workflows, not the old step-by-step plans.

## Original documents

The six complete originals, including implementation sketches, test cases and
stage-specific constraints, remain available at the immutable pre-consolidation
commit below. No Git history has been rewritten. These links are archival;
do not execute their unchecked task lists as current work.

- [Initial bridge — design](https://github.com/mecha1610/mcp-llm-studio/blob/53470e3ccac474a98ebb546d9b39c4ea6c72470e/docs/superpowers/specs/2026-04-15-mcp-llm-studio-design.md)
- [Initial bridge — implementation plan](https://github.com/mecha1610/mcp-llm-studio/blob/53470e3ccac474a98ebb546d9b39c4ea6c72470e/docs/superpowers/plans/2026-04-15-mcp-llm-studio.md)
- [Modular server — design](https://github.com/mecha1610/mcp-llm-studio/blob/53470e3ccac474a98ebb546d9b39c4ea6c72470e/docs/superpowers/specs/2026-04-15-production-ready-design.md)
- [Modular server — implementation plan](https://github.com/mecha1610/mcp-llm-studio/blob/53470e3ccac474a98ebb546d9b39c4ea6c72470e/docs/superpowers/plans/2026-04-15-production-ready.md)
- [Native API v3 — design](https://github.com/mecha1610/mcp-llm-studio/blob/53470e3ccac474a98ebb546d9b39c4ea6c72470e/docs/superpowers/specs/2026-04-16-v3-native-api-design.md)
- [Native API v3 — implementation plan](https://github.com/mecha1610/mcp-llm-studio/blob/53470e3ccac474a98ebb546d9b39c4ea6c72470e/docs/superpowers/plans/2026-04-16-v3-native-api.md)
