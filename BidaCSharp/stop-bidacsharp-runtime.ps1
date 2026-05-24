$port = 3307
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
    Write-Output "Khong co MySQL runtime nao dang chay o cong $port"
    exit 0
}
Stop-Process -Id $listener.OwningProcess -Force
Write-Output "Da dung MySQL runtime o cong $port"
