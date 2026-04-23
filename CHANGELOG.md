# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.5] - 2026-04-23

### Fixed
- `chat` byte-trim loop could leave a leading `assistant` row at the head of
  the outgoing message array when the oldest `user` was dropped without its
  paired `assistant`. LM Studio's OpenAI-compatible endpoint rejects that
  sequence. Added an explicit post-trim sweep that drops orphan leading
  `assistant` rows so the array is always `system?` then user/assistant
  pairs.
- `openProductionDb()` was invoked at module-load time, so a misconfigured
  `MCP_SESSIONS_DB` pointing at an unwritable path produced a raw Node stack
  trace before the MCP handshake started. Moved the call into `main()` so
  startup failures are caught by `main().catch()` and surfaced on stderr as a
  single clean line.
- `errorResult` now detects `ECONNREFUSED`, `ENOTFOUND`, and timeout/abort
  errors and returns an actionable message citing `LM_STUDIO_URL` and the
  relevant timeout env var, instead of the opaque "Failed: fetch failed".
- `model_list` and `embed` now return a typed error when LM Studio responds
  with a 200 whose body lacks the expected `data` array, instead of throwing
  a confusing `TypeError: Cannot read properties of null`.

### Added
- Regression tests for each fix: orphan-assistant trim, ECONNREFUSED message
  shape, malformed `data.data` bodies on `model_list` and `embed`.

## [3.1.4] - 2026-04-23

### Added
- Six optional env vars to override previously-hardcoded fetch and polling
  timeouts: `LM_STUDIO_TIMEOUT_DEFAULT_MS`, `LM_STUDIO_TIMEOUT_INFERENCE_MS`,
  `LM_STUDIO_TIMEOUT_LOAD_MS`, `LM_STUDIO_SSE_IDLE_TIMEOUT_MS`,
  `LM_STUDIO_DOWNLOAD_POLL_INTERVAL_MS`, `LM_STUDIO_DOWNLOAD_POLL_TIMEOUT_MS`.
  Lets operators on slow networks or with very large models extend the
  internal budgets without forking. Invalid values fall back to the default
  silently.

## [3.1.3] - 2026-04-20

### Added
- `--version` / `-v` and `--help` / `-h` CLI flags so users can sanity-check
  the installed package without wiring it into an MCP client.
- Verified install blocks in the README for Claude Code, Claude Desktop,
  Codex CLI (via `~/.codex/config.toml`), and VS Code MCP (`.vscode/mcp.json`
  with `"type": "stdio"`).
- `.github/ISSUE_TEMPLATE/` with bug and feature forms + a config pointing
  security reports to private GitHub advisories.
- `npm version` badge in the README.

### Fixed
- Codex CLI install command now uses `--env` (the canonical flag) instead of `-e`.

## [3.1.2] - 2026-04-19

### Fixed
- Publish workflow now uses Node 24 (which ships with npm 11.5+ natively)
  and drops the in-place `npm install -g npm@latest` step that hit a
  `Cannot find module 'promise-retry'` regression in npm 10.9.x. This
  unblocks Trusted Publishing on the `v*` tag push trigger.

## [3.1.1] - 2026-04-18

### Changed
- `httpErrorResult` now extracts the response body (JSON `error.message` / `message`
  or text snippet) so LM Studio errors like "Model not loaded" surface to callers
  instead of being swallowed behind a bare status line.
- `model_download` arg validation now uses `MAX_URL_LEN` (2048) instead of the
  prompt-sized cap, rejecting pathological URLs earlier at the Zod boundary.

### Added
- SSE idle timeout in `ask`: if no chunk arrives within `SSE_IDLE_TIMEOUT_MS`
  (60s) the reader is cancelled and a clear error is returned, so a hung LM Studio
  stream can no longer block the tool indefinitely.
- Byte-level history cap in `chat` (`MAX_HISTORY_BYTES`, 10 MiB): oldest
  non-system rows are dropped until the serialized body fits. The system row and
  the current user message are preserved.
- Coverage tests for the new behaviors (HTTP body surfacing, null content
  coercion, idle-timeout cancellation, byte-cap trimming).

### Security
- Pinned GitHub Actions in `publish.yml` to full-SHA versions so a compromised
  tag cannot inject code into the publish job.

## [3.1.0] - 2026-04-19

### Added
- `bin` entry for `npx -y mcp-llm-studio` install flow.
- `engines.node >= 20` constraint.
- `prepublishOnly` script running build and tests before publish.
- `CHANGELOG.md`, `SECURITY.md`, and Dependabot config for public-repo hygiene.
- GitHub Actions workflow to publish to npm automatically on `v*` tag push.

### Changed
- Build now marks `dist/server.js` executable (`chmod +x`).
- README Quick Start leads with `npx` install.
- `CLAUDE.md` refreshed with `npx` registration and a Gotchas section covering
  hybrid-API rationale, chat session semantics, and centralized input bounds.

## [3.0.0] - 2026-04-16

### Added
- Hybrid API surface: LM Studio native `/api/v1/*` for model lifecycle and `ask`;
  OpenAI-compatible `/v1/*` for `chat` and `embed`.
- `model_load`, `model_unload`, `model_download` tools (native API).
- `ask` tool via native `/api/v1/chat` with reasoning levels and per-request stats
  (tok/s, TTFT, token counts).
- `chat` tool: multi-turn with SQLite-backed session history, `draft_model` for
  speculative decoding, `ttl` for auto-eviction, `reasoning_content` parsing.
- `embed` tool for text embeddings.
- SSE stream line buffering across chunk boundaries in `ask`.

### Changed
- Renamed `list_models` → `model_list` and reorganized sources under `src/tools/`.
- Bounded Zod input sizes and capped SSE accumulator / chat history to prevent
  memory exhaustion.
- `chat` now persists session rows only after a successful response.
- `model_download` validates `job_id` inputs.
- Centralized timeouts and extracted shared `ToolResult` primitives.

### Security
- Documented that `MCP_SESSIONS_DB` stores raw chat turns — treat as privileged.

[Unreleased]: https://github.com/mecha1610/mcp-llm-studio/compare/v3.1.3...HEAD
[3.1.3]: https://github.com/mecha1610/mcp-llm-studio/compare/v3.1.2...v3.1.3
[3.1.2]: https://github.com/mecha1610/mcp-llm-studio/compare/v3.1.1...v3.1.2
[3.1.1]: https://github.com/mecha1610/mcp-llm-studio/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/mecha1610/mcp-llm-studio/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/mecha1610/mcp-llm-studio/releases/tag/v3.0.0
