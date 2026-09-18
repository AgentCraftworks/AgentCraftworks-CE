# Demo 04 — Docker Compose + signed webhook (Windows PowerShell)
# Usage: .\docs\demos\04-docker-compose\run.ps1   (from the repository root)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Push-Location $root
try {
  if (-not $env:GH_CE_WEBHOOK_SECRET) { $env:GH_CE_WEBHOOK_SECRET = "demo-secret" }

  if (-not (Test-Path .env)) { Copy-Item .env.example .env }
  if (-not (Select-String -Path .env -Pattern '^GH_CE_WEBHOOK_SECRET=' -Quiet)) {
    Add-Content .env "GH_CE_WEBHOOK_SECRET=$env:GH_CE_WEBHOOK_SECRET"
  }

  Write-Host "── docker compose up --build -d typescript-api"
  docker compose up --build -d typescript-api

  Write-Host "── waiting for /health"
  for ($i = 0; $i -lt 30; $i++) {
    try { Invoke-RestMethod http://localhost:3000/health | Out-Null; break } catch { Start-Sleep -Seconds 1 }
  }
  curl.exe -sS http://localhost:3000/health; Write-Host ""

  Write-Host "`n── signed ping"
  node (Join-Path $PSScriptRoot "send-webhook.mjs") ping
  Write-Host "`n── signed pull_request"
  node (Join-Path $PSScriptRoot "send-webhook.mjs") pull_request
  Write-Host "`n── wrong secret (expect 401)"
  $saved = $env:GH_CE_WEBHOOK_SECRET
  $env:GH_CE_WEBHOOK_SECRET = "wrong"
  $ErrorActionPreference = "Continue"
  node (Join-Path $PSScriptRoot "send-webhook.mjs") ping
  $ErrorActionPreference = "Stop"
  $env:GH_CE_WEBHOOK_SECRET = $saved

  Write-Host "`nContainer left running. Stop with: docker compose down"
} finally {
  Pop-Location
}
exit 0
