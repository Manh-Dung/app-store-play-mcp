# @store-mcp/shared

Shared safety helpers for the store-mcp monorepo. Pure TypeScript,
no dependencies, no credentials, no network.

- `filterTools(all, { workers, readOnly, profileForTool, alwaysKeep })` —
  hide filtered tools from ListTools and refuse them in CallTool.
- `isWriteTool(name)` / `isDestructiveTool(name)` — verb-based classification.
- `destructiveGate(name, args, env)` — delete/remove/revoke need
  `STORE_MCP_ALLOW_DESTRUCTIVE=1` or `{ "confirm": true }` / `confirm_*_id`.
- `redact(text)` / `redactResult(result)` — hide JWT, Bearer tokens, PEM keys.
- `translateError(err)` — 401/403/429/5xx → actionable message.
- `parseServerArgs(argv, env)` / `helpText(name, profiles)` — `--workers`,
  `--read-only`, `--help`, env `STORE_MCP_WORKERS`, `STORE_MCP_READ_ONLY`.

Ideas grafted from OrellBuehler/play-console-mcp (destructive opt-in) and
zelentsov-dev/asc-mcp (`--workers`, `--read-only`, exact confirmation).

```bash
npm run build
npm run typecheck
npm test
```
