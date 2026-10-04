<#
.SYNOPSIS
    Produces the real Windows .exe installer for Universal QR Sharing via
    jpackage --type exe.

.DESCRIPTION
    This script is READY TO RUN but REQUIRES WiX on the build machine. jpackage's
    --type exe/msi back end shells out to the WiX Toolset:
        * WiX v3  -> candle.exe + light.exe, or
        * WiX v4/v5 -> wix.exe
    all of which must be on PATH. When none is present, jpackage fails with:

        Can not find WiX tools. Was looking for WiX v3 light.exe and candle.exe
        or WiX v4/v5 wix.exe and none was found
        Error: Invalid or unsupported type: [exe]

    EXECUTION STATUS IN THE BUILD ENVIRONMENT USED FOR FEAT-002: BLOCKED.
    Probes on that host (recorded in FEAT-002.json findings):
        winget : FOUND     choco : NOT FOUND     dotnet : NOT FOUND
        wix    : NOT FOUND  candle: NOT FOUND     light : NOT FOUND
        makensis (NSIS): NOT FOUND
    WiX was NOT installed and installing third-party tooling was out of scope,
    so the installer could not be produced there. The verified self-contained
    app-image (windows\build-app-image.ps1) is the shipped artifact in that
    environment; this script is retained to build the installer unchanged on a
    WiX-equipped Windows machine.

    TO PRODUCE THE INSTALLER:
      1. Install WiX v3.14 (classic candle/light) OR WiX v4/v5 (wix.exe),
         e.g. from https://wixtoolset.org, and ensure it is on PATH.
         Verify with:  wix --version   (v4/v5)   or   candle.exe -? ; light.exe -?  (v3)
      2. Build the fat jar + app-image inputs first (windows\build-jar.ps1).
      3. Run this script. Output: release\windows\UniversalQRSharing-1.0.0.exe

    DATA SAFETY (enforced by RuntimePaths at runtime, FEAT-001):
      * Application BINARIES may live under Program Files (installer default).
      * PERSISTENT USER DATA (shares, metadata, config, logs) always lives under
        %LOCALAPPDATA%\UniversalQRSharing, NEVER inside Program Files or the
        install dir. RuntimePaths resolves this independent of the binary path,
        so an in-place UPGRADE preserves all existing user shares/config.
      * UNINSTALL must NOT silently delete that data. jpackage's default WiX
        uninstaller removes only installed binaries under Program Files and leaves
        %LOCALAPPDATA%\UniversalQRSharing intact; purging user data must remain a
        deliberate, separately documented manual step.

    PowerShell only. jpackage ships with the JDK (21+).
#>
[CmdletBinding()]
param(
    [string]$AppVersion = '1.0.0'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backend  = Join-Path $repoRoot 'backend'
$jarName  = 'qr-share-0.0.1-SNAPSHOT.jar'
$jar      = Join-Path (Join-Path $backend 'target') $jarName
$destDir  = Join-Path $repoRoot 'release\windows'
$inputDir = Join-Path $repoRoot 'release\jpackage-input'
$appName  = 'UniversalQRSharing'
$mainClass = 'org.springframework.boot.loader.launch.JarLauncher'

if (-not (Test-Path $jar)) {
    throw "fat jar not found: $jar  (run windows\build-jar.ps1 first)"
}

# Fail fast with a clear message if WiX is absent, mirroring jpackage's own error.
$wixFound = (Get-Command wix -ErrorAction SilentlyContinue) `
         -or (Get-Command candle -ErrorAction SilentlyContinue) `
         -or (Get-Command light -ErrorAction SilentlyContinue)
if (-not $wixFound) {
    throw @"
WiX Toolset not found on PATH. jpackage --type exe needs WiX v3 (candle.exe + light.exe)
or WiX v4/v5 (wix.exe). Install from https://wixtoolset.org, add it to PATH, then re-run.
The self-contained app-image (windows\build-app-image.ps1) does NOT need WiX and is the
fallback artifact when the installer cannot be built here.
"@
}

if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }

# Stage ONLY the fat jar as jpackage input (clean app payload).
if (Test-Path $inputDir) { Remove-Item $inputDir -Recurse -Force }
New-Item -ItemType Directory -Path $inputDir | Out-Null
Copy-Item $jar (Join-Path $inputDir $jarName) -Force

Write-Host "[installer] running jpackage --type exe..."
jpackage `
    --type exe `
    --name $appName `
    --input $inputDir `
    --main-jar $jarName `
    --main-class $mainClass `
    --dest $destDir `
    --app-version $AppVersion `
    --vendor "Universal QR" `
    --java-options "-Xmx512m" `
    --add-modules "java.base,java.desktop,java.instrument,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.sql,jdk.crypto.ec,jdk.unsupported,jdk.charsets,jdk.localedata,jdk.zipfs" `
    --win-menu `
    --win-shortcut `
    --win-dir-chooser `
    --win-menu-group "Universal QR Sharing"

if ($LASTEXITCODE -ne 0) { throw "jpackage --type exe failed ($LASTEXITCODE)" }

$installer = Join-Path $destDir "$appName-$AppVersion.exe"
if (-not (Test-Path $installer)) { throw "expected installer not found: $installer" }

Write-Host "[installer] DONE -> $installer"
