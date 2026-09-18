# Demo 02 — Engagement levels: watch a T4 action get blocked and a level-4 request rejected.
# Usage: .\docs\demos\02-engagement-levels\run.ps1 [-BaseUrl http://localhost:3000]
#
# Requires a running CE instance (see README.md in this folder) started with the same
# GH_CE_API_TOKEN you set here. Outside NODE_ENV=production the token is optional,
# but the header is always sent so the script also works against a locked-down server.
param([string]$BaseUrl = "http://localhost:3000")

$token = if ($env:GH_CE_API_TOKEN) { $env:GH_CE_API_TOKEN } else { "demo-api-token" }
$repo = "octo/demo"

function Step($text) { Write-Host "`n── $text" }
function Call($method, $path, $body) {
  $args = @("-sS", "-w", "`nHTTP %{http_code}`n", "-X", $method, "-H", "Authorization: Bearer $token")
  if ($body) { $args += @("-H", "Content-Type: application/json", "-d", $body) }
  & curl.exe @args "$BaseUrl$path"
}

Step "0. Health check"
curl.exe -sS -w "`nHTTP %{http_code}`n" "$BaseUrl/health"

Step "1. Read the current level for $repo (default is 1 = observer)"
Call GET "/api/dial/$repo"

Step "2. Set the level to 3 (collaborator) — the CE maximum"
Call POST "/api/dial/$repo" '{"engagement":"collaborator","updatedBy":"demo-user"}'

Step "3. Ask whether a T2 action (add_label) is permitted in production → permitted"
Call POST "/api/dial/check" '{"action":"add_label","owner":"octo","repo":"demo","environment":"production"}'

Step "4. Ask whether a T4 action (push_commit) is permitted in production → BLOCKED"
Call POST "/api/dial/check" '{"action":"push_commit","owner":"octo","repo":"demo","environment":"production"}'

Step "5. Try to raise the dial to 4 (delegated) → rejected: levels 4–5 require Enterprise"
Call POST "/api/dial/$repo" '{"dialLevel":4,"updatedBy":"demo-user"}'

Write-Host "`nDone. Compare with expected-output.txt in this folder."
