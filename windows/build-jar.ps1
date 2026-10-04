<#
.SYNOPSIS
    Builds the Universal QR Sharing fat jar with the React frontend bundled into
    the backend's Spring Boot static resources.

.DESCRIPTION
    Single source of truth for producing backend\target\qr-share-0.0.1-SNAPSHOT.jar.
    Steps:
      1. npm install + npm run build in frontend\  -> frontend\dist
      2. Copy frontend\dist\* into backend\src\main\resources\static\
         (preserving static\.gitkeep)
      3. mvn clean package -DskipTests in backend\ -> executable fat jar

    PowerShell only. Run from any directory; paths resolve against the repo root
    (the parent of this script's folder).

.NOTES
    Requires: Node + npm, Maven, JDK 21+ on PATH. No Docker/DB.
#>
[CmdletBinding()]
param(
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $repoRoot 'frontend'
$backend  = Join-Path $repoRoot 'backend'
$static   = Join-Path $backend  'src\main\resources\static'

Write-Host "[build-jar] repo root : $repoRoot"
Write-Host "[build-jar] frontend  : $frontend"
Write-Host "[build-jar] backend   : $backend"

# 1. Build the frontend bundle.
Push-Location $frontend
try {
    if (-not $SkipNpmInstall) {
        Write-Host "[build-jar] npm install..."
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
    }
    Write-Host "[build-jar] npm run build..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

$dist = Join-Path $frontend 'dist'
if (-not (Test-Path $dist)) { throw "frontend build produced no dist directory: $dist" }

# 2. Copy dist into backend static, preserving .gitkeep.
Write-Host "[build-jar] syncing frontend\dist -> static (preserving .gitkeep)"
if (-not (Test-Path $static)) { New-Item -ItemType Directory -Path $static | Out-Null }
Get-ChildItem $static -Force | Where-Object { $_.Name -ne '.gitkeep' } | Remove-Item -Recurse -Force
Copy-Item (Join-Path $dist '*') $static -Recurse -Force

# 3. Build the fat jar.
Push-Location $backend
try {
    Write-Host "[build-jar] mvn clean package -DskipTests..."
    mvn clean package -DskipTests
    if ($LASTEXITCODE -ne 0) { throw "mvn clean package failed ($LASTEXITCODE)" }
}
finally {
    Pop-Location
}

$jar = Join-Path $backend 'target\qr-share-0.0.1-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { throw "expected fat jar not found: $jar" }

Write-Host "[build-jar] DONE -> $jar"
