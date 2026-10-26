# Keto Balance

Приложение и Telegram-бот для сопровождения кето-марафона: персональное меню, каталог рецептов, трекер воды, дневник и поддержка куратора.

Репозиторий: https://github.com/olyalyazinchenk-wq/keto-balance (public)
Хаб проекта в Notion: [KETO BALANCE — хаб проекта](https://app.notion.com/p/KETO-BALANCE-4058a9de1d41812a95a8da4b47ca7175)

> Расчёты калорий, БЖУ, чистых углеводов и электролитов должны выполняться только через `src/core/keto-engine/` по утверждённой спецификации. Значения в каталоге рецептов — исходные данные, а не результат ядра.

## Состав

| Часть | Технологии | Где |
|---|---|---|
| Mini App (клиент) | React 18 + TypeScript + Vite + Tailwind | `src/` |
| Telegram-бот | Python 3.14, python-telegram-bot 22.8, SQLite | `bot/` |
| HTTP-сервер (API + статика) | FastAPI + Uvicorn | `bot/server.py` |
| Каталог рецептов | 37 рецептов, 10 советов | `src/data/recipes.ts`, `bot_data.json` |
| Доменные модули | подбор меню и фильтрация по ограничениям | `src/domain/` |
| Документация | аудит, планы, исследования | `docs/` |

## Быстрый старт

```bash
# клиент
npm install
npm run dev            # http://localhost:5173

# проверки
npm run typecheck      # tsc --noEmit
npm run test:unit      # node --test tests/frontend/*.test.cjs
npm run build          # production-сборка в dist/

# бот (нужен .env, см. ниже)
python -m venv .venv-p0
.venv-p0/Scripts/python.exe -m pip install -r requirements-p0.txt
.venv-p0/Scripts/python.exe -m unittest discover -s tests/backend -t .
```

Windows-хелперы запуска: `run_app.bat`, `run_bot.bat`, `run_server.bat`.
Оркестратор полной проверки: `python scripts/verify-p0.py`.

## Настройка окружения

1. Скопируйте `.env.example` в `.env`.
2. Заполните `KETO_BOT_TOKEN`, `WEBAPP_URL`, `PAYMENT_MODE`.
3. `.env` в Git не попадает (см. `.gitignore`) — секреты в репозиторий не коммитятся.

`PAYMENT_MODE=demo` — режим без реальных списаний. Реальные платежи требуют согласования владельца проекта.

## Текущее состояние (26.10.2026)

**Проверено на этой сборке:**

- `npm run typecheck` — 0 ошибок.
- `npm run test:unit` — 23 теста, 23 pass.
- `unittest tests/backend` — 24 теста, OK.
- `npm run build` — production-сборка собирается.

**Сделано:**

- P0-стабилизация: изоляция `.env` и БД от импорта, отключение legacy-платежей, закрытие статики корнем `dist`.
- P05: фильтрация рецептов по аллергиям и ограничениям (`src/domain/eligibility.ts`), 247 строк, покрыта тестами.
- P06: генерация меню со стабильными слотами и заменой блюд (`src/domain/menu.ts`), покрыта тестами.
- Бот: 37 рецептов, трекер воды, оплата в demo-режиме, русская локализация интерфейса и метаданных.

**Не сделано / открытые вопросы:**

- Модули `src/domain/` покрыты тестами, но ещё **не интегрированы** в UI — см. `docs/p05-p06-review-2026-10-26.md`.
- `src/core/keto-engine/` отсутствует: расчёты БЖУ пока не реализованы как проверяемое ядро.
- Требования R01–R20 не утверждены владельцем (`docs/requirements-draft.md`).
- CI не настроен, completion gate отсутствует (R19).

## Документация

- `docs/audit/2026-10-26-audit.md` — аудит прототипа, подтверждённые проблемы P0/P1/P2.
- `docs/plans/2026-10-26-product-roadmap.md` — 8 этапов развития с воротами приёмки.
- `docs/plans/2026-10-26-monetization-strategy.md` — монетизация, экономика, продление подписки.
- `docs/research/2026-10-26-solutions.md` — исследование решений и реестр источников.
- `docs/requirements-draft.md` — черновик требований к согласованию.
- `AGENTS.md` — инварианты работы над проектом (обязательны к соблюдению).

## Границы безопасности

- Индивидуальные дозы электролитов и медицинские протоколы не назначаются без согласованной методологии.
- При сообщениях об острых симптомах диетические рекомендации прекращаются.
- Правки математического ядра, цен и тарифов, миграции боевой БД и production-деплой требуют ручного согласования владельца.
- Персональные данные участников не передаются внешним сервисам.
