#!/usr/bin/env bash
# Demo 03 — label routing (live) + CODEOWNERS routing preview.
# Usage: ./docs/demos/03-codeowners-routing/run.sh [webhook-url]
# Requires a CE instance started with GH_CE_WEBHOOK_SECRET matching the value below.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
url="${1:-http://localhost:3000/api/webhook}"
api="${url%/api/webhook}"
export GH_CE_WEBHOOK_SECRET="${GH_CE_WEBHOOK_SECRET:-demo-secret}"
token="${GH_CE_API_TOKEN:-demo-api-token}"

echo "── Part B: send three labelled pull_request webhooks"
for label in security accessibility none; do
  node "$root/docs/demos/04-docker-compose/send-webhook.mjs" pull_request "$url" "$label" | tail -n 1
done

echo
echo "── Handoffs and the agent each was routed to"
curl -sS -H "Authorization: Bearer ${token}" "${api}/api/handoffs" | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    for (const h of JSON.parse(s).handoffs)
      console.log(String(h.issue_number).padEnd(5), JSON.stringify(h.metadata?.labels ?? []).padEnd(20), "->", h.to_agent);
  });'

echo
echo "── Part C: CODEOWNERS routing preview (what a real installation would produce)"
(cd "$root/typescript" && node --import tsx ../docs/demos/03-codeowners-routing/route-preview.mts)
