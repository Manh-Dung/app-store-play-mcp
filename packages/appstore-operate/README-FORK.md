# README-FORK — packages/appstore-operate

Subtree of **github.com/devinwang/app-store-connect-mcp**
(upstream v0.5.0, MIT, 1316 tools: 1303 generated from Apple OpenAPI spec
v4.5.1 + 6 accounts + 2 auth + 5 hand-written helpers), added with
`git subtree add --squash` (remote `upstream-appstore`, upstream HEAD
`00a92f9` at scaffold time — see root `upstream-versions.json`).
Original `README.md` and `LICENSE` are preserved unchanged in this package.

This repo is **not a GitHub Fork** (a public fork cannot be made private);
it is a new private repo + git subtree from MIT upstream, with attribution
kept here and in root `LICENSE`.

## Changes made in this fork

1. **Renamed** package to `@store-mcp/appstore-operate`, bin to
   `appstore-operate` (`dist/overlay/index.js`). Removed upstream `mcpName`
   and the `prepare` / `prepublishOnly` scripts (monorepo root controls
   build order).
2. **Added `src/profiles.ts`** (new file) — profiles by tool-name substring,
   modelled on asc-mcp `--workers`: `apps, builds, testflight, monetization,
   marketing, analytics, full`. Tools with no rule fall back to `apps` so
   none is silently unprofiled.
3. **Added `src/safety.ts`** (new file) — re-exports `@store-mcp/shared`.
4. **Added `src/overlay/server.ts` + `src/overlay/index.ts`** (new files) —
   same filtered server as play-operate (see its README-FORK.md):
   worker filter, read-only, destructive gate, redaction, error translation.
5. **Added dependency** `@store-mcp/shared: 0.1.0` (workspace).

## What is NOT changed

Upstream `src/server.ts` and `src/index.ts` are **untouched** — the overlay
is the entry point, so `git subtree pull` merges upstream cleanly.
All 1303 generated tools, the 5 upstream helpers (`asset_upload_file`,
`sales_reports_download`, `finance_reports_download`,
`analytics_report_instance_wait`, `ci_build_run_wait`), codegen scripts and
`spec/` are untouched.

## What is NOT yet done (TODO)

- ASO audit kiểu fil (dry-run diff, portfolio audit). No `src/tools/as-audit.ts` yet.
- Beta-feedback summary kiểu testflight-mcp. No `src/tools/beta-feedback.ts` yet.
  (Raw `beta_feedback_*` generated tools exist upstream.)
