# Developer and operator how-to

## Reproduce source checks without contacting LM Studio

From an isolated checkout using the supported Node/toolchain:

```sh
npm ci
npm run build
npm test
node dist/server.js --version
node dist/server.js --help
```

npm ci installs locked dependencies and may execute native build scripts. Use a trusted checkout and inspect install failures rather than disabling safety controls broadly. Build writes dist; tests use mocked HTTP and injected in-memory SQLite. Help/version do not open the production DB. Do **not** run npm start, register a client, publish a package, load/download a model or send a real prompt as a passive documentation check. See [actual verification](verification-2026-11-18.md).

## Configure intentionally

Leave MCP_SESSIONS_DB unset for the built-in home-directory default. If overriding it, use an absolute path controlled by the operator. A literal `~` in `.env` is not shell-expanded by config.ts. Avoid relative paths: their meaning depends on the MCP client's working directory. Keep `.env` and DB out of Git. Set LM_STUDIO_URL to a trusted base such as `http://localhost:1234`, without trailing slash. Tokens are optional only if the upstream allows unauthenticated requests.

For optional read-only endpoint diagnosis (after choosing the intended destination):

```sh
curl --fail --max-time 5 "${LM_STUDIO_URL:-http://localhost:1234}/v1/models"
```

This contacts LM Studio but does not load/download/infer. It confirms only the listing route, not native `/api/v1/chat` or lifecycle operations. Authenticated configurations need an appropriate header; avoid putting secrets into copied command history or shared diagnostics. Tool and model tests that mutate resources need a separately agreed test scope.

## Troubleshoot by layer

1. Run help/version from the built artifact; compare package.json and config VERSION, not a stale example.
2. If subprocess exits, inspect stderr, Node/native-module compatibility and DB path permissions.
3. If tool returns connection/DNS errors, verify destination/server separately; registration alone does not validate native endpoints.
4. If SSE idles, inspect model/backend load; only then adjust LM_STUDIO_SSE_IDLE_TIMEOUT_MS. A longer timeout is not extra VRAM.
5. A download poll timeout normally returns progress with job_id; an aborted response-body read can instead return an error. Neither means the upstream download was canceled. Check LM Studio before initiating duplicate downloads.
6. For chat anomalies, use a new synthetic session ID. Changing `system` on an existing session is ignored; reset deliberately if appropriate.

## Data lifecycle and recovery

Successful chat turns persist raw prompt/reply content, including the initial system message. Replay trimming does not bound DB disk growth. Restrict filesystem access using the host's supported administration process. The application does not encrypt sessions, enforce directory ACLs, or supply a retention daemon.

Before upgrades or maintenance, stop the MCP subprocess and use an operator-approved SQLite-consistent backup procedure. Preserve any relevant SQLite journal/WAL state rather than copying an active DB arbitrarily. Do not automate deletion from this guide. `chat(reset)` deletes matching rows logically; filesystem copies and upstream/client logs may still retain content. No application-level restore or migration CLI is provided. Test restored copies using synthetic data and explicit backup paths before replacing production history.

## Change and release discipline

Update endpoint contracts, schema bounds, data lifecycle and tests together. Re-run config and handler tests and inspect package/config/manifest version alignment. Verify live compatibility on a disposable session/model only with authorization and a resource budget. Publishing is a separate workflow; this documentation work does not publish npm, modify MCP registrations or deploy to any host.
