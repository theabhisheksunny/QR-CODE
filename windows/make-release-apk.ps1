<#
.SYNOPSIS
    Rebuilds the Android APK end-to-end and republishes it to
    release\UniversalQRSharing.apk, then refreshes release\SHA256SUMS.txt.

.DESCRIPTION
    One command to regenerate the APK if release\UniversalQRSharing.apk is ever
    deleted. Steps:

        1. frontend: npm run build          (shared React production build)
        2. npx cap sync android             (copy web assets + plugins)
        3. gradlew assembleDebug            (build app-debug.apk)
        4. copy -> release\UniversalQRSharing.apk
        5. regenerate release\SHA256SUMS.txt

    The Android build requires a JDK 17 (AGP/Gradle here reject newer JDKs) and
    an Android SDK (API 34/35 + build-tools 34). Both are auto-detected but can
    be overridden with -JdkPath / -AndroidSdk or the JAVA_HOME_17 / ANDROID_HOME
    environment variables.

.PARAMETER JdkPath
    Path to a JDK 17 home. Default: $env:JAVA_HOME_17, else a jdk-17* under
    C:\Program Files\Java or C:\Program Files\Eclipse Adoptium.

.PARAMETER AndroidSdk
    Path to the Android SDK root. Default: $env:ANDROID_HOME, else the repo's
    bundled .tools\android-sdk.

.PARAMETER Release
    Build a signed release APK (assembleRelease) instead of the debug APK.
    Requires signing config (see android\BUILD-ANDROID.md). Default: debug.

.EXAMPLE
    .\windows\make-release-apk.ps1
.EXAMPLE
    .\windows\make-release-apk.ps1 -JdkPath "C:\Program Files\Java\jdk-17.0.18"
#>
[CmdletBinding()]
param(
    [string]$JdkPath,
    [string]$AndroidSdk,
    [switch]$Release
)

$ErrorActionPreference = 'Stop'
$repoRoot   = Split-Path -Parent $PSScriptRoot
$frontend   = Join-Path $repoRoot 'frontend'
$androidDir = Join-Path $frontend 'android'
$releaseDir = Join-Path $repoRoot 'release'

# --- Resolve a JDK 17 ---------------------------------------------------------
if (-not $JdkPath) { $JdkPath = $env:JAVA_HOME_17 }
if (-not $JdkPath) {
    $candidates = @()
    foreach ($base in @('C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium')) {
        if (Test-Path $base) {
            $candidates += Get-ChildItem $base -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
                           Select-Object -ExpandProperty FullName
        }
    }
    $JdkPath = $candidates | Select-Object -First 1
}
if (-not $JdkPath -or -not (Test-Path (Join-Path $JdkPath 'bin\java.exe'))) {
    throw "JDK 17 not found. Install a JDK 17 and pass -JdkPath or set JAVA_HOME_17. (AGP/Gradle here reject JDK 25.)"
}

# --- Resolve the Android SDK --------------------------------------------------
if (-not $AndroidSdk) { $AndroidSdk = $env:ANDROID_HOME }
if (-not $AndroidSdk) { $AndroidSdk = Join-Path $repoRoot '.tools\android-sdk' }
if (-not (Test-Path (Join-Path $AndroidSdk 'platform-tools'))) {
    throw "Android SDK not found at '$AndroidSdk'. Install it (API 34/35 + build-tools;34.0.0) and pass -AndroidSdk or set ANDROID_HOME. See android\BUILD-ANDROID.md."
}

Write-Host "[make-release-apk] JDK 17     : $JdkPath"
Write-Host "[make-release-apk] Android SDK: $AndroidSdk"

# --- 1. Build the shared React production bundle ------------------------------
Write-Host "[make-release-apk] 1/5 npm run build..."
Push-Location $frontend
try {
    if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }

    # --- 2. Sync web assets + Capacitor plugins into the native project -------
    Write-Host "[make-release-apk] 2/5 npx cap sync android..."
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw "cap sync failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

# Point Gradle at the bundled SDK if there is no local.properties yet.
$localProps = Join-Path $androidDir 'local.properties'
if (-not (Test-Path $localProps)) {
    "sdk.dir=$($AndroidSdk -replace '\\','\\')" | Set-Content -Path $localProps -Encoding ASCII
    Write-Host "[make-release-apk] wrote $localProps"
}

# --- 3. Gradle build ----------------------------------------------------------
$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
Write-Host "[make-release-apk] 3/5 gradlew $task (JDK 17)..."
Push-Location $androidDir
try {
    $env:JAVA_HOME        = $JdkPath
    $env:ANDROID_HOME     = $AndroidSdk
    $env:ANDROID_SDK_ROOT = $AndroidSdk
    $env:PATH             = "$JdkPath\bin;$env:PATH"
    & (Join-Path $androidDir 'gradlew.bat') --no-daemon $task
    if ($LASTEXITCODE -ne 0) { throw "gradlew $task failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

# --- 4. Publish the APK -------------------------------------------------------
$apkRel = if ($Release) {
    'app\build\outputs\apk\release\app-release.apk'
} else {
    'app\build\outputs\apk\debug\app-debug.apk'
}
$apk = Join-Path $androidDir $apkRel
if (-not (Test-Path $apk)) { throw "APK not produced: $apk" }

Write-Host "[make-release-apk] 4/5 publishing -> release\UniversalQRSharing.apk"
if (-not (Test-Path $releaseDir)) { New-Item -ItemType Directory -Path $releaseDir | Out-Null }
$dst = Join-Path $releaseDir 'UniversalQRSharing.apk'
if (Test-Path $dst) { attrib -r $dst 2>$null; Remove-Item $dst -Force }
Copy-Item $apk $dst -Force

# --- 5. Checksums -------------------------------------------------------------
Write-Host "[make-release-apk] 5/5 refreshing release\SHA256SUMS.txt"
& (Join-Path $PSScriptRoot 'write-checksums.ps1')

Write-Host "[make-release-apk] DONE -> $dst"
