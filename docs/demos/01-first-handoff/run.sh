#!/usr/bin/env bash
# Demo 01 — first handoff over MCP (macOS / Linux)
# Usage: ./docs/demos/01-first-handoff/run.sh   (from the repository root)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"

if [ ! -d "$root/typescript/node_modules" ]; then
  echo "typescript/node_modules not found — running npm install once..."
  (cd "$root/typescript" && npm install)
fi

node "$here/first-handoff.mjs"
