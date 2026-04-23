# MCP LLM Studio

[![npm version](https://img.shields.io/npm/v/mcp-llm-studio.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/mcp-llm-studio)
[![CI](https://github.com/mecha1610/mcp-llm-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/mecha1610/mcp-llm-studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org/)

An [MCP](https://modelcontextprotocol.io/) server that bridges [Claude Code](https://claude.com/claude-code) (and any other MCP client) to a local [LM Studio](https://lmstudio.ai/) instance. Load and unload models, download new ones from HuggingFace, run single-turn inference with reasoning and stats, and hold multi-turn chats with SQLite-persisted history — all from inside Claude.

## Why

LM Studio runs LLMs locally. Claude Code doesn't talk to it out of the box. This server gives Claude seven tools that cover the whole local-LLM lifecycle, so you can say things like:

> *"Load `qwen/qwen3.5-9b`, ask it to summarize this log, then unload it."*

…and Claude will orchestrate the calls itself.

The server uses a **hybrid API surface**: LM Studio's native REST API (`/api/v1/*`) for model lifecycle and single-turn `ask` (gets reasoning + per-request stats), and the OpenAI-compatible API (`/v1/*`) for multi-turn `chat` (keeps history in SQLite — needed because the native chat endpoint can't replay assistant messages) and `embed`.

## Requirements

- **Node.js ≥ 20** — `node -v`
- **[LM Studio](https://lmstudio.ai/) ≥ 0.4.0**, with the local server running on port `1234`
  (LM Studio → *Developer* tab → *Start Server*). The native `/api/v1/*` API must be enabled.
- An MCP client (Claude Code, Claude Desktop, Codex, VS Code, or any stdio client)
- At least one model loaded or downloadable — see the [LM Studio model catalog](https://lmstudio.ai/models)

## Install

Install the server in your MCP client — it runs locally via `npx`, no clone or build needed.
All variants are equivalent (stdio transport, same package from npm).

### Claude Code

```bash
claude mcp add llm-studio \
  -e LM_STUDIO_URL=http://localhost:1234 \
  -- npx -y mcp-llm-studio
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) / `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "llm-studio": {
      "command": "npx",
      "args": ["-y", "mcp-llm-studio"],
      "env": { "LM_STUDIO_URL": "http://localhost:1234" }
    }
  }
}
```

### Codex CLI

```bash
codex mcp add llm-studio \
  --env LM_STUDIO_URL=http://localhost:1234 \
  -- npx -y mcp-llm-studio
```

Or declare it in `~/.codex/config.toml` (or project-scoped `.codex/config.toml`):

```toml
[mcp_servers.llm-studio]
command = "npx"
args = ["-y", "mcp-llm-studio"]

[mcp_servers.llm-studio.env]
LM_STUDIO_URL = "http://localhost:1234"
```

### VS Code (GitHub Copilot Chat)

Add to `.vscode/mcp.json` at the workspace root (for user-level, run
**MCP: Open User Configuration** from the Command Palette):

```json
{
  "servers": {
    "llm-studio": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-llm-studio"],
      "env": { "LM_STUDIO_URL": "http://localhost:1234" }
    }
  }
}
```

### From source (contributors)

```bash
git clone https://github.com/mecha1610/mcp-llm-studio.git
cd mcp-llm-studio && npm install && npm run build

claude mcp add llm-studio \
  -e LM_STUDIO_URL=http://localhost:1234 \
  -- node "$(pwd)/dist/server.js"
```

### Verify

Quick sanity check the package is installed:

```bash
npx -y mcp-llm-studio --version
# → 3.1.3
```

Then restart your MCP client and ask it: *"list the loaded LM Studio models"*.
It should invoke `model_list` and print whatever is currently in VRAM.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LM_STUDIO_URL` | `http://localhost:1234` | Base URL of your LM Studio REST server |
| `LM_STUDIO_API_KEY` | *(empty)* | Optional `Authorization: Bearer <key>` header |
| `MCP_SESSIONS_DB` | `~/.mcp-llm-studio/sessions.db` | SQLite path for `chat` history |
| `LM_STUDIO_TIMEOUT_DEFAULT_MS` | `30000` | Fetch timeout for `model_list`, `model_unload`, `embed`, download-start |
| `LM_STUDIO_TIMEOUT_INFERENCE_MS` | `120000` | Fetch timeout for `ask` and `chat` |
| `LM_STUDIO_TIMEOUT_LOAD_MS` | `300000` | Fetch timeout for `model_load` (sync — raise for very large models) |
| `LM_STUDIO_SSE_IDLE_TIMEOUT_MS` | `60000` | Per-chunk idle timeout on `ask` streaming |
| `LM_STUDIO_DOWNLOAD_POLL_INTERVAL_MS` | `5000` | Polling cadence for `model_download` |
| `LM_STUDIO_DOWNLOAD_POLL_TIMEOUT_MS` | `120000` | Internal poll budget for `model_download` (exceeds it → returns a "still downloading" status with `job_id`) |

All `*_MS` values must be positive integers; invalid values fall back to the default silently.

Copy `.env.example` → `.env` for local overrides.

> **Security note on `MCP_SESSIONS_DB`** — this SQLite file stores the raw text of every `chat` turn, including anything passed as `system`. Treat its path as a privileged location: keep it under `$HOME` (default), do not put it on a shared/world-readable volume, and do not point it at a path you do not control. The server creates the parent directory if missing and will happily write to any path the server process can reach.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:1234` on any tool call | LM Studio server is not running | LM Studio → *Developer* tab → *Start Server* (port 1234) |
| `Model not loaded: <name>` on `ask` / `chat` | No model in VRAM under that ID | Call `model_load` first, or pick an ID from `model_list` |
| `LM Studio error: 404` on `model_download` | The catalog/HF URL did not resolve | Verify the ID on [lmstudio.ai/models](https://lmstudio.ai/models), or pass a full `hf:org/repo` URL |
| `SSE stream idle for 60000ms` on streamed `ask` | Model is too slow or LM Studio hung | Lower `max_tokens`, or unload + reload the model; raise via a custom client if intentional |
| `command not found: npx` | Node not installed or PATH missing npm's bin | Install Node ≥ 20 from [nodejs.org](https://nodejs.org/) |
| `EACCES` on first `npx -y mcp-llm-studio` | Old npm cache owned by root | `sudo chown -R $(whoami) ~/.npm` |
| MCP client says the server exited | Wrong `LM_STUDIO_URL`, or the native API is disabled | Check `curl $LM_STUDIO_URL/api/v0/models` returns JSON |

Run `claude mcp list` (or your client's equivalent) to confirm the server is registered and healthy.

## Tools

### Model management — native `/api/v1/*`

| Tool | Params | Description |
|---|---|---|
| `model_list` | — | List currently loaded models |
| `model_load` | `model`, `context_length?`, `gpu?`, `flash_attention?`, `ttl?` | Load a model into VRAM (synchronous, up to 5 min for large models) |
| `model_unload` | `model` | Unload a model from VRAM |
| `model_download` | `model`, `quantization?` | Download from LM Studio catalog or HuggingFace URL (async, polls up to 2 min, returns progress on timeout) |

### Inference

| Tool | Params | Description |
|---|---|---|
| `ask` | `model`, `prompt`, `system?`, `temperature?`, `max_tokens?`, `reasoning?`, `context_length?`, `stream?` | Single-turn via native `/api/v1/chat`. Supports `reasoning: "off" \| "low" \| "medium" \| "high" \| "on"`. Returns text + reasoning + stats (`tok/s`, TTFT, token counts). |
| `chat` | `session_id`, `action` (`send` \| `reset`), `message?`, `model`, `system?`, `temperature?`, `max_tokens?`, `draft_model?`, `ttl?` | Multi-turn via `/v1/chat/completions`. History is persisted in SQLite — survives restarts. `system` applies only on the first message of a new session. `draft_model` enables speculative decoding; `ttl` auto-evicts after N seconds of inactivity. |
| `embed` | `model`, `input` (string or string[]) | Text embeddings via `/v1/embeddings` |

## Example

```
You:    Use google/gemma-3-4b to summarize this in one sentence: <paste log>
Claude: → ask(model: "google/gemma-3-4b", prompt: "...", reasoning: "off")
        ← "The log shows 12 failed auth attempts from 10.0.0.4 between 14:02 and 14:06."
```

```
You:    Start a session "refactor-plan", keep the system prompt "You are a senior
        TypeScript engineer", and ask it to list the files I should touch.
Claude: → chat(session_id: "refactor-plan", action: "send", model: "...",
                system: "...", message: "...")
        ← "You should touch src/tools/ask.ts, tests/tools/ask.test.ts, ..."
```

## Development

```bash
npm run dev           # watch-mode TypeScript compile
npm run test          # vitest (unit tests, mocked fetch, :memory: SQLite)
npm run test:coverage # + coverage report
npm run build         # tsc → dist/
```

Tests mock `globalThis.fetch` with `vi.spyOn` and inject `:memory:` SQLite for `chat` — no network, no filesystem side effects. CI runs build + tests on every push.

## Architecture

```
src/
  config.ts             env vars + URL helpers (openaiUrl, nativeUrl) + authHeaders
  server.ts             MCP assembly — imports handlers, registers 7 tools, stdio transport
  tools/
    model-list.ts       GET /v1/models
    model-load.ts       POST /api/v1/models/load (sync, 300s timeout)
    model-unload.ts     POST /api/v1/models/unload
    model-download.ts   POST /api/v1/models/download + polling GET .../status/:job_id
    ask.ts              POST /api/v1/chat (store: false) — reasoning + stats
    chat.ts             POST /v1/chat/completions + better-sqlite3 session history
    embed.ts            POST /v1/embeddings
tests/tools/*.test.ts   vitest, fetch mocked
```

## License

[MIT](LICENSE) © mecha1610
