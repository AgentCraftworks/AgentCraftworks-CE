# Demo 01 — first handoff over MCP (Windows PowerShell)
# Usage: .\docs\demos\01-first-handoff\run.ps1   (from the repository root)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")

if (-not (Test-Path (Join-Path $root "typescript\node_modules"))) {
  Write-Host "typescript/node_modules not found - running npm install once..."
  Push-Location (Join-Path $root "typescript")
  npm install
  Pop-Location
}

node (Join-Path $PSScriptRoot "first-handoff.mjs")
exit $LASTEXITCODE
