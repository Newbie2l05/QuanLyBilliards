@echo off
title BidaCSharp
cd /d "%~dp0BidaCSharp"
echo.
echo  ================================
echo    BidaCSharp - Quan Ly Bida
echo  ================================
echo.
echo  Dang khoi dong...
echo  Trinh duyet se tu dong mo.
echo.
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:5289"
set ASPNETCORE_URLS=http://0.0.0.0:5289
dotnet run
