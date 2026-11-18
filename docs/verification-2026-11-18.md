# Documentation verification — 18 November 2026

Baseline `0313f00`, isolated branch `docs/enterprise-contracts-20261118`. Source version `3.1.5`. This work changes documentation and the example environment file only, not handlers, dependencies or production configuration.

## Executed checks

- Locked dependency installation: `npm ci --offline` succeeded from cached packages in the isolated checkout. npm reported install-script policy warnings; no broad script-policy change was made.
- `npm run build`: succeeded.
- `npm test`: **72 tests passed across 8 files**, mocked fetch and in-memory SQLite.
- `node dist/server.js --version`: `3.1.5`.
- `node dist/server.js --help`: expected CLI help; no normal server startup performed.
- Local runtime Node v26.13.1; CI specifies Node 22. This does not certify all declared Node >=20/native-module combinations.
- Relative documentation targets and whitespace checked before commit. External URLs/client registration instructions were not executed or revalidated against installed client versions.

## Changes grounded in source

Corrected stale version example, `/api/v0/models` troubleshooting, classification of `model_list`, chat DB injection signature and persistence wording. Removed unsupported present-tense popularity/maintenance assertions from the old comparison. Clarified literal `~` does not expand in `.env`; leave the path unset to use the actual home-directory default.

Added HLD, endpoint/session/bounds LLD, operator how-to and this evidence record. Documentation separates rows from conversation pairs, string length from bytes, replay budget from retention, display truncation from response caps, and polling timeout from download cancellation.

## Acceptance limits

No LM Studio server/model was contacted, loaded, downloaded or used for inference. No production session DB was opened, client registration changed, package published or service deployed. API/live model compatibility, current external-client setup syntax, concurrency and remote-endpoint security require separately scoped acceptance. No fresh security certification is claimed.

## Independent documentation review

A separate read-only review compared the documents against handlers/configuration/tests. Corrected required DB injection, model-list/VRAM wording, successful-turn-only persistence, and download timeout semantics (an abort during response-body parsing may yield an error instead of progress). Added reset schema and source/publish Node-version distinctions. No runtime code was changed.
