[CmdletBinding()]
param(
    [string] $SourceDirectory = (Join-Path $PSScriptRoot '..\..\infra'),
    [string] $BicepExecutable = 'bicep'
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourceDirectory).Path
$modules = @(Get-ChildItem -LiteralPath $source -Recurse -File -Filter '*.bicep')
if ($modules.Count -eq 0) {
    throw "No Bicep modules found in $source."
}

# Compile an isolated copy so stricter lint configuration never edits infra.
$temporary = Join-Path ([IO.Path]::GetTempPath()) ("acw-bicep-" + [guid]::NewGuid())
[void] (New-Item -ItemType Directory -Path $temporary)
try {
    Copy-Item -LiteralPath $source -Destination (Join-Path $temporary 'infra') -Recurse
    $copiedSource = Join-Path $temporary 'infra'
    $configs = @(Get-ChildItem -LiteralPath $copiedSource -Recurse -File -Filter 'bicepconfig.json')
    foreach ($config in $configs) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bicepconfig.json') -Destination $config.FullName
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bicepconfig.json') -Destination (Join-Path $copiedSource 'bicepconfig.json')

    $failed = @()
    foreach ($module in $modules) {
        $relative = [IO.Path]::GetRelativePath($source, $module.FullName)
        Write-Host "Checking Bicep module: $relative"
        & $BicepExecutable build (Join-Path $copiedSource $relative) --outfile (Join-Path $temporary 'compiled.json')
        if ($LASTEXITCODE -ne 0) {
            $failed += $relative
        }
    }
    if ($failed.Count -gt 0) {
        throw "Bicep compilation or secret-output validation failed: $($failed -join ', ')."
    }
    Write-Host "Validated $($modules.Count) Bicep modules."
}
finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force
}
