@echo off
echo ============================================
echo   Machina Quote Tool
echo ============================================
echo.

REM Install backend deps
echo Installing backend dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt -q
if errorlevel 1 (
    echo ERROR: pip install failed. Make sure Python is installed.
    pause
    exit /b 1
)

REM Install frontend deps
echo Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install --silent
if errorlevel 1 (
    echo ERROR: npm install failed. Make sure Node.js is installed.
    pause
    exit /b 1
)

echo.
echo Starting backend on http://localhost:8000 ...
start "Quote Tool - Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn main:app --reload --port 8000"

timeout /t 2 /nobreak >nul

echo Starting frontend on http://localhost:5173 ...
start "Quote Tool - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ============================================
echo   App running at http://localhost:5173
echo ============================================
echo.
start http://localhost:5173
