#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Bootstraps standard branch flow and protections for AgentCraftworks repositories.

.DESCRIPTION
    Enforces the team promotion path:
      feature/* -> staging -> main

    Actions performed:
      1) Ensures integration branch exists (default: staging) from main
      2) Optionally fast-forwards integration branch from main
      3) Configures branch protection on main and staging
      4) Ensures staging and production GitHub environments exist

.NOTES
    Requires gh CLI authentication with repository admin privileges.

.EXAMPLE
    ./scripts/bootstrap-branch-policy.ps1

.EXAMPLE
    ./scripts/bootstrap-branch-policy.ps1 -Repo AgentCraftworks/AgentCraftworks-CE -SyncIntegrationFromMain
#>

param(
    [string]$Repo = "",
    [string]$DefaultBranch = "main",
    [string]$IntegrationBranch = "staging",
    [switch]$SyncIntegrationFromMain
)

$ErrorActionPreference = "Stop"
# Enable native command failure propagation on PowerShell 7+
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $true
}

function Write-Header([string]$Text) {
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ("=" * 72) -ForegroundColor Cyan
}

function Invoke-GhApi([string]$Method, [string]$Path, [string]$Body = "") {
    if ([string]::IsNullOrWhiteSpace($Body)) {
        $output = gh api --method $Method $Path
    }
    else {
        $output = $Body | gh api --method $Method $Path --input -
    }
    if ($LASTEXITCODE -ne 0) {
        throw "gh api $Method $Path failed with exit code $LASTEXITCODE"
    }
    $output
}

if ([string]::IsNullOrWhiteSpace($Repo)) {
    $Repo = gh repo view --json nameWithOwner -q '.nameWithOwner' 2>$null
}
if ([string]::IsNullOrWhiteSpace($Repo)) {
    throw "Could not determine repository. Pass -Repo owner/name."
}

Write-Header "Preflight"
$viewer = gh api user --jq '.login' 2>$null
if (-not $viewer) {
    throw "gh auth is required. Run: gh auth login"
}
Write-Host "Authenticated as: $viewer" -ForegroundColor Green
Write-Host "Target repo: $Repo" -ForegroundColor Green

$hasAdmin = gh api "repos/$Repo" --jq '.permissions.admin' 2>$null
if ($hasAdmin -ne "true") {
    Write-Host "WARNING: Admin permission not detected; protection updates may fail." -ForegroundColor Yellow
}

Write-Header "Ensure Branches"

$mainRef = gh api "repos/$Repo/git/ref/heads/$DefaultBranch" --jq '.ref' 2>$null
if (-not $mainRef) {
    throw "Branch '$DefaultBranch' not found in $Repo"
}

$stagingRef = gh api "repos/$Repo/git/ref/heads/$IntegrationBranch" --jq '.ref' 2>$null
if (-not $stagingRef) {
    Write-Host "Creating $IntegrationBranch from $DefaultBranch..." -ForegroundColor Yellow
    $mainSha = gh api "repos/$Repo/git/ref/heads/$DefaultBranch" --jq '.object.sha'
    $createBody = @{ ref = "refs/heads/$IntegrationBranch"; sha = $mainSha } | ConvertTo-Json
    Invoke-GhApi -Method "POST" -Path "repos/$Repo/git/refs" -Body $createBody | Out-Null
    Write-Host "Created branch '$IntegrationBranch'." -ForegroundColor Green
}
else {
    Write-Host "Branch '$IntegrationBranch' already exists." -ForegroundColor Green
}

if ($SyncIntegrationFromMain) {
    Write-Host "Syncing $IntegrationBranch from $DefaultBranch (fast-forward update)..." -ForegroundColor Yellow
    $mainSha = gh api "repos/$Repo/git/ref/heads/$DefaultBranch" --jq '.object.sha'
    $syncBody = @{ sha = $mainSha; force = $false } | ConvertTo-Json
    Invoke-GhApi -Method "PATCH" -Path "repos/$Repo/git/refs/heads/$IntegrationBranch" -Body $syncBody | Out-Null
    Write-Host "Synced '$IntegrationBranch' to '$DefaultBranch'." -ForegroundColor Green
}

Write-Header "Protect Branches"

$mainProtection = @{
    required_status_checks = $null
    enforce_admins = $true
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $true
        required_approving_review_count = 1
        require_last_push_approval = $false
    }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    block_creations = $false
    required_conversation_resolution = $true
    lock_branch = $false
    allow_fork_syncing = $true
} | ConvertTo-Json -Depth 6

$stagingProtection = @{
    required_status_checks = $null
    enforce_admins = $true
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $false
        required_approving_review_count = 1
        require_last_push_approval = $false
    }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    block_creations = $false
    required_conversation_resolution = $true
    lock_branch = $false
    allow_fork_syncing = $true
} | ConvertTo-Json -Depth 6

Invoke-GhApi -Method "PUT" -Path "repos/$Repo/branches/$DefaultBranch/protection" -Body $mainProtection | Out-Null
Write-Host "Protection applied: $DefaultBranch" -ForegroundColor Green

Invoke-GhApi -Method "PUT" -Path "repos/$Repo/branches/$IntegrationBranch/protection" -Body $stagingProtection | Out-Null
Write-Host "Protection applied: $IntegrationBranch" -ForegroundColor Green

Write-Header "Ensure Environments"

Invoke-GhApi -Method "PUT" -Path "repos/$Repo/environments/$IntegrationBranch" | Out-Null
Invoke-GhApi -Method "PUT" -Path "repos/$Repo/environments/production" | Out-Null
Write-Host "Ensured environments: $IntegrationBranch, production" -ForegroundColor Green

Write-Header "Done"
Write-Host "Standard branch model configured:" -ForegroundColor Green
Write-Host "  feature/* -> $IntegrationBranch -> $DefaultBranch" -ForegroundColor Green
Write-Host ""
Write-Host "Recommended next step: enable required status checks in repository settings/rulesets." -ForegroundColor Yellow
