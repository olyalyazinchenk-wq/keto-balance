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
| **TASK-R0-1** | R0: Baseline Inventory & Rules | Координатор | `AGENTS.md`, `docs/TEAMWORK.md`, `.gitignore`, `docs/release/baseline-inventory.json` | - | `npm run typecheck`, `npm run test:unit`, `git status` | `локально проверено` | Ветка `feat/appetizing-interface-20261106`, инвентарь baseline зафиксирован, unit-тесты проходят |
| **TASK-R0-2** | R0: Commit Existing Verified Baseline | Координатор | `src/ui/pilot/*`, `src/PilotApp.tsx`, `public/media/start/*`, `src/tma/telegram.ts`, `bot/app_db.py`, `bot/app_models.py` | TASK-R0-1 | `git commit`, `git status` | `локально проверено` | Чистые адресные коммиты существующих блоков |
| **TASK-P0-B1** | P0: Startup & Network Timeout | Исполнитель B (Stream B) | `index.html`, `src/main.tsx`, `src/api/fetchWithTimeout.ts`, `src/api/ketoClient.ts`, `src/adapters/pilotApi.ts`, `src/PilotApp.tsx`, `tests/frontend/network-timeout.test.cjs` | TASK-R0-2 | `npm run test:unit`, `tsc` | `локально проверено` | Асинхронный SDK Telegram (5с), тайм-аут запросов 10с, неблокирующая подписка |
| **TASK-P0-B2** | P0: Recipes & Yield Labels | Исполнитель B (Stream B) | `src/data/recipes.ts`, `src/ui/food-first/Recipe.tsx` | TASK-P0-B1 | `npm run test:unit`, `tsc` | `локально проверено` | Согласован выход блюд по variant.yieldNote, уточнён заголовок k5 |
| **TASK-P0-A1** | P0: Backend Test Isolation | Исполнитель A (Stream A) | `tests/backend/test_agent_ops.py` | TASK-R0-2 | `run_backend_tests.py` | `локально проверено` | Изоляция audit log и staging check в scratch-путях, 267 тестов PASS |
| **TASK-P0-C1** | P0: Baseline Preservation & Docs | Координатор | `docs/release/release-plan.md`, `docs/handoff/2026-11-06-startup-progress.md`, `CONTINUE_HERE.md` | TASK-P0-B1, TASK-P0-B2, TASK-P0-A1 | `git status`, `build-isolated.mjs` | `локально проверено` | Адресные коммиты P0 зафиксированы, документация передачи и статус обновлены |
| **TASK-R1-1** | R1: TDD Red Phase — Exploit Reproducer | Исполнитель A | `tests/backend/test_production_payment_boundaries.py` | TASK-R0-2 | `unittest` | `локально проверено` | Воспроизведение confirm-demo в production реализовано, эксплойт изолирован и закрыт тестом |
| **TASK-R1-2** | R1: Backend Payment Boundary Hardening | Исполнитель A | `bot/server.py`, `bot/payments.py`, `bot/app_settings.py` | TASK-R1-1 | `unittest tests/backend/test_production_payment_boundaries.py` (PASS) | `локально проверено` | Жесткий запрет confirm-demo в production/staging, проверка происхождения прав (HTTP 403) |
| **TASK-R1-3** | R1: Paywall UI Commercial Sanitization | Исполнитель B | `src/ui/food-first/PaywallModal.tsx`, `src/adapters/pilotApi.ts` | TASK-R1-2 | `npm run typecheck`, `npm run test:unit` | `локально проверено` | Удалены вторичные продукты, фиктивные отзывы и читерская кнопка из production |
| **TASK-R2-1** | R2: Commercial Specification | Координатор + A + B | `docs/release/commercial-spec.md` | TASK-R1-3 | Экспертная проверка условий, Stars (XTR), прозрачность отмены | `локально проверено` | Документ коммерческой спецификации утверждён, прозрачные условия `/paysupport` |
| **TASK-R2-2** | R2: Cost & Infrastructure Estimate | Координатор + A | `docs/release/cost-estimate.md` | TASK-R2-1 | Анализ комиссий Telegram (30%), курсов Stars, хостинга VPS | `локально проверено` | Смета Cloud.ru Evolution (2 vCPU/4 ГБ/10% CPU/30 ГБ диск), расчет гранта, запас 20%, запрет автопополнения |
| **TASK-R3-1** | R3: Recipe Catalog Governance & Releases | Исполнитель B + A | `src/data/releasedRecipeIds.ts`, `bot/catalog.py`, `docs/release/catalog-validation-report.json` | TASK-R2-2 | `node scripts/export-release-catalog.mjs`, unit tests | `локально проверено` | 50 рецептов (34 кето, 16 карнивор), валидация БЖУ, очистка автоодобрений и источников из сидов, валидация публикации черновиков (HTTP 422) |
| **TASK-R3-2** | R3: Educational Guides (8 micro-guides) | Исполнитель B | `docs/content/educational-guides.json`, `src/ui/food-first/Education.tsx` | TASK-R3-1 | Проверка текстов на отсутствие мед. назначений, тесты рендеринга | `локально проверено` | 8 проверенных образовательных материалов без медицинских назначений |
| **TASK-R3-3** | R3: Server-side Consent & Data Rights | Исполнитель A | `bot/app_db.py`, `bot/server.py`, `tests/backend/test_data_rights.py` | TASK-R3-2 | `unittest tests/backend/test_data_rights.py` | `локально проверено` | Фиксация согласий (версия, timestamp, user_id), экспорт и удаление данных |
| **TASK-R4-1** | R4: User Flow & State Persistence | Исполнитель B + A | `src/ui/food-first/*`, `src/PilotApp.tsx`, `bot/server.py` | TASK-R3-3 | Playwright E2E (`playwright.full.config.ts`) | `локально проверено` | Навигация Today/Menu/Recipe/Shopping/Settings/Admin/Support, масштабирование 1, 2, 4 порции (targetPortions / baseServ), позднее подключение SDK Telegram (>5с), персистентность |
| **TASK-R4-2** | R4: Visual & Responsive Acceptance | Исполнитель B | `src/index.css`, `src/ui/food-first/today.css`, скриншоты 320–1280px | TASK-R4-1 | Мобильные скриншоты, проверка safe-area и тем | `локально проверено` | Адаптивная верстка проверена на 320, 390, 768, 1440 px через Playwright full (15 passed) |
| **TASK-R5-1** | R5: Telegram Stars Webhook & Invoice API | Исполнитель A | `bot/payments.py`, `bot/server.py`, `bot/bot.py` | TASK-R4-2 | Интеграционные тесты webhook, createInvoiceLink, `/paysupport` | `локально проверено` | Эндпоинты Stars, единый polling bot, серверная валидация платежей, идемпотентность, `/paysupport` |
| **TASK-R5-2** | R5: Frontend Stars Checkout & History | Исполнитель B | `src/ui/food-first/PaywallModal.tsx`, `src/adapters/pilotApi.ts` | TASK-R5-1 | Mock/Staging E2E покупка через Telegram | `локально проверено` | Оплата через `openInvoice`, отображение истории платежей, безопасный fallback |
| **TASK-R6-1** | R6: Production Deployment & Docker Compose | Исполнитель A | `deploy/compose.yaml`, `deploy/nginx.conf`, `docs/release/pilot-runbook.md` | TASK-R5-2 | Проверка синтаксиса compose, запуск в изолированном контейнере | `локально проверено` | Автономный стек развёртывания (FastAPI + Vite Static + Caddy HTTPS + sslip.io), без затрагивания защищённых портов (18081) |
| **TASK-R6-2** | R6: SQLite WAL Backup, Recovery & Drill | Проверяющий + A | `scripts/backup_db.py`, `scripts/restore_db.py`, `tests/backend/test_backup_restore.py` | TASK-R6-1 | Тест полного цикла бэкап → повреждение → восстановление | `локально проверено` | Подтверждённый протокол восстановления SQLite WAL (RPO <= 15 мин, RTO <= 1 час) |
| **TASK-R6-3** | R6: Single Verification Script Extension | Координатор | `scripts/verification.py` (`--stage public-paid`) | TASK-R6-2 | Полный прогон `verification.py --stage public-paid` | `локально проверено` | Единый скрипт приёмки проходит со всеми проверками, нагрузочный тест (10 воркеров, p95 216ms) отделён от статических проверок |
| **TASK-R7-1** | R7: Closed Internal Pilot Package | Проверяющий | `docs/release/closed-pilot-results.md` | TASK-R6-3 | Прогон чек-листа на тестовом стенде владельца | `передано` | Пакет и чек-лист закрытого теста на 5 добровольцев (цель: >=4 проходят самостоятельно, >=3 возвращаются) подготовлен к запуску |
| **TASK-R8-1** | R8: Paid Pilot Readiness Package | Координатор | `docs/release/paid-pilot-readiness.md` | TASK-R7-1 | Проверка условий ограниченного платного пилота (до 10 пользователей) | `передано` | Пакет платного пилота (до 10 пользователей, Stars XTR) подготовлен к запуску по согласованию с Ольгой |
| **TASK-R9-1** | R9: Release Dossier & PR Preparation | Координатор | `docs/release/release-dossier.md`, Pull Request | TASK-R8-1 | Финальный отчёт, хеши, артефакты, инструкция переключения/отката | `передано` | Релизное досье docs/handoff/2026-11-06-final-release-dossier.md, чистое дерево git, вердикт CLEAN |

