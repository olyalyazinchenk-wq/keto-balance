# Релизный план Keto Balance (release/1.0.0)

Единый рабочий бэклог выпуска публичного платного Telegram Mini App Keto Balance.
Утверждён: 2026-11-01.

---

## 1. Функциональные роли и ответственность

| Роль | Назначение | Зона файлов | Ответственность |
|---|---|---|---|
| **Координатор** | Общая интеграция, релизный план, аудит | `docs/release/release-plan.md`, координационные документы | Критический путь, непротиворечивость требований, сводный отчёт |
| **Исполнитель A** | Бэкенд, данные, платежи, эксплуатация | `bot/server.py`, `bot/app_db.py`, `bot/payments.py`, `bot/app_settings.py`, `deploy/*` | Единственный автор общих серверных контрактов и схем БД |
| **Исполнитель B** | Интерфейс, контентный процесс, UX | `src/PilotApp.tsx`, `src/ui/*`, `src/tma/*`, `src/data/*` | Реализация экранов, переходов, доступности и локализации по контрактам |
| **Независимый проверяющий** | Верификация, стресс-тесты, приёмка | `tests/*`, `scripts/verification.py` | Негативные проверки, проверка безопасности, независимый вердикт |

---

## 2. Матрица задач по рубежам R0 – R9

