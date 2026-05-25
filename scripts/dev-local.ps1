# Start FilmBench API + Web on this machine (two windows).
# Prereqs: Postgres up, npm run db:migrate, .env with DATABASE_URL + JWT_SECRET + NEXT_PUBLIC_API_URL

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path "$root\.env")) {
  Write-Host "Missing .env — copy from .env.example" -ForegroundColor Yellow
}

Write-Host "Starting API on http://127.0.0.1:4000 ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root'; npm run dev:api"
)

Start-Sleep -Seconds 2

Write-Host "Starting Web on http://127.0.0.1:3000 ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root'; npm run dev:web"
)

Write-Host ""
Write-Host "Open: http://127.0.0.1:3000/login" -ForegroundColor Green
Write-Host "Demo:  admin@filmbench.local / ChangeMe123!" -ForegroundColor Green
