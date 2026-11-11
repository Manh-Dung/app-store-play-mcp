# README-FORK — packages/play-operate

Subtree of **github.com/devinwang/google-play-developer-mcp**
(upstream v0.2.0, MIT, 157 tools, Android Publisher API v3 + Play Developer
Reporting API v1beta1), added with `git subtree add --squash`
(remote `upstream-play`, upstream HEAD `ffe25df` at scaffold time —
see root `upstream-versions.json`). Original `README.md` and `LICENSE`
are preserved unchanged in this package.

This repo is **not a GitHub Fork** (a public fork cannot be made private);
it is a new private repo + git subtree from MIT upstream, with attribution
kept here and in root `LICENSE`.

## Changes made in this fork

1. **Renamed** package to `@store-mcp/play-operate`, bin to `play-operate`
   (`dist/overlay/index.js`). Removed upstream `mcpName` and the `prepare` /
   `prepublishOnly` scripts (the monorepo root controls build order).
2. **Added `src/profiles.ts`** (new file) — profiles by tool-name prefix:
   `apps, release, listings, reviews, monetization, vitals, full`.
3. **Added `src/safety.ts`** (new file) — re-exports `@store-mcp/shared`.
4. **Added `src/overlay/server.ts` + `src/overlay/index.ts`** (new files) —
   a filtered server around upstream `allTools`: `createServer({ workers,
   readOnly })` filters through shared `filterTools()`. Filtered tools are
   hidden from ListTools **and** refused in CallTool with a reason.
   Destructive tools go through `destructiveGate()`; output is redacted;
   errors go through `translateError()`. Entry parses `--workers a,b`,
   `--read-only`, `--help` (exits 0, no credentials needed), env
   `STORE_MCP_READ_ONLY`, `STORE_MCP_WORKERS`.
5. **Added dependency** `@store-mcp/shared: 0.1.0` (workspace).

## What is NOT changed

Upstream `src/server.ts` and `src/index.ts` are **untouched** — the overlay
is the entry point, so `git subtree pull` merges upstream cleanly.
All upstream tool definitions, API calls, auth/account handling and
`src/tools/*` are untouched.

## What is NOT yet done (TODO)

- Composite `deploy_app` 1-shot (see root `docs/ARCHITECTURE.md`).
- ASO audit (fil-style). No `src/tools/deploy.ts` / `aso-audit.ts` yet.
