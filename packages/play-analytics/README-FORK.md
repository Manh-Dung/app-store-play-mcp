# README-FORK — packages/play-analytics

Subtree of **github.com/desunit/google-play-analytics-mcp**
(upstream, MIT, 18 tools, Python/FastMCP), added with `git subtree add --squash`
(remote `upstream-analytics`, upstream HEAD `07fc5cf` at scaffold time —
see root `upstream-versions.json`). Original `README.md`,
`LICENSE` and `AGENTS.md` are preserved in this package.

## Changes made in this fork

- **None to the logic.** `server.py` and `gp_client.py` are byte-identical
  to upstream as cloned (see verification in root README / scaffold report).
  No write tool was added — this server stays read-only by design.
- Only this `README-FORK.md` was added; setup is the same venv flow:
  `python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt`.

## What it does

Reads Play Console bulk CSV reports from the GCS bucket
`pubsite_prod_rev_*`: acquisitions by traffic source, search terms, UTM,
store conversion, installs/uninstalls, ratings, crashes, subscriptions,
cancellation-survey free text, reviews. Lag 1–2 days — see root
`docs/METRICS.md`.

## Setup

See root `docs/SETUP.md` §2. Env: `GOOGLE_PLAY_SA_JSON`,
`GOOGLE_PLAY_REPORTS_BUCKET`, optional `GOOGLE_PLAY_APP_ALIASES`.
