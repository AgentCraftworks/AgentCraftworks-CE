#!/usr/bin/env bash
# Demo 04 — Docker Compose + signed webhook (macOS / Linux)
# Usage: ./docs/demos/04-docker-compose/run.sh   (from the repository root)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
cd "$root"

export GH_CE_WEBHOOK_SECRET="${GH_CE_WEBHOOK_SECRET:-demo-secret}"

if [ ! -f .env ]; then
  cp .env.example .env
fi
if ! grep -q '^GH_CE_WEBHOOK_SECRET=' .env; then
  echo "GH_CE_WEBHOOK_SECRET=${GH_CE_WEBHOOK_SECRET}" >> .env
fi

echo "── docker compose up --build -d typescript-api"
docker compose up --build -d typescript-api   # service name pins the app; harmless once it is the only service

echo "── waiting for /health"
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sS http://localhost:3000/health; echo

echo; echo "── signed ping"
node "$here/send-webhook.mjs" ping
echo; echo "── signed pull_request"
node "$here/send-webhook.mjs" pull_request
echo; echo "── wrong secret (expect 401)"
GH_CE_WEBHOOK_SECRET=wrong node "$here/send-webhook.mjs" ping || true

echo; echo "Container left running. Stop with: docker compose down"
