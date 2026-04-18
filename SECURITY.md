# Security Policy

## Supported Versions

Only the latest minor release line receives security fixes.

| Version | Supported |
| ------- | --------- |
| 3.x     | yes       |
| < 3.0   | no        |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Report privately via GitHub's
[Private vulnerability reporting](https://github.com/mecha1610/mcp-llm-studio/security/advisories/new)
on this repository.

Include:

- A description of the issue and its impact.
- Steps to reproduce or a proof of concept.
- Affected version(s) and environment (Node version, LM Studio version, OS).

You should receive an acknowledgement within 7 days. Coordinated disclosure
timelines are agreed case-by-case, typically 30-90 days depending on severity.

## Scope

In scope:

- The MCP server code in this repository (`src/`, published `dist/`).
- Handling of inputs from MCP clients, LM Studio responses, and SQLite session
  storage via `MCP_SESSIONS_DB`.

Out of scope:

- Vulnerabilities in LM Studio itself — report those to LM Studio upstream.
- Vulnerabilities in MCP clients (Claude Code, Claude desktop, etc.).
- Issues requiring an already-compromised host or filesystem.

## Operational Notes

- `MCP_SESSIONS_DB` stores the raw text of every `chat` turn, including anything
  passed as `system`. Keep it under `$HOME` or another non-shared location.
- The server trusts its environment variables and the MCP client it is launched
  by. It is not designed to be exposed as a network service.
