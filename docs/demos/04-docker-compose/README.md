# Demo 04 — Run CE with Docker Compose and send a signed webhook

> **Status:** Shipped · **Edition:** Community · **Time:** about 5 minutes (plus first image build)

Run Community Edition in a container, confirm it is healthy, and deliver a
GitHub-style webhook that passes **HMAC-SHA256 signature verification** — exactly
what GitHub does when it calls your `/api/webhook` endpoint.

## What you will see

1. `docker compose up` builds the image and starts the service on port 3000.
2. `GET /health` returns `{"status":"ok", …}`.
3. A **correctly signed** `ping` webhook returns `200 {"event":"ping","message":"pong"}`.
4. A signed `pull_request` webhook creates a handoff routed to `@docs-reviewer`.
5. A webhook signed with the **wrong secret** is rejected with `401`.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2): `docker compose version`
- Node.js 22+ on the host — used only by the signing script
- No GitHub App credentials are required for this demo. The service verifies the
  webhook signature with `GH_CE_WEBHOOK_SECRET`; App ID and private key are only
  needed when CE calls back into GitHub (for example to open the CODEOWNERS setup PR).

## Run it

From the repository root:

```bash
# 1. Create .env from the template and set the demo secret
cp .env.example .env                       # PowerShell: Copy-Item .env.example .env
echo "GH_CE_WEBHOOK_SECRET=demo-secret" >> .env   # PowerShell: Add-Content .env "GH_CE_WEBHOOK_SECRET=demo-secret"

# 2. Build and start (one container — CE needs no database)
docker compose up --build -d

# 3. Health
curl -s http://localhost:3000/health

# 4. Signed webhooks (the script reads GH_CE_WEBHOOK_SECRET from your shell)
export GH_CE_WEBHOOK_SECRET=demo-secret     # PowerShell: $env:GH_CE_WEBHOOK_SECRET = "demo-secret"
node docs/demos/04-docker-compose/send-webhook.mjs ping
node docs/demos/04-docker-compose/send-webhook.mjs pull_request

# 5. Prove a bad secret is rejected
GH_CE_WEBHOOK_SECRET=wrong node docs/demos/04-docker-compose/send-webhook.mjs ping

# 6. Stop
docker compose down
```

Or run every step with one wrapper:

```bash
./docs/demos/04-docker-compose/run.sh           # macOS / Linux
```

```powershell
.\docs\demos\04-docker-compose\run.ps1          # Windows PowerShell
```

The wrappers leave the container running so you can continue with
[Demo 02](../02-engagement-levels/README.md) and [Demo 03](../03-codeowners-routing/README.md);
stop it with `docker compose down`.

> **Storage is in-memory.** CE keeps handoffs, dial settings and contexts in process
> memory (`InMemoryHandoffStore`) — there is no database or cache to run, and
> **state resets on restart** (`docker compose down`, a crash, or a new revision).
> Run a single replica. Durable, multi-replica storage is not part of Community
> Edition — see [Editions](../../EDITIONS.md).

## Expected output

See [`expected-output.txt`](expected-output.txt). Compose warnings that `GH_CE_APP_ID`
/ `GH_CE_APP_PRIVATE_KEY` are "not set" are expected for this demo. The important lines:

```text
{"status":"ok","version":"1.0.0-ts","uptime":…,"timestamp":"…"}

POST http://localhost:3000/api/webhook
X-GitHub-Event: ping
HTTP 200
{"event":"ping","message":"pong"}

POST http://localhost:3000/api/webhook
X-GitHub-Event: pull_request
HTTP 200
{"action":"opened","handled":true,"message":"Handoff created for PR #…","handoff_id":"…"}

POST http://localhost:3000/api/webhook
X-GitHub-Event: ping
HTTP 401
{"error":"Unauthorized","message":"Invalid webhook signature"}
```

## How the signature works

`send-webhook.mjs` does what GitHub does:

```js
const signature = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
// sent as the X-Hub-Signature-256 header
```

The server (`typescript/src/middleware/webhook-signature.ts`) recomputes the digest
over the **raw** request body and compares it in constant time. This is why a reverse
proxy in front of CE must not rewrite the body.

## Point a real GitHub App at it

To receive real events, expose port 3000 (for local development use
[smee.io](https://smee.io) or `gh webhook forward`) and set the App's webhook URL to
`https://<your-host>/api/webhook` with the same secret. See
[Getting Started — Track 2](../../getting-started.md#track-2--run-your-own-instance).

## What to read next

- [Deployment guide](../../../DEPLOYMENT.md) — Azure Container Apps via `azd`
- [Demo 02 — Engagement levels](../02-engagement-levels/README.md)
