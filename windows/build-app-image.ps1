<#
.SYNOPSIS
    Produces a self-contained Windows app-image for Universal QR Sharing using
    jpackage with a bundled Java runtime.

.DESCRIPTION
    Runs jpackage --type app-image. The result (release\windows\UniversalQRSharing\)
    contains UniversalQRSharing.exe plus a bundled JRE, so the installed app needs
    NO separately installed Java/Maven/Node/npm/Docker/Python.

    DESKTOP UI: the EXE launches an EMBEDDED WebView window (JavaFX), NOT an
    external browser. jpackage keeps the Spring Boot launcher
    (org.springframework.boot.loader.launch.JarLauncher) as the main class so the
    nested BOOT-INF/lib classpath (including the bundled JavaFX win-native jars)
    is wired up first; -DQR_DESKTOP=true then makes QrShareApplication hand off to
    the DesktopLauncher (embedded WebView host) instead of starting a headless
    server. No --win-console: this is a true windowed desktop app with no console.

    The fat jar must already exist (run windows\build-jar.ps1 first, or pass
    -BuildJar to chain it). Main-Class is the Spring Boot 3.2 launcher
    org.springframework.boot.loader.launch.JarLauncher (confirmed via the jar's
    META-INF/MANIFEST.MF).

    PowerShell only. jpackage ships with the JDK (JDK 21+). No WiX needed for
    --type app-image (WiX is only required for --type exe/msi; see build-installer.ps1).

.NOTES
    jpackage auto-derives the runtime via jlink from the running JDK.
#>
[CmdletBinding()]
param(
    [string]$AppVersion = '1.0.0',
    [switch]$BuildJar
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backend  = Join-Path $repoRoot 'backend'
$jarName  = 'qr-share-0.0.1-SNAPSHOT.jar'
$jar      = Join-Path (Join-Path $backend 'target') $jarName
$destDir  = Join-Path $repoRoot 'release\windows'
# Clean, jar-only staging dir so jpackage does NOT bundle stray target/ artifacts
# (classes, test-classes, *.jar.original) into the shipped app dir.
$inputDir = Join-Path $repoRoot 'release\jpackage-input'
$appName  = 'UniversalQRSharing'
$mainClass = 'org.springframework.boot.loader.launch.JarLauncher'

if ($BuildJar) {
    Write-Host "[app-image] building jar first..."
    & (Join-Path $PSScriptRoot 'build-jar.ps1')
    if ($LASTEXITCODE -ne 0) { throw "build-jar.ps1 failed ($LASTEXITCODE)" }
}

if (-not (Test-Path $jar)) {
    throw "fat jar not found: $jar  (run windows\build-jar.ps1 or pass -BuildJar)"
}

# jpackage refuses to overwrite an existing app-image dir; clear a stale one.
$appImageDir = Join-Path $destDir $appName
if (Test-Path $appImageDir) {
    Write-Host "[app-image] removing stale app-image: $appImageDir"
    Remove-Item $appImageDir -Recurse -Force
}
if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }

# Stage ONLY the fat jar as jpackage input.
if (Test-Path $inputDir) { Remove-Item $inputDir -Recurse -Force }
New-Item -ItemType Directory -Path $inputDir | Out-Null
Copy-Item $jar (Join-Path $inputDir $jarName) -Force

Write-Host "[app-image] running jpackage --type app-image..."
jpackage `
    --type app-image `
    --name $appName `
    --input $inputDir `
    --main-jar $jarName `
    --main-class $mainClass `
    --dest $destDir `
    --app-version $AppVersion `
    --vendor "Universal QR" `
    --java-options "-Xmx512m" `
    --java-options "-DQR_DESKTOP=true" `
    --java-options "-Djava.awt.headless=false" `
    --add-modules "java.base,java.desktop,java.instrument,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.sql,java.xml,java.datatransfer,jdk.crypto.ec,jdk.unsupported,jdk.charsets,jdk.localedata,jdk.zipfs,jdk.xml.dom"

if ($LASTEXITCODE -ne 0) { throw "jpackage failed ($LASTEXITCODE)" }

$exe = Join-Path $appImageDir "$appName.exe"
if (-not (Test-Path $exe)) { throw "expected app-image exe not found: $exe" }

Write-Host "[app-image] DONE -> $exe"
