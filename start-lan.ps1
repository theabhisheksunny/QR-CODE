# start-lan.ps1 — Build frontend, bundle into backend, start backend on LAN
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot

Write-Host "=== Universal QR Share — LAN Mode ===" -ForegroundColor Cyan
Write-Host "Backend will bind to 0.0.0.0:8787"
Write-Host ""

# Step 1: Build frontend
Write-Host "[1/3] Building frontend..." -ForegroundColor Yellow
Set-Location "$Root\frontend"
npm install
npm run build

# Step 2: Copy dist to backend static
Write-Host "[2/3] Copying frontend dist to backend static resources..." -ForegroundColor Yellow
$StaticDir = "$Root\backend\src\main\resources\static"
if (Test-Path $StaticDir) { Remove-Item $StaticDir -Recurse -Force }
Copy-Item "$Root\frontend\dist" $StaticDir -Recurse
Write-Host "  -> Copied to $StaticDir"

# Step 3: Start backend
Write-Host "[3/3] Starting backend on 0.0.0.0:8787..." -ForegroundColor Yellow
Set-Location "$Root\backend"
Write-Host ""
Write-Host "Open your browser at:   http://localhost:8787" -ForegroundColor Green
Write-Host "LAN devices connect at: http://<your-LAN-IP>:8787" -ForegroundColor Green
Write-Host ""
mvn spring-boot:run
