@echo off
cd /d "%~dp0"
echo ========================================
echo MojiQ Debug Mode
echo DevTools will open automatically
echo ========================================
set ELECTRON_ENABLE_LOGGING=1
set MOJIQ_DEBUG=1
npm run dev
pause
