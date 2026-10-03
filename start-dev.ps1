# start-dev.ps1 — Start backend and frontend dev server in separate windows (hot reload)
$Root = $PSScriptRoot

Write-Host "=== Universal QR Share — DEV Mode ===" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8787  (Spring Boot)"
Write-Host "Frontend: http://localhost:5173  (Vite dev server)"
Write-Host "API docs: http://localhost:8787/swagger-ui/index.html"
Write-Host ""

# Start backend in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\backend'; mvn spring-boot:run"

# Start frontend dev server in this window
Set-Location "$Root\frontend"
npm run dev
