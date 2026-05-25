@echo off
title BidaCSharp
echo.
netstat -ano | findstr ":5289" | findstr "LISTENING" >nul
if not errorlevel 1 (
echo  Ung dung dang chay san tai http://localhost:5289
echo  Dang mo trinh duyet...
start "" http://localhost:5289
goto :eof
)

echo  Dang khoi dong BidaCSharp...
echo.
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:5289"
dotnet run
