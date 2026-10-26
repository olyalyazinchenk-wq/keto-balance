@echo off
chcp 65001 >nul
title Кето Баланс - Mini App Dev Server
echo ===================================================
echo    Кето Баланс - Запуск React Mini App (Vite)
echo ===================================================
cd /d "%~dp0"
call npm run dev
pause
