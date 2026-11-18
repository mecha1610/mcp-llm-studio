# High-level architecture

Baseline `0313f00`, source 3.1.5. [LLD](architecture-lld.md) contains exact contracts; [verification](verification-2026-11-18.md) distinguishes source tests from live compatibility.

## Purpose and boundaries

A local stdio MCP subprocess exposes seven tools to an MCP client and forwards HTTP requests to an operator-selected LM Studio base URL. It is not an inference engine, model registry, HTTP-facing MCP gateway or an authorization service. LM Studio owns model execution, VRAM allocation and model downloads. The bridge owns tool schemas, request construction, response formatting and persisted chat history.

```text
MCP client -> stdio transport -> Zod input schema -> tool handler
                                         |            |
                                         |            +-> LM Studio HTTP API
                                         +-> chat handler -> SQLite sessions
LM Studio response -> text ToolResult/isError -> MCP client
```

The transport is stdio; the bridge does not listen on an HTTP port. `server.ts` registers tools and opens the SQLite database at normal startup even if the first call is not chat. `--help`/`--version` exit before opening the production database or connecting transport. Logs use stderr; protocol uses stdout.

## Dependency map

| Component | Dependency | Operational consequence |
|---|---|---|
| MCP assembly | @modelcontextprotocol/sdk, Zod | Tool registration/schema behavior; clients invoke a subprocess |
| HTTP tools | Node fetch/AbortSignal, configured LM Studio API | Endpoint compatibility and upstream availability required |
| Persistent chat | better-sqlite3 native module | Node ABI/platform compatibility; disk access even at normal startup |
| Configuration | dotenv and environment | Environment selects destination, token and database path |
| Build | TypeScript, package-lock.json | npm ci reproduces dependency selection, not OS/runtime behavior |
| Validation | Vitest and coverage plugin | Mocked HTTP and in-memory SQLite do not prove live model behavior |

Declared Node minimum is 20; source build/test CI uses Node 22 and publishing uses Node 24. Consult the lockfile and native module support before changing runtimes. No application deployment, client registration or model download is performed by the documentation checks.

## Trust and data

The process trusts its launch environment and MCP client. A session ID is a lookup key, not a tenant authorization boundary. All tools run with the process's OS permissions; load/unload/download affect shared LM Studio resources. There is no per-tool permission policy in this bridge.

`LM_STUDIO_URL` defaults to localhost but can point elsewhere. Therefore “local model” is not an enforced privacy guarantee. A configured remote endpoint receives prompts and optional Bearer credentials. Use only an explicitly trusted destination; avoid publishing URL credentials or logs with private response excerpts. Model downloads may make LM Studio contact remote registries.

`chat` stores initial system prompt, user messages and visible assistant replies in SQLite. Reasoning content is returned to the caller but not stored in session history. `ask` requests `store:false` upstream and does not use chat SQLite; this does not establish absence of client or upstream logging. There is no encryption-at-rest layer or retention scheduler. See [operations](operations.md).

## Quality boundaries

Timeouts and selected input/history/SSE bounds limit some work. They are not global memory, GPU or request-budget guarantees. Non-stream JSON responses and HTTP error bodies are read before any display truncation; embedding arrays allow many bounded individual strings. Shared-session concurrent calls are not serialized by an application-level lock. A SQLite transaction atomically persists a confirmed turn but does not serialize the upstream conversation.

[CI](../.github/workflows/ci.yml) builds and tests pushes/PRs. [Publishing](../.github/workflows/publish.yml) is separate and must not be invoked as a documentation check. No claims of production readiness or complete security certification follow from green unit tests.
