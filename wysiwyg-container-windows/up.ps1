# up.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "Pulling images..." -ForegroundColor Cyan
docker compose pull

Write-Host "Starting containers..." -ForegroundColor Cyan
docker compose up -d --force-recreate --remove-orphans

Write-Host "Containers are running (detached)." -ForegroundColor Green
