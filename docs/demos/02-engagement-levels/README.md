# Demo 02 — Engagement levels: watch a T4 action get blocked

> **Status:** Shipped · **Edition:** Community · **Time:** about 3 minutes

Community Edition governs agents with **Agent Engagement Levels**. Each repository
has a dial (default **1 — Observer**), every action is classified into a tier
(T1–T5), and an action is only permitted when the repository's effective level is at
least the tier's required level. **CE supports levels 1–3 in every environment**;
levels 4–5 (Delegated, Autonomous) are part of AgentCraftworks Enterprise — see
[Editions](../../EDITIONS.md) and [ADR-CE-001](../../adr/ADR-CE-001-engagement-level-cap.md).

This demo uses the REST dial API to:

1. read the default level,
2. raise it to **3 — Collaborator** (the CE maximum),
3. confirm a **T2** action (`add_label`) is permitted,
4. confirm a **T4** action (`push_commit`) is **blocked**, and
5. attempt level **4** and get an Enterprise rejection.

## Prerequisites

- A running CE instance on `http://localhost:3000` — either
  [Track 2 of Getting Started](../../getting-started.md#track-2--run-your-own-instance)
  or [Demo 04 (Docker Compose)](../04-docker-compose/README.md).
- `curl` (built into macOS, Linux and Windows 10+ as `curl.exe`).
- The server and this script must agree on `GH_CE_API_TOKEN`. Start the server with it:

  ```bash
  # macOS / Linux — in typescript/
  GH_CE_WEBHOOK_SECRET=demo-secret GH_CE_API_TOKEN=demo-api-token npm start
  ```

  ```powershell
  # Windows PowerShell — in typescript\
  $env:GH_CE_WEBHOOK_SECRET = "demo-secret"; $env:GH_CE_API_TOKEN = "demo-api-token"; npm start
  ```

  Outside `NODE_ENV=production` the token is optional, but the script always sends
  `Authorization: Bearer $GH_CE_API_TOKEN` (default `demo-api-token`) so it also works
  against a production-configured server.

## Run it

From the repository root:

```bash
./docs/demos/02-engagement-levels/run.sh            # macOS / Linux
```

```powershell
.\docs\demos\02-engagement-levels\run.ps1           # Windows PowerShell
```

Pass a different base URL as the first argument (`run.sh https://ce.example.com`) or
`-BaseUrl` (PowerShell) to test a deployed instance.

## Expected output

See [`expected-output.txt`](expected-output.txt). The key lines:

| Step | Field to check | Expected |
|---|---|---|
| 1 | `dialLevel` / `engagementLevel` | `1` / `observer` (`isDefault: true`) |
| 2 | `dialLevel` / `engagementLevel` | `3` / `collaborator` |
| 3 | `permitted` | `true` — T2 needs level 2, effective level is 3 |
| 4 | `permitted` / `reason` | `false` — `Action blocked: effective level 3 insufficient for T4, requires 4` |
| 5 | HTTP status / `code` | `422` / `ENTERPRISE_REQUIRED` — see [ADR-CE-001](../../adr/ADR-CE-001-engagement-level-cap.md) |

Step 5's body is structured so tooling can distinguish the edition boundary (`422`)
from malformed input (`400`):

```json
{"error":"Unprocessable Entity","code":"ENTERPRISE_REQUIRED","message":"Engagement levels 4–5 (Delegated, Autonomous) require AgentCraftworks Enterprise — https://agentcraftworks.com","requestedLevel":4,"requestedLevelName":"delegated","maxLevel":3,"upgradeUrl":"https://agentcraftworks.com"}
```

> **Version note:** the 422 response ships with PR #285 (issue #270). On an older
> build, step 5 returns `HTTP 200` and stores level 4; steps 0–4 are identical.

## How the check works

```text
effective level = min(repository dial level, environment cap)
permitted       = effective level ≥ tier's required level
```

- Tiers: T1 read · T2 comment/label · T3 edit/branch/assign · T4 commit/PR ·
  T5 merge/deploy (`typescript/src/services/action-classifier.ts`).
- Try other actions in step 3/4: `view_diff` (T1), `edit_file` (T3), `merge_pr` (T5).
- `GET /api/dial/actions` lists every classified action and its tier.

## What to read next

- [Engagement levels reference](../../architecture.md#agent-engagement-levels-reference)
- [Editions — what CE includes](../../EDITIONS.md)
- [Demo 03 — CODEOWNERS routing](../03-codeowners-routing/README.md)
