# Demo 03 — label routing (live) + CODEOWNERS routing preview.
# Usage: .\docs\demos\03-codeowners-routing\run.ps1 [-WebhookUrl http://localhost:3000/api/webhook]
# Requires a CE instance started with GH_CE_WEBHOOK_SECRET matching the value below.
param([string]$WebhookUrl = "http://localhost:3000/api/webhook")
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$api = $WebhookUrl -replace '/api/webhook$', ''
if (-not $env:GH_CE_WEBHOOK_SECRET) { $env:GH_CE_WEBHOOK_SECRET = "demo-secret" }
$token = if ($env:GH_CE_API_TOKEN) { $env:GH_CE_API_TOKEN } else { "demo-api-token" }

Write-Host "── Part B: send three labelled pull_request webhooks"
foreach ($label in "security", "accessibility", "none") {
  node (Join-Path $root "docs\demos\04-docker-compose\send-webhook.mjs") pull_request $WebhookUrl $label | Select-Object -Last 1
}

Write-Host "`n── Handoffs and the agent each was routed to"
curl.exe -sS -H "Authorization: Bearer $token" "$api/api/handoffs" | node -e @'
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    for (const h of JSON.parse(s).handoffs)
      console.log(String(h.issue_number).padEnd(5), JSON.stringify(h.metadata?.labels ?? []).padEnd(20), "->", h.to_agent);
  });
'@

Write-Host "`n── Part C: CODEOWNERS routing preview (what a real installation would produce)"
Push-Location (Join-Path $root "typescript")
node --import tsx ..\docs\demos\03-codeowners-routing\route-preview.mts
Pop-Location
