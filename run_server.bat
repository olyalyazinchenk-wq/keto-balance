@echo off
chcp 65001 >nul
title Кето Баланс - FastAPI & Mini App Server
echo ===================================================
echo    Кето Баланс - Запуск Web-сервера (FastAPI)
echo    Порт: http://localhost:8000
echo ===================================================
cd /d "%~dp0"
python -m bot.server
pause
