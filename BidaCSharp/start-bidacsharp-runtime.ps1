$runtimeRoot = Join-Path $PSScriptRoot '.mysql-runtime'
$mysqlBase = Join-Path $runtimeRoot 'engine'
$data = Join-Path $runtimeRoot 'data'
$port = 3307
$mysqldPath = Join-Path $mysqlBase 'bin\mysqld.exe'
$stdoutLog = Join-Path $runtimeRoot 'mysqld.log'
$stderrLog = Join-Path $runtimeRoot 'mysqld.err.log'

if (-not (Test-Path $mysqldPath)) {
    Write-Error "Khong tim thay mysqld.exe tai $mysqldPath"
    exit 1
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    Write-Output "MySQL runtime dang chay o 127.0.0.1:$port"
    exit 0
}

if (-not (Test-Path $data)) {
    New-Item -ItemType Directory -Force -Path $data | Out-Null
    & $mysqldPath ('--basedir="{0}"' -f $mysqlBase) ('--datadir="{0}"' -f $data) --initialize-insecure | Out-Null
}

$arguments = @(
    ('--basedir="{0}"' -f $mysqlBase),
    ('--datadir="{0}"' -f $data),
    "--port=$port",
    "--bind-address=127.0.0.1",
    "--console"
)

Start-Process -FilePath $mysqldPath `
    -ArgumentList $arguments `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden | Out-Null

for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $probe = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($probe) {
        Write-Output "MySQL runtime da san sang o 127.0.0.1:$port"
        exit 0
    }
}

Write-Error "Khong the khoi dong MySQL runtime o cong $port"
exit 1
