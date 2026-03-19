<#
.SYNOPSIS
    Toggle GH-AW workflows on or off via ghaw-config.json

.DESCRIPTION
    Enable, disable, or list GH-AW workflows by modifying .github/ghaw-config.json.
    Changes take effect immediately on next workflow run (no deployment needed).

.PARAMETER Action
    Action to perform: enable, disable, list, or status

.PARAMETER WorkflowId
    Workflow ID to toggle (e.g., ghaw-ci-doctor). Use "all" to affect all workflows.
    Use "tier-1" or "tier-2" to toggle all workflows in that tier.

.EXAMPLE
    .\ghaw-toggle.ps1 list
    Lists all workflows and their current enabled status

.EXAMPLE
    .\ghaw-toggle.ps1 disable ghaw-code-simplifier
    Disables the Code Simplifier workflow

.EXAMPLE
    .\ghaw-toggle.ps1 enable tier-1
    Enables all Tier 1 workflows

.EXAMPLE
    .\ghaw-toggle.ps1 status
    Shows status summary by tier
#>

param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet("enable", "disable", "list", "status")]
    [string]$Action,

    [Parameter(Position = 1)]
    [string]$WorkflowId
)

$ConfigPath = ".github/ghaw-config.json"

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config file not found: $ConfigPath"
    exit 1
}

$config = Get-Content $ConfigPath | ConvertFrom-Json

function Show-WorkflowList {
    Write-Host "`n📋 GH-AW Workflows" -ForegroundColor Cyan
    Write-Host ("=" * 70)

    $grouped = $config.workflows | Group-Object { $_.tier ?? "existing" }
    
    foreach ($group in $grouped | Sort-Object Name) {
        $tierName = switch ($group.Name) {
            "tier-1" { "🥇 Tier 1 (High Value)" }
            "tier-2" { "🥈 Tier 2 (Active Teams)" }
            default { "📦 Existing" }
        }
        Write-Host "`n$tierName" -ForegroundColor Yellow
        Write-Host ("-" * 50)

        foreach ($wf in $group.Group | Sort-Object id) {
            $status = if ($wf.enabled) { "✅" } else { "❌" }
            $trigger = $wf.trigger
            $desc = if ($wf.description) { " — $($wf.description)" } else { "" }
            Write-Host "  $status $($wf.id) [$trigger]$desc"
        }
    }
    Write-Host ""
}

function Show-Status {
    Write-Host "`n📊 GH-AW Workflow Status" -ForegroundColor Cyan
    Write-Host ("=" * 50)

    $tiers = @("tier-1", "tier-2", "existing")
    foreach ($tier in $tiers) {
        $workflows = $config.workflows | Where-Object { ($_.tier ?? "existing") -eq $tier }
        $enabled = ($workflows | Where-Object enabled -eq $true).Count
        $total = $workflows.Count
        $tierName = switch ($tier) {
            "tier-1" { "Tier 1 (High Value)" }
            "tier-2" { "Tier 2 (Active Teams)" }
            default { "Existing" }
        }
        Write-Host "  ${tierName}: $enabled/$total enabled"
    }

    $totalEnabled = ($config.workflows | Where-Object enabled -eq $true).Count
    $totalAll = $config.workflows.Count
    Write-Host "`n  Total: $totalEnabled/$totalAll enabled" -ForegroundColor Green
    Write-Host ""
}

function Set-WorkflowEnabled {
    param(
        [string]$Id,
        [bool]$Enabled
    )

    $changed = @()
    
    if ($Id -eq "all") {
        foreach ($wf in $config.workflows) {
            if ($wf.enabled -ne $Enabled) {
                $wf.enabled = $Enabled
                $changed += $wf.id
            }
        }
    }
    elseif ($Id -match "^tier-[12]$") {
        foreach ($wf in $config.workflows | Where-Object { $_.tier -eq $Id }) {
            if ($wf.enabled -ne $Enabled) {
                $wf.enabled = $Enabled
                $changed += $wf.id
            }
        }
    }
    else {
        $wf = $config.workflows | Where-Object id -eq $Id
        if (-not $wf) {
            Write-Error "Workflow not found: $Id"
            Write-Host "Use 'ghaw-toggle.ps1 list' to see available workflows"
            exit 1
        }
        if ($wf.enabled -ne $Enabled) {
            $wf.enabled = $Enabled
            $changed += $wf.id
        }
    }

    if ($changed.Count -gt 0) {
        $config | ConvertTo-Json -Depth 10 | Set-Content $ConfigPath -Encoding UTF8
        $action = if ($Enabled) { "Enabled" } else { "Disabled" }
        Write-Host "✅ $action $($changed.Count) workflow(s):" -ForegroundColor Green
        foreach ($id in $changed) {
            Write-Host "   - $id"
        }
    }
    else {
        Write-Host "ℹ️  No changes needed (already in desired state)" -ForegroundColor Yellow
    }
}

switch ($Action) {
    "list" {
        Show-WorkflowList
    }
    "status" {
        Show-Status
    }
    "enable" {
        if (-not $WorkflowId) {
            Write-Error "WorkflowId required. Use: enable <workflow-id|tier-1|tier-2|all>"
            exit 1
        }
        Set-WorkflowEnabled -Id $WorkflowId -Enabled $true
    }
    "disable" {
        if (-not $WorkflowId) {
            Write-Error "WorkflowId required. Use: disable <workflow-id|tier-1|tier-2|all>"
            exit 1
        }
        Set-WorkflowEnabled -Id $WorkflowId -Enabled $false
    }
}
