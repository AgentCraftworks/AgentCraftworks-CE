[CmdletBinding()]
param(
    [string] $BicepExecutable = 'bicep'
)

$ErrorActionPreference = 'Stop'
$guard = Join-Path $PSScriptRoot 'check-bicep-outputs.ps1'
$fixtures = Join-Path $PSScriptRoot 'fixtures'

& $guard -SourceDirectory (Join-Path $fixtures 'safe') -BicepExecutable $BicepExecutable
$rejected = $false
$diagnosticFile = Join-Path ([IO.Path]::GetTempPath()) ("acw-bicep-test-" + [guid]::NewGuid() + '.log')
try {
    try {
        & $guard -SourceDirectory (Join-Path $fixtures 'unsafe') -BicepExecutable $BicepExecutable *> $diagnosticFile
    }
    catch {
        if ($_.Exception.Message -notlike 'Bicep compilation or secret-output validation failed:*') {
            throw
        }
        $rejected = $true
    }
    if (-not $rejected) {
        throw 'The secret-output guard accepted an insecure output.'
    }
    $messages = Get-Content -LiteralPath $diagnosticFile -Raw
    if ($messages -notmatch "outputs-should-not-contain-secrets.*secure value 'alias'" -or
        $messages -notmatch "outputs-should-not-contain-secrets.*function 'listKeys'") {
        throw 'Expected secure-parameter alias and listKeys diagnostics were not both emitted.'
    }
}
finally {
    if (Test-Path -LiteralPath $diagnosticFile) {
        Remove-Item -LiteralPath $diagnosticFile -Force
    }
}
Write-Host 'Bicep secret-output guard fixtures passed.'
