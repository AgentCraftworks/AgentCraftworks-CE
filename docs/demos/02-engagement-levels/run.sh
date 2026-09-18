#!/usr/bin/env bash
# Demo 02 — Engagement levels: watch a T4 action get blocked and a level-4 request rejected.
# Usage: ./docs/demos/02-engagement-levels/run.sh [base-url]
#
# Requires a running CE instance (see README.md in this folder) started with the same
# GH_CE_API_TOKEN you export here. Outside NODE_ENV=production the token is optional,
# but the header is always sent so the script also works against a locked-down server.
set -uo pipefail

BASE="${1:-http://localhost:3000}"
TOKEN="${GH_CE_API_TOKEN:-demo-api-token}"
REPO="octo/demo"
AUTH=(-H "Authorization: Bearer ${TOKEN}")
JSON=(-H "Content-Type: application/json")

step() { printf '\n── %s\n' "$1"; }
call() { # method path [body]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -w '\nHTTP %{http_code}\n' -X "$method" "${AUTH[@]}" "${JSON[@]}" -d "$body" "${BASE}${path}"
  else
    curl -sS -w '\nHTTP %{http_code}\n' -X "$method" "${AUTH[@]}" "${BASE}${path}"
  fi
}

step "0. Health check"
curl -sS -w '\nHTTP %{http_code}\n' "${BASE}/health"

step "1. Read the current level for ${REPO} (default is 1 = observer)"
call GET "/api/dial/${REPO}"

step "2. Set the level to 3 (collaborator) — the CE maximum"
call POST "/api/dial/${REPO}" '{"engagement":"collaborator","updatedBy":"demo-user"}'

step "3. Ask whether a T2 action (add_label) is permitted in production → permitted"
call POST "/api/dial/check" "{\"action\":\"add_label\",\"owner\":\"octo\",\"repo\":\"demo\",\"environment\":\"production\"}"

step "4. Ask whether a T4 action (push_commit) is permitted in production → BLOCKED"
call POST "/api/dial/check" "{\"action\":\"push_commit\",\"owner\":\"octo\",\"repo\":\"demo\",\"environment\":\"production\"}"

step "5. Try to raise the dial to 4 (delegated) → rejected: levels 4–5 require Enterprise"
call POST "/api/dial/${REPO}" '{"dialLevel":4,"updatedBy":"demo-user"}'

printf '\nDone. Compare with expected-output.txt in this folder.\n'
