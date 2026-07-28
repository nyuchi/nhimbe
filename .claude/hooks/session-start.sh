#!/bin/bash
set -euo pipefail

# SessionStart hook: install dependencies so tests and linters work in
# Claude Code on the web. Synchronous (blocks session start until deps are
# ready) and idempotent. Only runs in remote (web) sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Resolve repo root: CLAUDE_PROJECT_DIR in a real hook run, else derive from
# this script's location so the script is also runnable by hand.
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT"

# npm install (not ci) so the cached container layer is reused across sessions.
# Output to stderr keeps the hook's stdout clean (SessionStart stdout is
# added to the model context).
npm install --no-audit --no-fund 1>&2
