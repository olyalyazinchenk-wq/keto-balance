# Базовое состояние проекта (Baseline)

- **Дата фиксации:** 2026-10-26
- **Git HEAD commit:** `2cb84d1aeddf332125d7a9bd0bd33b4ba825c503` (chore: ignore log files)
- **Ветка:** `master`
- **Статус рабочего дерева (`git status --short`):**
  - `?? .hermes/plans/2026-10-26_143341-telegram-release-executor.md`
  - `?? docs/product-brief-2026-10-26.md`

## Фактические версии платформы и зависимостей

- **ОС:** Windows 10 (build 19045)
- **Node.js:** `v26.12.1`
- **Python:** `3.14.9`
- **Frontend стек (`package.json`):**
  - `react`: `^18.3.1`
  - `react-dom`: `^18.3.1`
  - `vite`: `^5.4.2`
  - `typescript`: `^5.5.3`
  - `tailwindcss`: `^3.4.13`
- **Backend стек (`requirements-p0.txt`):**
  - `python-telegram-bot`: `22.8`
  - `fastapi`: `0.133.1`
  - `pydantic`: `2.13.4`
  - `uvicorn`: `0.41.0`
  - `httpx`: `0.28.1`

## Публичные адреса и идентификаторы

- **Имя Telegram-бота:** Кето Баланс
- **Username Telegram-бота:** `@keto_balance_userbot` (https://t.me/keto_balance_userbot)
- **Mini App WebApp URL:** фактическая кнопка Telegram и её адрес в текущем ходе не проверялись.
- **Публичный HTTPS URL:** в текущем ходе не проверялся; временный туннель не запускался.
- **Токены и секреты:** исключены из открытых файлов и логов (`.env` в `.gitignore`)

## Ответственный

- Единый ответственный за исполнение релизного плана: агентская сессия релиза.
- Все изменения выполняются пошагово в строгом соответствии с `.hermes/plans/2026-10-26_143341-telegram-release-executor.md`.
