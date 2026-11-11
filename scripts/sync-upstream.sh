#!/usr/bin/env bash
# Sync the 3 subtree packages from their MIT upstreams.
# Usage: ./scripts/sync-upstream.sh [play|appstore|analytics|all]
#   - fetches the upstream remote, then `git subtree pull --squash`
#   - never commits credentials; resolve conflicts by keeping OUR overlay
#     files (src/profiles.ts, src/safety.ts, src/overlay/, README-FORK.md,
#     package.json name/bin) and taking upstream for everything else.
#   - after each pull: npm run build + typecheck, then update
#     upstream-versions.json + docs/SYNC.md with the new upstream HEAD.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

pull_one() {
  local prefix="$1" remote="$2" label="$3"
  echo "=== $label: git subtree pull --prefix=$prefix $remote main --squash ==="
  git subtree pull --prefix="$prefix" "$remote" main --squash -m "Sync $prefix from $remote/main"
}

TARGET="${1:-all}"
case "$TARGET" in
  play)      pull_one packages/play-operate upstream-play play-operate ;;
  appstore)  pull_one packages/appstore-operate upstream-appstore appstore-operate ;;
  analytics) pull_one packages/play-analytics upstream-analytics play-analytics ;;
  all)
    pull_one packages/play-operate upstream-play play-operate
    pull_one packages/appstore-operate upstream-appstore appstore-operate
    pull_one packages/play-analytics upstream-analytics play-analytics
    ;;
  *) echo "Usage: $0 [play|appstore|analytics|all]"; exit 1 ;;
esac

echo "=== Verifying build after sync ==="
npm run build
npm run typecheck
python3 -m py_compile packages/play-analytics/server.py packages/play-analytics/gp_client.py
echo "=== Done. Now update upstream-versions.json + docs/SYNC.md with the new HEADs: ==="
echo "  git ls-remote upstream-play HEAD"
echo "  git ls-remote upstream-appstore HEAD"
echo "  git ls-remote upstream-analytics HEAD"
