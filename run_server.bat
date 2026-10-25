@echo off
chcp 65001 >nul
title Keto Balance - FastAPI & Mini App Server
echo ===================================================
echo    Keto Balance - Запуск Web-сервера (FastAPI)
echo    Порт: http://localhost:8000
echo ===================================================
cd /d "%~dp0"
python -m bot.server
pause