---

## 3. Правило обновления бэклога

Каждый исполнитель обновляет статус и результат своей задачи при завершении.
Статусы: `подготовка` → `в работе` → `блокер` → `локально проверено` → `передано`.
При обнаружении блокера координатор фиксирует причину и назначает ответственного.

---

## 4. Сводка устранения замечаний независимой проверки Codex (9 пунктов)

В рамках цикла доработок устранены все замечания независимой проверки Codex:

1. **Очистка автоодобрений и клинических источников из тестовых заготовок (коммит `662afab`):**
   - В `bot/app_db.py` исключена автоматическая простановка `approved: True` и `source` в сид-рецептах. Одобрение доступно только через явную процедуру публикации в административном API. Очищены тестовые записи в базах данных.
2. **Сквозная поддержка значения 4 порций в API, моделях и БД (коммит `067450a`):**
   - В `bot/pilot_models.py` и `bot/app_db.py` тип `shopping_batches` расширен до `Literal[1, 2, 4]`. Проверено сохранение и репликация состояния при повторном входе (`test_shopping_batches_remediation.py`).
3. **Разделение порций и базового выхода (коммиты `e3bc762`, `c8b3a3e`):**
   - Расчёт множителя в `src/adapters/recipesAdapter.ts` и `src/ui/food-first/shoppingFromMenu.ts` переведён на точную формулу `targetPortions / baseServings`. Устранено двойное деление в fallback-масштабировании.
