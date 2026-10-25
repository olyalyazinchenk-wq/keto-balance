@echo off
chcp 65001 >nul
title Keto Balance - Telegram Bot
echo ===================================================
echo    Keto Balance - Запуск Telegram-бота
echo ===================================================
cd /d "%~dp0"
python -m bot.bot
pause
