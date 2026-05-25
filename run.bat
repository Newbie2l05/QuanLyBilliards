@echo off
title BidaCSharp
cd /d "%~dp0BidaCSharp"
echo.
echo  ================================
echo    BidaCSharp - Quan Ly Bida
echo  ================================
echo.
netstat -ano | findstr ":5289" | findstr "LISTENING" >nul
if not errorlevel 1 (
echo  Ung dung dang chay san tai http://localhost:5289
echo  Dang mo trinh duyet...
start "" http://localhost:5289
goto :eof
)

echo  Dang khoi dong...
echo  Trinh duyet se tu dong mo.
echo.
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:5289"
set ASPNETCORE_URLS=http://0.0.0.0:5289
dotnet run