4. **Запрет публикации неполных/непроверенных рецептов с возвратом HTTP 422 (коммиты `bffb254`, `fa2b3bb`):**
   - В `bot/app_db.py` внедрена строгая построчная валидация черновиков (название, количества, шаги, подтверждённый автор). Неполные или непроверенные черновики отклоняются с кодом 422 Unprocessable Entity.
5. **Согласованность списка покупок на сервере с учётом порционности (коммит `f846b67`):**
   - В `bot/catalog.py` согласован расчёт граммовок на порцию в проверке `is_shopping_consistent_with_menu`, предотвращая ложное срабатывание флага устаревания списка.
6. **Обработка позднего появления Telegram SDK (>5 секунд) без повторной авторизации (коммит `e3bc762`):**
   - В `src/main.tsx`, `src/PilotApp.tsx`, `src/tma/telegram.ts` реализован хук `onLateTelegramSDK`: при поздней инициализации вызывается `ready()`, подписка на тему и события, без сброса сессии и повторных сетевых вызовов `/api/auth/telegram`.
7. **Разделение статических проверок конфигурации Docker и реальных нагрузочных испытаний (коммит `947bbf1`):**
   - Реализован выделенный сценарий нагрузки `scripts/run_load_test.py` (10 одновременных воркеров, 90 запросов, p95 216–265 мс при пороге < 2000 мс), полностью отделённый от статических проверок `compose.yaml`.
8. **Адверсарные тесты на негативные сценарии (коммит `737e175`):**
   - Добавлен комплексный набор тестов `tests/backend/test_challenger_2_adversarial.py` и `test_stream_a_challenger_adversarial.py`, проверяющий граничные условия, инъекции и попытки обхода авторизации.
9. **Подтверждённый чистый аудит качества (вердикт CLEAN):**
   - Проведена независимая проверка целостности кода: отсутствие имитаций, фиктивных заглушек и захардкоженных тестовых строк; полная регрессия тестового контура: 324 backend теста, 249 frontend тестов, 15 Playwright E2E тестов.

