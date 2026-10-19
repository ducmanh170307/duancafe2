$ErrorActionPreference = 'Stop'
Write-Host "[1/4] Kiem tra ket noi API..."
Invoke-RestMethod 'http://localhost:4000/api/health' | ConvertTo-Json
Write-Host "[2/4] Dang nhap admin..."
$login = Invoke-RestMethod 'http://localhost:4000/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"email":"admin@beanflow.vn","password":"Demo@12345"}'
$headers = @{ Authorization = "Bearer $($login.data.token)" }
Write-Host "[3/4] Doc danh sach chi nhanh..."
(Invoke-RestMethod 'http://localhost:4000/api/branches').data | Format-Table id,name,status
Write-Host "[4/4] Doc menu chi nhanh..."
$data = Invoke-RestMethod 'http://localhost:4000/api/menu?branch_id=1'
Write-Host "So mon:" $data.data.products.Count
Write-Host "Hoan thanh smoke test API."
