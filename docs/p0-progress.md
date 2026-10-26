# Keto Balance P0 — Журнал выполнения стабилизации

Дата начала: 26 октября 2026 г.
Статус: В процессе (P01, P02 выполнены)

---

## Исходное состояние
- Git branch: `master`
- Node.js: `v26.12.1`
- npm: `12.0.2`
- Python: `3.14.9`
- Рабочая директория: `C:/Users/HP/Keto-balance`
- Реальный `.env`, рабочая БД SQLite и реальные платежи: изолированы, не модифицируются.

---

## Выполненные задачи

### P01. Подготовка изолированного тестового запуска
- Создано изолированное виртуальное окружение `.venv-p0` с фиксацией версий (`requirements-p0.txt`):
  - `python-telegram-bot==22.8`
  - `fastapi==0.133.1`
  - `pydantic==2.13.4`
  - `uvicorn==0.41.0`
  - `httpx==0.28.1`
- Проверка целостности зависимостей: `.venv-p0/Scripts/python.exe -m pip check` -> 0 конфликтов.
- Настроен `.gitignore`: добавлены `.venv-p0/`, `test-results/`, `playwright-report/`, `*.tsbuildinfo`.
- Создан чистый TypeScript-хелпер для тестов: `tests/helpers/load-ts.cjs` (transpile + vm sandbox без утечки окружения).
- Добавлен smoke-тест harness: `tests/frontend/harness.test.cjs` (`node:test`).
- Настроены скрипты в `package.json`: `test:unit` (`node --test tests/frontend/*.test.cjs`) и `typecheck` (`tsc --noEmit`).
- Создан оркестратор верификации `scripts/verify-p0.py` с автоматической изоляцией `PYTHONPATH`.

### P02. Устранение побочных эффектов импорта БД и .env
- **RED:** `tests/backend/test_import_safety.py` через AST подтвердил вызов `init_db()` на верхнем уровне `bot/database.py` (AssertionError: `'init_db' unexpectedly found in ['init_db']`).
- **FIX:**
  - Из `bot/database.py` удален верхнеуровневый вызов `init_db()`.
  - Функция `get_db()` переведена на `@contextmanager` с явным закрытием соединения (`finally: conn.close()`) и автооткатом (`except: conn.rollback()`).
  - В `bot/config.py` добавлена проверка `os.getenv('KETO_LOAD_DOTENV', '1') == '1'` перед чтением `.env`.
  - В `bot/bot.py` импорт и вызов `init_db()` перенесены внутрь `main()` после валидации токена.
- **GREEN:**
  - `tests/backend/test_import_safety.py`: 2/2 passed (AST-проверка и флаг KETO_LOAD_DOTENV=0).
  - `tests/backend/test_database.py`: 4/4 passed (создание БД только по вызову `init_db()`, закрытие соединения после `get_db()`, откат транзакции при исключении, работа трекера воды в изолированной БД).

---

## Результаты проверок
- `Backend unittest`: 6/6 passed (0 failures, 0 errors).
- `Frontend unit`: 2/2 passed.
- `TypeScript typecheck`: 0 errors.
- `Production build`: 0 errors (dist/ готов).

---

## Следующий шаг
- **P03:** Полное отключение legacy-платежей (`bot/payments.py`, `bot/bot.py`, `bot/config.py`, `src/App.tsx`) с тестами `test_payments_disabled.py` и `test_payment_callbacks.py`.
