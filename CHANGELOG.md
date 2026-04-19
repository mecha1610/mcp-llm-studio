# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/mecha1610/mcp-llm-studio/compare/v3.1.0...HEAD
[3.1.0]: https://github.com/mecha1610/mcp-llm-studio/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/mecha1610/mcp-llm-studio/releases/tag/v3.0.0
