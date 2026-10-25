@echo off
chcp 65001 >nul
title Keto Balance - Mini App Dev Server
echo ===================================================
echo    Keto Balance - Запуск React Mini App (Vite)
echo ===================================================
cd /d "%~dp0"
call npm run dev
pause
