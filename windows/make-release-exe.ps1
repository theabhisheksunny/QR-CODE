<#
.SYNOPSIS
    Rebuilds the Windows installer end-to-end and republishes it to
    release\UniversalQRSharing-Setup.exe, then refreshes release\SHA256SUMS.txt.

.DESCRIPTION
    One command to regenerate the Windows .exe if release\UniversalQRSharing-Setup.exe
    is ever deleted. It chains the existing single-purpose scripts:

        1. windows\build-jar.ps1          (frontend build + bundle + fat jar)
        2. windows\build-installer.ps1    (jpackage + WiX -> installer .exe)
        3. copy -> release\UniversalQRSharing-Setup.exe
        4. regenerate release\SHA256SUMS.txt for whatever artifacts exist

    Requirements (build machine only; the INSTALLED app needs none of these):
      - Node + npm, Maven, JDK 21+ on PATH
      - WiX v3.14 (auto-detected by build-installer.ps1 at its default location)

.PARAMETER AppVersion
    Installer version (default 1.0.0).

.PARAMETER SkipNpmInstall
    Pass through to build-jar.ps1 to skip `npm install` when node_modules exists.

.EXAMPLE
    .\windows\make-release-exe.ps1
.EXAMPLE
    .\windows\make-release-exe.ps1 -SkipNpmInstall
#>
[CmdletBinding()]
param(
    [string]$AppVersion = '1.0.0',
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $repoRoot 'release'

Write-Host "[make-release-exe] 1/4 building fat jar..."
if ($SkipNpmInstall) {
    & (Join-Path $PSScriptRoot 'build-jar.ps1') -SkipNpmInstall
} else {
    & (Join-Path $PSScriptRoot 'build-jar.ps1')
}

Write-Host "[make-release-exe] 2/4 building installer (.exe) via jpackage + WiX..."
& (Join-Path $PSScriptRoot 'build-installer.ps1') -AppVersion $AppVersion

$built = Join-Path $repoRoot "release\windows\UniversalQRSharing-$AppVersion.exe"
if (-not (Test-Path $built)) { throw "installer not produced: $built" }

Write-Host "[make-release-exe] 3/4 publishing -> release\UniversalQRSharing-Setup.exe"
if (-not (Test-Path $releaseDir)) { New-Item -ItemType Directory -Path $releaseDir | Out-Null }
$setup = Join-Path $releaseDir 'UniversalQRSharing-Setup.exe'
if (Test-Path $setup) { attrib -r $setup 2>$null; Remove-Item $setup -Force }
Copy-Item $built $setup -Force

Write-Host "[make-release-exe] 4/4 refreshing release\SHA256SUMS.txt"
& (Join-Path $PSScriptRoot 'write-checksums.ps1')

Write-Host "[make-release-exe] DONE -> $setup"
