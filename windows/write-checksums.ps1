<#
.SYNOPSIS
    (Re)generates release\SHA256SUMS.txt for the final release artifacts.

.DESCRIPTION
    Hashes whichever of these exist and writes "<sha256>  <name>" lines:
        release\UniversalQRSharing-Setup.exe
        release\UniversalQRSharing.apk
    Safe to run any time; missing artifacts are simply skipped.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $repoRoot 'release'

$names = @('UniversalQRSharing-Setup.exe', 'UniversalQRSharing.apk')
$lines = @()
foreach ($n in $names) {
    $f = Join-Path $releaseDir $n
    if (Test-Path $f) {
        $h = (Get-FileHash $f -Algorithm SHA256).Hash.ToLower()
        $lines += "$h  $n"
        Write-Host "[checksums] $n -> $h"
    } else {
        Write-Host "[checksums] (skip, not present) $n"
    }
}

if ($lines.Count -eq 0) {
    Write-Warning "No release artifacts found in $releaseDir; SHA256SUMS.txt not written."
    return
}

$out = Join-Path $releaseDir 'SHA256SUMS.txt'
$lines | Set-Content -Path $out -Encoding ASCII
Write-Host "[checksums] wrote $out"