| ID | Рубеж | Роль | Файлы | Зависимости | Проверка | Статус | Результат |
|---|---|---|---|---|---|:---:|---|
| **TASK-R0-1** | R0: Baseline Inventory & Rules | Координатор | `AGENTS.md`, `docs/TEAMWORK.md`, `.gitignore`, `docs/release/baseline-inventory.json` | - | `npm run typecheck`, `npm run test:unit`, `git status` | `в работе` | Ветка `release/1.0.0` создана, инвентарь baseline зафиксирован, 193 unit-теста проходят |
| **TASK-R0-2** | R0: Commit Existing Verified Baseline | Координатор | `src/ui/pilot/*`, `src/PilotApp.tsx`, `public/media/start/*`, `src/tma/telegram.ts`, `bot/app_db.py`, `bot/app_models.py` | TASK-R0-1 | `git commit`, `git status` | `подготовка` | Чистые адресные коммиты существующих блоков |
| **TASK-R1-1** | R1: TDD Red Phase — Exploit Reproducer | Исполнитель A | `tests/backend/test_production_payment_boundaries.py` | TASK-R0-2 | `unittest` (должен упасть на воспроизведении обхода) | `подготовка` | Воспроизведение confirm-demo в production |
| **TASK-R1-2** | R1: Backend Payment Boundary Hardening | Исполнитель A | `bot/server.py`, `bot/payments.py`, `bot/app_settings.py` | TASK-R1-1 | `unittest tests/backend/test_production_payment_boundaries.py` (PASS) | `подготовка` | Жесткий запрет confirm-demo в production/staging, проверка происхождения прав |
| **TASK-R1-3** | R1: Paywall UI Commercial Sanitization | Исполнитель B | `src/ui/food-first/PaywallModal.tsx`, `src/adapters/pilotApi.ts` | TASK-R1-2 | `npm run typecheck`, `npm run test:unit` | `подготовка` | Удалены вторичные продукты, фиктивные отзывы и читерская кнопка из production |
| **TASK-R2-1** | R2: Commercial Specification | Координатор + A + B | `docs/release/commercial-spec.md` | TASK-R1-3 | Экспертная проверка условий, Stars (XTR), прозрачность отмены | `подготовка` | Документ коммерческой спецификации |
| **TASK-R2-2** | R2: Cost & Infrastructure Estimate | Координатор + A | `docs/release/cost-estimate.md` | TASK-R2-1 | Анализ комиссий Telegram (30%), курсов Stars, хостинга VPS | `подготовка` | Смета расходов и сценарии чувствительности |
| **TASK-R3-1** | R3: Recipe Catalog Governance & Releases | Исполнитель B + A | `src/data/releasedRecipeIds.ts`, `bot/catalog.py`, `docs/release/catalog-validation-report.json` | TASK-R2-2 | `node scripts/export-release-catalog.mjs`, unit tests | `подготовка` | Фиксация проверенных ID рецептов, валидация БЖУ и аллергенов |
| **TASK-R3-2** | R3: Educational Guides (8 micro-guides) | Исполнитель B | `docs/content/educational-guides.json`, `src/ui/food-first/Education.tsx` | TASK-R3-1 | Проверка текстов на отсутствие мед. назначений, тесты рендеринга | `подготовка` | 8 проверенных образовательных материалов |
| **TASK-R3-3** | R3: Server-side Consent & Data Rights | Исполнитель A | `bot/app_db.py`, `bot/server.py`, `tests/backend/test_data_rights.py` | TASK-R3-2 | `unittest tests/backend/test_data_rights.py` | `подготовка` | Фиксация согласий (версия, timestamp, user_id), экспорт и удаление |
| **TASK-R4-1** | R4: User Flow & State Persistence | Исполнитель B + A | `src/ui/food-first/*`, `src/PilotApp.tsx`, `bot/server.py` | TASK-R3-3 | Playwright E2E (`playwright.full.config.ts`) | `подготовка` | Навигация Today/Menu/Recipe/Shopping/Diary/Settings/Admin/Support |
| **TASK-R4-2** | R4: Visual & Responsive Acceptance | Исполнитель B | `src/index.css`, `src/ui/food-first/today.css`, скриншоты 320–1280px | TASK-R4-1 | Мобильные скриншоты, проверка safe-area и тем | `подготовка` | Адаптивная верстка без горизонтального скролла |
| **TASK-R5-1** | R5: Telegram Stars Webhook & Invoice API | Исполнитель A | `bot/payments.py`, `bot/server.py`, `bot/bot.py` | TASK-R4-2 | Интеграционные тесты webhook, createInvoiceLink, `/paysupport` | `подготовка` | Эндпоинты Stars, сверка платежей, идемпотентность |
| **TASK-R5-2** | R5: Frontend Stars Checkout & History | Исполнитель B | `src/ui/food-first/PaywallModal.tsx`, `src/adapters/pilotApi.ts` | TASK-R5-1 | Mock/Staging E2E покупка через Telegram | `подготовка` | Оплата через `openInvoice`, отображение истории платежей |
| **TASK-R6-1** | R6: Production Deployment & Docker Compose | Исполнитель A | `deploy/compose.yaml`, `deploy/nginx.conf`, `docs/release/pilot-runbook.md` | TASK-R5-2 | Проверка синтаксиса compose, запуск в изолированном контейнере | `подготовка` | Автономный стек развёртывания (FastAPI + Vite Static + Nginx HTTPS) |
| **TASK-R6-2** | R6: SQLite WAL Backup, Recovery & Drill | Проверяющий + A | `scripts/backup_db.py`, `scripts/restore_db.py`, `tests/backend/test_backup_restore.py` | TASK-R6-1 | Тест полного цикла бэкап → повреждение → восстановление | `подготовка` | Подтверждённый протокол восстановления SQLite WAL |
| **TASK-R6-3** | R6: Single Verification Script Extension | Координатор | `scripts/verification.py` (`--stage public-paid`) | TASK-R6-2 | Полный прогон `verification.py --stage public-paid` | `подготовка` | Единый скрипт приёмки проходит со всеми проверками |
| **TASK-R7-1** | R7: Closed Internal Pilot Package | Проверяющий | `docs/release/closed-pilot-results.md` | TASK-R6-3 | Прогон чек-листа на тестовом стенде владельца | `подготовка` | Отчёт закрытого теста с добровольцами |
| **TASK-R8-1** | R8: Paid Pilot Readiness Package | Координатор | `docs/release/paid-pilot-readiness.md` | TASK-R7-1 | Проверка условий ограниченного платного пилота (до 10 пользователей) | `подготовка` | Пакет документов для владельца |
| **TASK-R9-1** | R9: Release Dossier & PR Preparation | Координатор | `docs/release/release-dossier.md`, Pull Request | TASK-R8-1 | Финальный отчёт, хеши, артефакты, инструкция переключения/отката | `подготовка` | Готовый PR и релизное досье |

---

## 3. Правило обновления бэклога

Каждый исполнитель обновляет статус и результат своей задачи при завершении.
Статусы: `подготовка` → `в работе` → `блокер` → `локально проверено` → `передано`.
При обнаружении блокера координатор фиксирует причину и назначает ответственного.
