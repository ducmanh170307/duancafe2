# Chay trong thu muc khung-nen: powershell -ExecutionPolicy Bypass -File .\up-khung.ps1
$repo = "https://github.com/ducmanh170307/duancafe2.git"

if (-not (Test-Path .\server.js)) { Write-Host "SAI THU MUC: khong thay server.js" -ForegroundColor Red; exit 1 }
if (Test-Path .\.env) { Write-Host "DUNG: co file .env, xoa no truoc khi up" -ForegroundColor Red; exit 1 }
if (Test-Path .\node_modules) { Write-Host "DUNG: co node_modules, xoa no truoc khi up" -ForegroundColor Red; exit 1 }
if (Test-Path .\.git) { Write-Host "DUNG: thu muc nay da co .git, hay giai nen vao thu muc moi" -ForegroundColor Red; exit 1 }

git init
git add .
git commit -m "chore: khoi tao khung project"
git branch -M main
git remote add origin $repo
git push -u origin main
if ($LASTEXITCODE -ne 0) { Write-Host "PUSH LOI - gui dong bao loi cho tro ly" -ForegroundColor Red; exit 1 }

Write-Host "XONG. Kiem tra repo tren GitHub." -ForegroundColor Green
