@echo off
chcp 65001 >nul
title Кето Баланс - Telegram Bot
echo ===================================================
echo    Кето Баланс - Запуск Telegram-бота
echo ===================================================
cd /d "%~dp0"
python -m bot.bot
pause
