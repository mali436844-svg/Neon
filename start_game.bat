@echo off
title Neon Gambit Chess Server
color 0b

echo ============================================================
echo               NEON GAMBIT - ARCADE CHESS
echo ============================================================
echo.
echo [1/3] Verifying dependencies...
if not exist "node_modules\" (
    echo Installing required packages...
    call npm install
)

echo.
echo [2/3] Checking environment file...
if not exist ".env.local" (
    if exist ".env.example" (
        copy .env.example .env.local >nul
        echo Created .env.local from template.
    )
)

echo.
echo [3/3] Starting Neon Gambit Dev Server...
echo.
echo ------------------------------------------------------------
echo  Game URL:       http://localhost:3000
echo  Admin Console:  http://localhost:3000/admin
echo ------------------------------------------------------------
echo.
echo Opening browser in 3 seconds...
start "" timeout /t 3 /nobreak >nul & start http://localhost:3000

call npm run dev
pause
