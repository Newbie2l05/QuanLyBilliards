@echo off
title BidaCSharp
echo.
echo  Dang khoi dong BidaCSharp...
echo.
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:5289"
dotnet run
