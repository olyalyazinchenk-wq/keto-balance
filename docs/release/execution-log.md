# Журнал исполнения (Execution Log)

## A01–A02. Baseline и назначение ролей
- **Время фиксации:** 2026-10-30 16:15 МСК
- **Git Branch:** `design/argon-ui-import`
- **Git HEAD:** `24e849ff1e5cd0ffe0ef9480539bd26a7f93262c`
- **Git Dirty Files:** 12 modified, 1 deleted (`scripts/sync-argon.mjs`), 41 untracked (сохраняются без изменений).
- **Роли:**
  - Интегратор сквозного пути: Hermes / Antigravity
  - Владелец согласований: Ольга
  - Правило одного writer: правки `App.tsx` и конфигураций выполняет только назначенный интегратор.

---

## K00–K09. Gate K0 (Локальный checkpoint)
- **Время выполнения:** 2026-10-30 16:17–16:22 МСК
- **K00 (RED):** `node --import tsx --test --test-reporter=tap src/utils/selectedDay.test.ts` → `ERR_MODULE_NOT_FOUND` (exit 1).
- **K01 (GREEN):** Создан `src/utils/selectedDay.ts` → тест 1 pass (exit 0).
- **K02 (5/5 PASS):** Добавлены все 5 граничных случаев (`selectedDay.test.ts`) → 5 pass, 0 fail/skip (exit 0).
- **K03–K04:** Внедрены `STORAGE_KEYS.selectedDay` ('kb_proto_selected_day_v1'), lazy initializer и `useEffect` валидации/сохранения в `design/argon-food-first-work/src/App.tsx`.
- **K05–K06 (Браузерная проверка):**
  - Сборка в изолированный каталог `dist-isolated` (exit 0).
  - В реальном браузере через `browser_exec` проверен выбор «День 2» в UI Меню → сохранение в `localStorage['kb_proto_selected_day_v1'] = '2'`.
  - Перезагрузка страницы → активен День 2 (`'День 2 · Простые домашние блюда57 мин у плиты'`).
  - Запись некорректного значения `999` → fallback на день 1 без повреждения или сброса данных меню (`menu_intact: True`).
- **K07 (Регрессия донора):**
  - Команда: `node --import tsx --test --test-reporter=tap tests/frontend/*.test.cjs src/utils/*.test.ts`
  - Результат: 28 tests, 28 pass, 0 fail, 0 skipped, 0 cancelled (exit 0).
  - TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` → exit 0.
- **K08 (Safe allowlist SHA-256):**
  - `15fe4585e260f55fdcc0ca4b7c2e1e45eac9d5d238b7defed8bb3baa8566b21c` `src/utils/selectedDay.ts`
  - `b92535a1a8bce98e0cff04b5a50e2cd27fa86fdab81abb892bc0b90adbe3af9c` `src/utils/selectedDay.test.ts`
  - `1a1e3b595b382613ae37b7aa25e045458751073b8365d5d56bc71f873e6b13f4` `src/App.tsx`
- **K09:** Статус Gate K0 = PASS. Сформирован `docs/release/acceptance.md`.

---

## I01–I05. Изоляция сборки основного приложения от неявного runtime I/O
- **Время выполнения:** 2026-10-30 18:22–18:25 МСК
- **I01:** Проанализирован lifecycle сборки: `package.json` (`validate:catalog`, `build`), `scripts/validate-catalog.mjs`, `scripts/stamp-release.mjs`. Выявлено неявное чтение `ROOT/bot_data.json` в `validate-catalog.mjs`.
- **I02 (RED):** Создан тест `tests/frontend/catalog-build-safety.test.cjs` с синтетическим перехватом (`fs.readFileSync` trap). На исходном `validate-catalog.mjs` зафиксирован чистый RED:
  - `[WARN] Could not parse bot_data.json: Synthetic trap: runtime data read is forbidden`
  - `AssertionError: validator attempted runtime data access (actual: 1, expected: 0)`
  - Результат: 5 tests, 0 pass, 5 fail (exit 1).
- **I03–I04 (GREEN):** В `scripts/validate-catalog.mjs` устранено неявное чтение `bot_data.json`. Синхронизация с ботом переведена на явную synthetic fixture (`options.botRecipes`), при отсутствии fixture — честный статус `botSync.status = 'NOT_RUN'`. Добавлены проверки валидности явного fixture (массив, обязательные числовые макросы, уникальные id). Повторный прогон `catalog-build-safety.test.cjs`: 5 tests, 5 pass, 0 fail (exit 0).
- **I05 (Проверка сборки в изоляции):**
  - `node scripts/validate-catalog.mjs` → `Static catalog checks PASSED. Bot synchronization: NOT_RUN.` (exit 0).
  - `node --test tests/frontend/*.test.cjs` → 24 subtests / 114 test assertions: 114 pass, 0 fail (exit 0).
  - `npm run typecheck` (`tsc --noEmit --incremental false --pretty false`) → exit 0.
  - `npm run build` (`node scripts/validate-catalog.mjs && tsc && vite build && node scripts/stamp-release.mjs`) → exit 0, Built release `43ec271158ccb70f`.
- **SHA-256 изменённых файлов:**
  - `d0aaa3eb39c9812090af764199cdbf6aa53f980b8e738635f46b7d1f53c7e5d9` `tests/frontend/catalog-build-safety.test.cjs`
  - `9a68fd7200cb69ac581764e56fa198c4cac09e4d6fedb1988f776f31449b84bc` `scripts/validate-catalog.mjs`

---

## Закрытие I05/V ревью и изоляция frontend env
- **Время выполнения:** 2026-10-30 22:34 МСК
- **Устранение чтения .env и изоляция окружения:**
  - В `vite.config.ts` добавлена изоляция `envDir: './src/core/env'`, предотвращающая загрузку корневого `.env` во frontend build.
  - В `scripts/verification.py` восстановлен `merged.pop("PYTHONPATH", None)` в `run_step`.
  - В `tests/backend/test_verify_script.py` добавлен регрессионный тест `test_run_step_strips_inherited_pythonpath` (8/8 pass).
  - В `tests/frontend/catalog-build-safety.test.cjs` добавлены проверки изоляции `envDir` и `loadEnv` Vite (7/7 pass).
  - Проведён полный lifecycle-тест сборки в scratch-каталоге без перезаписи боевого `dist` (`BUILD_SUCCESS, envReadAttempts: 0`).
- **Синтетические тесты бэкенда:**
  - В `tests/backend/test_import_safety.py` подтверждены 3 теста: `test_no_top_level_init_db_in_database_py`, `test_import_with_keto_load_dotenv_zero_does_not_require_env`, `test_strict_import_safety_in_fresh_process` (3/3 pass).
  - `python -m unittest tests.backend.test_product_gate_policy` -> 7 tests, 7 pass (exit 0).
  - `python -m unittest tests.backend.test_verify_script` -> 8 tests, 8 pass (exit 0).

---

## V01–V06. Technical policy manifests и guards верификации
- **Время выполнения:** 2026-10-30 21:52–21:56 МСК
- **V01 (RED):** Создан `tests/backend/test_product_gate_policy.py`. Первый запуск зафиксировал ожидаемый RED (5 ошибок из-за неизвестных stages `k1-local`, `k2-pilot`, `k3-pilot`).
- **V02–V04 (GREEN):** В `scripts/verification.py` добавлены кортежи `PRODUCT_GATES`, `K1_BACK`, `K1_FRONT`, `K2_BACK`, `K3_BACK` и построитель `build_product_plan(root, stage)`. Построитель подключён в `build_plan` и зарегистрирован в CLI аргументах `--stage`. Сохранены все существующие этапы (`visual`, `free`, `paid`, `p0`).
- **V05–V06 (Policy guards & verification):**
  - Проверено и зафиксировано: отсутствующий обязательный suite-файл блокирует этап в `validate_plan` до запуска дочерних процессов.
  - Нулевая коллекция тестов (`# tests 0`, `tests=0`, `expected=0`) и наличие skipped тестов (`# skipped > 0`) блокируют этап с `GateError` в `assert_report`.
  - Ошибка дочернего процесса (`returncode != 0`) блокирует этап в `run_step`.
  - Каждый тестовый сьют запускается изолированно (`--suite` для бэкенда, отдельный файл для tap).
  - Никаких пустых тестов ради PASS не создавалось.
- **Результаты тестов policy и регрессии бэкенда:**
  - `python -m unittest tests.backend.test_product_gate_policy` -> 7 tests, 7 pass (exit 0).
  - `python -m unittest tests.backend.test_verify_script` -> 7 tests, 7 pass (exit 0).
  - `python scripts/run_backend_tests.py` -> 74 tests, 74 pass, 0 fail, 0 skipped (exit 0).
- **SHA-256 файлов пакетов I05/V01–V06:**
  - `be3d2e74ed61a388e7ec64ef7dde17414a06e085430fc772f5b777e93a93d5aa` `scripts/verification.py`
  - `0f7813d385be9d70ee8411271f64ee5c8cd1204fcdf5586f3e3e6c4a81745657` `tests/backend/test_product_gate_policy.py`



---

## S01. Старт рабочего пилота: фиксация baseline и ролей
- **Время выполнения:** 2026-10-31 04:52 МСК
- **Интегратор и единственный writer:** Gemini 3.8 в Antigravity
- **Git Branch:** `design/argon-ui-import`
- **Git HEAD Baseline:** `5f39a90f3eb59295869e389acc2a9add4b6e0ad0`
- **Исходное состояние Git:** чистый baseline (за исключением `current_tunnel_url.txt` от существующего демона и документации handoff).
- **Спецификация:** `docs/handoff/2026-10-31-gemini-deliver-working-pilot.md`.
- **Зафиксированы границы:** рубежи L0 -> L1 -> L2 выполняются автономно без остановки. Внешние действия T1/T2 выносятся в единый approval packet.


---

## S02. Guard изоляции тестового ввода-вывода и тестовые пути
- **Время выполнения:** 2026-10-31 04:53 МСК
- **Созданы модули:** `tests/helpers/pilot_io_guard.py`, `tests/backend/test_pilot_harness.py`.
- **Модифицирован:** `scripts/run_backend_tests.py` (автоматическое создание изолированного `KETO_TEST_ROOT` в Hermes scratch, выставление одинаковых TMPDIR/TMP/TEMP и tempfile.tempdir, активация `install_pilot_io_guard`).
- **Команда проверки:**
  `& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_pilot_harness`
- **Результат:** 6 tests, 6 pass, 0 fail, 0 skipped (exit 0).
- **Подтверждено:** блокировка несанкционированного чтения `.env`, `bot_data.json`, SQLite-баз вне тестового дерева и внешней сети.


---

## A01–A05. Рубеж L0 SECURITY: Устранение обходов авторизации и хеширование сессий
- **Время выполнения:** 2026-10-31 04:57 МСК
- **A01 (RED):** Написан `tests/backend/test_pilot_auth_regressions.py` на основе спецификации раздела 12. Зафиксирован ожидаемый RED (45 failures, 4 errors) на обходах fallback к guest, mock/test initData без подписи и подмене ID.
- **A02–A04 (GREEN):**
  - В `bot/server.py` в функции `extract_authenticated_user_id` удалены fallback на query/header user_id и fallback на гостевой `1000`. Любой запрос к защищённым маршрутам без валидного Bearer токена возвращает строго HTTP 401. При несовпадении query `user_id` или header `X-User-Id` с verified session ID возвращается HTTP 403 Forbidden.
  - В `bot/server.py` в эндпоинтах `/api/session` и `/api/auth/validate` удалены все ветки mock/test bypass. При отсутствии токена бота возвращается 503, при пустой/неподписанной/недействительной initData — 401.
- **A05 (Hash-only):**
  - В `bot/app_db.py` сессии сохраняются исключительно в виде SHA-256 хеша (`_hash_token`). Сырой токен возвращается клиенту один раз при создании сессии и никогда не сохраняется в SQLite, не попадает в export и логи.
  - В `tests/backend/test_app_db.py` добавлен тест `test_session_token_stored_as_hash_only`.
- **Команда проверки:**
  `& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_pilot_auth_regressions tests.backend.test_auth tests.backend.test_session_api tests.backend.test_user_api tests.backend.test_app_db`
- **Результат:** 24 tests, 24 pass, 0 fail, 0 skipped (exit 0).
- **Статус рубежа:** L0 SECURITY = PASS.


---

## C01–C07. Wire v1 контракт, идемпотентная схема SQLite и персистентность (CAS)
- **Время выполнения:** 2026-10-31 05:03 МСК
- **C01 (Контракт v1):** Создан `src/api/pilotTypes.ts` и зеркальный `bot/pilot_models.py` со строгой валидацией Pydantic (`extra='forbid'`, strict integer revisions, ISO calendar date regex, валидация соответствия `selected_date` дням меню). Добавлены реэкспорты в `bot/app_models.py`. В `tests/backend/test_app_models.py` добавлены проверки валидации моделей (8/8 pass). `npm run typecheck` завершился с exit 0.
- **C02 (Идемпотентная схема):** В `bot/app_db.py` добавлены колонки `user_profiles.settings_json`, `user_states.payload_json`, `user_states.revision`, `shopping_states.revision`. Реализован мигратор `_migrate_schema_if_needed`, проверяющий метаданные таблицы через `PRAGMA table_info`.
- **C03–C06 (Roundtrip, CAS, Shopping):** В `bot/app_db.py` и `bot/server.py` реализованы `get_pilot_user`, `save_pilot_user`, `get_pilot_shopping`, `save_pilot_shopping`. Атомарная проверка `expected_revision` в транзакции: при расхождении выбрасывается `StaleRevisionError` (HTTP 409 Conflict), при успехе ревизия инкрементируется. Написан `tests/backend/test_pilot_roundtrip.py` (deep equal snapshot меню, отсутствие `dayIndex` в персистентном меню, валидация CAS).
- **C07 (Data rights & Backup):** Подтверждены `test_data_rights.py` и `test_backup_restore.py` с новыми полями (каскадное удаление, экспорт настроек и состояния).
- **Команда проверки:**
  `& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_app_models tests.backend.test_app_db tests.backend.test_user_api tests.backend.test_pilot_roundtrip tests.backend.test_data_rights tests.backend.test_backup_restore`
- **Результат:** 22 tests, 22 pass, 0 fail, 0 skipped (exit 0).


---

## R01–R03. Единый источник каталога, статический экспортер и guard времени приготовления
- **Время выполнения:** 2026-10-31 05:11 МСК
- **R01 (Exporter & Fixtures):**
  - Созданы `docs/content/catalog-release-checklist.md`, `tests/fixtures/pilot/manifest.json`, `tests/fixtures/pilot/catalog.json`.
  - В `src/data/releasedRecipeIds.ts` добавлены `RELEASED_RECIPE_APPROVALS` и пустой `RELEASED_RECIPE_IDS` (fail-closed по умолчанию).
  - Реализован `scripts/export-release-catalog.mjs` (сборка `dist/released-catalog.json` по схеме `PilotCatalogV1`, проверка дубликатов, missing ID, устаревших SHA-256 хешей карточек).
  - Написан `tests/frontend/release-catalog-export.test.cjs` (6/6 pass).
- **R02 (Инъекция провайдера каталога):**
  - `bot/catalog.py` полностью очищен от обращений к `bot_data.json` и переведён на `CatalogService` с чтением статического `dist/released-catalog.json` или инжектируемого `catalog_provider`.
  - В `bot/server.py` добавлена поддержка `catalog_provider` в `create_app` и эндпоинты `/api/catalog` и `/api/catalog/{recipe_id}`.
  - Обновлены `test_catalog_api.py` и `test_release_boundaries.py` на использование синтетического фикстура без чтения runtime файлов.
  - Полный запуск discovery бэкенда (`scripts/run_backend_tests.py`): 133/133 pass, 0 violations.
- **R03 (Ограничения питания и time guard):**
  - В `src/adapters/pilotState.ts` реализован mapping `PilotPreferencesV1` в канонический `UserProfile` (`RESTRICTION_MAP`) и предикат совместимости меню `isMenuCompatibleWithProfile`.
  - В `src/domain/eligibility.ts:isRecipeAllowed` добавлен строгий time guard на проверку `cookTime`: рецепт допускается только если `recipe.time <= profile.cookTime`.
  - Написан `tests/frontend/pilot-preferences.test.cjs` (зафиксирован RED, затем GREEN, 7/7 pass).
- **Команда проверки:**
  `node --test --test-reporter=tap tests/frontend/catalog-build-safety.test.cjs tests/frontend/menu-controller.test.cjs tests/frontend/food-view-adapter.test.cjs tests/frontend/release-catalog-export.test.cjs tests/frontend/pilot-preferences.test.cjs`
- **Результат:** 32 tests, 32 pass, 0 fail, 0 skipped (exit 0).

---

## U01–U09. Рубеж L1 CONNECTED UI: Связка интерфейса Food-First с API и персистентностью
- **Время выполнения:** 2026-10-31 05:25–05:35 МСК
- **U01 (Typed API Client):**
  - Реализован `src/api/ketoClient.ts` (Bearer токен в памяти, строгая типизация ответов, перехват 401 и 409 Conflict, запрет fallback к mock при боевом режиме).
  - Написан `tests/frontend/pilot-client.test.cjs` (4/4 pass).
- **U02 (State Adapter & Save Queue):**
  - В `src/adapters/pilotState.ts` реализована очередь сохранения `SerializedSaveQueue` с предотвращением гонок запросов, кеш пользователя `writeUserCache` / `readUserCache` с изоляцией по `userId`.
  - Написан `tests/frontend/pilot-state.test.cjs` (5/5 pass).
- **U03–U06 (PilotApp Orchestrator):**
  - Создан `src/PilotApp.tsx`: единый оркестратор жизненного цикла (bootstrap, валидация сессии, форма онбординга с 18+ подтверждением, выбор подхода, 6 ограничений, лимит времени, приёмы пищи).
  - Генерация плана через канонический `generateInitialWeek` с сохранением на сервер.
  - Рефакторинг `src/ui/food-first/FoodFirstApp.tsx` в контролируемый презентационный компонент без неявного локального `loadStore`.
  - В `src/main.tsx` точка входа переключена на `<PilotApp />`.
  - В `src/App.tsx` return переключен на `<PilotApp />` с сохранением типов.
- **U07–U09 (Shopping & Import Boundaries):**
  - Обновлены `src/ui/food-first/shoppingFromMenu.ts`, `Shopping.tsx` и `state.ts` для поддержки контракта `PilotShoppingItemV1`, умной агрегации и добавления пользовательских позиций.
  - Тест границ импорта `tests/frontend/food-import-boundary.test.cjs`: 3/3 pass (`main.tsx` и `PilotApp.tsx` не используют legacy `loadStore` и `useStore`).
- **Результат:** 27 tests / 174 frontend unit assertions PASS (exit 0).
- **Статус рубежа:** L1 CONNECTED UI = PASS.

---

## H01. Личная поддержка Ольге и честный статус тикетов
- **Время выполнения:** 2026-10-31 05:36 МСК
- **Проверено:**
  - В `src/pages/PrivateSupportPage.tsx` и `src/ui/food-first/FoodFirstApp.tsx` подтверждён прямой маршрут личной поддержки `1084557944` с бот-ссылкой `https://t.me/keto_balance_userbot?start=question`.
  - Интеграционные тесты `tests/backend/test_support.py` (4/4 pass) и `tests/backend/test_support_integration.py` (6/6 pass).
  - **Честный статус:** Форма фиксирует сохранение тикета в БД бэкенда (`ticket_saved`), но явно сообщает об отсутствии автоматической доставки в Telegram до подтверждения бота.

---

## V01–V03. Рубеж L2 RELEASE PACKAGE: Изолированная сборка, тестовый сервер и E2E тесты
- **Время выполнения:** 2026-10-31 05:40–05:46 МСК
- **V01 (Изолированная сборка):**
  - Реализован `scripts/build-isolated.mjs` (сборка во временной директории Hermes scratch, валидация каталога, tsc, vite build, export каталога, stamp release).
  - Сгенерирован `build-receipt.json` со слепками:
    - Frontend Build ID: `b18495425d773345`
    - Backend Fingerprint: `5b58d3938f4989a9`
    - Catalog Hash: `face03d34bf329b2`
    - Git SHA: `5f39a90f3eb59295869e389acc2a9add4b6e0ad0` (DIRTY)
- **V02 (Тестовый сервер):**
  - Реализован `scripts/pilot_test_server.py` (запуск на порту 18080 с чтением изолированного dist и временной SQLite БД). Порты 8000, 4387, 8090 не затрагиваются.
- **V03 (Playwright E2E тесты):**
  - Реализована фикстура `tests/e2e/pilot.fixture.ts` с защитой Telegram SDK mock от перезаписи.
  - `tests/e2e/food-flow.spec.ts` (E1: Онбординг 18+, генерация 3 дней, навигация, замена рецепта, таймер, покупки): **PASS (2.8s)**.
  - `tests/e2e/support.spec.ts` (E3: Поддержка, честный статус, возврат в меню): **PASS (1.3s)**.
  - `tests/e2e/persistence.spec.ts` (E2: Серверное сохранение и восстановление в свежем BrowserContext): **PASS (5.4s)**.
- **Сквозная проверка гейта:**
  - Команда: `& ".venv-p0/Scripts/python.exe" -B scripts/verification.py --stage k2-pilot`
  - Результат: **`[TECHNICAL STAGE PASSED] k2-pilot; external/business approvals remain separate`** (Exit code 0).
  - 133/133 backend tests PASS, 174/174 frontend unit tests PASS, 3/3 Playwright E2E specs PASS.
- **Статус рубежа:** L2 RELEASE PACKAGE = PASS.

---

## V04. Операционный пакет и документация релиза
- **Время выполнения:** 2026-10-31 05:47 МСК
- **Созданы артефакты:**
  - `docs/release/artifact-manifest.json` — машинный манифест со всеми фингерпринтами и маршрутами.
  - `docs/release/pilot-runbook.md` — инструкции по локальному запуску на 18080, health check и откату.
  - `docs/release/pilot-smoke.md` — детальный чек-лист сквозного 4-экранного сценария для ручной и автоматической приёмки.
  - `docs/release/pilot-approval-request.md` — единый структурированный запрос Ольге для перехода к T1/T2.
  - `docs/release/evidence/k2-pilot-receipt.json` — машинный лог результатов тестирования.
- **Состояние Git diff:** `git diff --check` выполнен, 0 предупреждений и ошибок.

---

## R1–R7. Закрытие замечаний независимого аудита и повторная сквозная верификация
- **Время выполнения:** 2026-10-31 15:10 МСК
- **R1 (Изоляция сборки и Guard):**
  - В `scripts/build-isolated.mjs` реализовано фильтрованное копирование `bot/` (только `.py`, исключены все `.db`, `.sqlite`, `.env*`, `bot_data.json`), дочерние процессы изолированы через `getCleanEnv()`, сохранён `source-manifest.json`.
  - В `tests/helpers/pilot_io_guard.py` закрыт обход вариантов `.env*` вне test root и заблокированы порты 8000, 4387, 8090, 10808, 10809.
  - В `scripts/run_backend_tests.py` ошибка установки guard стала немедленным фатальным выходом с кодом 1.
- **R2 (Атомарный CAS и схемы):**
  - В `bot/app_db.py` операции `save_pilot_user` и `save_pilot_shopping` переведены на транзакции `BEGIN IMMEDIATE` с CAS-проверкой `expected_revision`.
  - В `bot/pilot_models.py` и `src/api/pilotTypes.ts` поля `expected_revision`, `profile`, `state`, `items` стали строго обязательными.
  - В `save_pilot_user` явный `profile: null` атомарно удаляет запись из `user_profiles`.
- **R3 (Единый предикат допуска):**
  - В `src/ui/food-first/state.ts` в `filterRecipesBySettings` дублирующий demo-фильтр заменён на канонический `isRecipeAllowed`, а `prepTimeMax = 0` поддержан как отсутствие лимита времени.
  - В `bot/catalog.py` и `CatalogService` зафиксирована изоляция тестового каталога стадией `app_stage`.
  - В `bot/server.py` добавлена валидация рецептов сохраняемого меню против допущенного каталога `catalog_service.get_released_recipes()`.
  - Запрос с режимом `explore` отклоняется от генерации персонального кето-плана.
- **R4 (Выход порций и галочки покупок):**
  - В `src/ui/food-first/recipesAdapter.ts` сохранён `Recipe.serv` в `portionsVariants` и `yieldNote`.
  - В `src/ui/food-first/shoppingFromMenu.ts` при изменении количества ингредиента чекбоксы `alreadyHave` и `checkedInStore` сбрасываются в `false`, а ключ группировки учитывает базовую единицу измерения.
- **R5 (Порядок сохранения):**
  - В `src/PilotApp.tsx` `handleRefreshShopping` ожидает завершения сохранения списка покупок перед сбросом флага `shopping_stale`.
  - В `src/ui/food-first/FoodFirstApp.tsx` ошибки синхронизации имеют приоритет над плашками предпросмотра.
- **R6 (Опции меню и слоты):**
  - В `src/ui/food-first/state.ts` при `mealsPerDay === 4` отображается 4-й слот `snack` («Перекус»).
  - В `src/ui/food-first/Menu.tsx` подключена кнопка «Пересобрать» (`onRebuildMenu`).
  - При повторном открытии настроек форма загружает актуальные данные активного профиля.
- **R7 (Честные evidence, рекурсивный хеш, локальный сервер):**
  - В `scripts/export-release-catalog.mjs` реализована рекурсивная каноническая сериализация `canonicalize` в `computeRecipeHash`.
  - В `scripts/pilot_test_server.py` добавлено автообнаружение dist и catalog из `scratch/latest-build-receipt.json` для бесконфликтного запуска `pilot_test_server.py --port 18080`.
  - В `docs/content/catalog-release-checklist.md` неподтверждённые авторство, лицензии и изображения для k1–k5 помечены `[УТОЧНИТЬ]`. Тестовый сервер с синтетическим ключом наружу не выставляется.
- **Итоговые машинные показатели:**
  - Backend full suite (`run_backend_tests.py`): **138 tests, 138 pass, 0 fail, 0 errors** (14.3s).
  - Frontend native suite (`node --test tests/frontend/*.test.cjs`): **180 tests, 180 pass, 0 fail** (8.9s).
  - TypeScript check (`npm run typecheck`): **exit 0, 0 errors**.
  - Isolated build (`scripts/build-isolated.mjs`): **Build ID `ab8b527aa26fba7f`, Backend Fingerprint `56991253d8ffe96a`, Catalog Hash `face03d34bf329b2`**.
  - Canonical verification gate (`scripts/verification.py --stage k2-pilot`): **`[TECHNICAL STAGE PASSED] k2-pilot` (exit 0)**.
  - Playwright E2E specs: `food-flow` (5.1s), `support` (2.3s), `persistence` (5.3s) — **3/3 PASS**.
  - Боевые порты (8000, 4387, 8090, 10808, 10809) не затрагивались.

---

## F1–F4. Закрытие замечаний повторной проверки recheck (31 октября 2026)
- **Время выполнения:** 2026-10-31 17:15 МСК
- **F1 (Единый допуск и обработка отказов каталога):**
  - В `src/adapters/pilotState.ts` функция `isMenuCompatibleWithProfile` расширена проверкой режима питания (`profile.mode === recipe.mode`), принадлежности к допущенному пулу (`releasedIds` / `previewPool`) и канонических ограничений (`isRecipeAllowed`).
  - В `src/PilotApp.tsx` обратный вызов `handleReplaceRecipe` использует `controller.createUserReplacementCandidates` для проверки режима, допущенного пула, ограничений и исключения дубликатов блюд в пределах дня.
  - В `src/ui/food-first/Menu.tsx` в диалоге замены кандидаты, уже присутствующие в других приёмах пищи текущего дня, блокируются с честным индикатором «Уже в меню на сегодня».
  - В `src/ui/food-first/FoodFirstApp.tsx` валидатор `isRecipeEligible` проверяет допуск и режим при переходе по прямому URL-хешу (`#recipe/:id`). При несоответствии отображается честная плашка `[data-testid="recipe-unavailable-notice"]`.
  - В `src/PilotApp.tsx` вызовы `createUserMenu` обёрнуты в `try / catch` при сабмите настроек, пересборке и первичной инициализации. При недостаточном/пустом каталоге на форме настроек отображается понятная ошибка `[data-testid="settings-form-error"]` без `unhandled rejection`.
  - При отсутствии меню сохраняется выбранная пользователем длительность `planDays` (1, 3 или 7 дней).
  - В `bot/server.py` эндпоинт `GET /api/user` выставляет флаг `shopping_stale = True`, если меню содержит рецепты, отсутствующие в текущем допущенном каталоге.
  - В `src/ui/food-first/recipesAdapter.ts` непроверенное значение `serv` честно отображается как `portions: 0` и `yieldNote: '[УТОЧНИТЬ]'`.
- **F2 (Составные сохранения и устойчивый conflict/error):**
  - Введён `stickyErrorRef`: статус ошибки (`conflict` при 409 или `error`) сохраняется и не перезаписывается последующими успешными сохранениями других ресурсов.
  - Операции `handleSubmitSettings`, `handleChangeBatches` и `handleRefreshShopping` объединены в строгие последовательности в `saveQueue`: сначала сохраняется список покупок (`putShopping`), затем состояние пользователя (`putUser`) с `shopping_stale: false`. Локальный флаг `shopping_stale` не сбрасывается до подтверждения сервером.
- **F3 (Проверка версии и строгая изоляция):**
  - В `bot/server.py` алгоритм `_compute_backend_fingerprint` приведён в полное побайтовое соответствие со `scripts/stamp-release.mjs` (сортировка файлов `bot/*.py`, хеширование имени файла и содержимого).
  - В `tests/helpers/pilot_io_guard.py` закрыто исключение для `.env.example`, все `.env*` файлы вне test root запрещены. Тест изоляции переменных перенесён на фикстуру `tests/fixtures/pilot/synthetic_env_documentation.txt`. Сетевой guard ограничивает loopback только локально привязанными сокетами stdlib `socketpair`.
- **F4 (Запускаемый показ и лаунчеры):**
  - Реализован `scripts/run_staging.py`:
    - Проверка `owner_allowlist = frozenset([1084557944])` после валидации подписи Telegram HMAC и до записи в БД (возврат 403 не-владельцам).
    - Принудительно выключены платежи (`PAYMENTS_ENABLED=0`) и демо-авторизация (`allow_demo_auth=False`).
    - Автоматический таймер завершения процесса (1 час / 3600 с).
    - Управление PID-файлом (`scratch/staging.pid`) и изоляция БД (`scratch/staging_pilot.db`).
  - Реализован `scripts/run_local_preview.py`:
    - Биндинг строго на `127.0.0.1:18080`.
    - Поддержка `/api/demo-session?demo_user=1084557944` в stage `test` с `allow_demo_auth=True`.
    - Браузерный запуск в 1 клик по URL: `http://127.0.0.1:18080/?demo_user=1084557944`.
    - Автоматический таймер завершения (1 час / 3600 с), управление PID-файлом `scratch/preview.pid`.
  - Добавлены тесты `tests/backend/test_staging_and_demo.py` (3/3 pass).
- **Итоговые машинные показатели:**
  - Backend full suite (`run_backend_tests.py`): **143 tests, 143 pass, 0 fail, 0 errors** (11.5s).
  - Frontend native suite (`node --test tests/frontend/*.test.cjs`): **184 tests, 184 pass, 0 fail** (10.6s).
  - TypeScript check (`tsc --noEmit`): **exit 0, 0 errors**.
  - Isolated build (`scripts/build-isolated.mjs`): **Build ID `e7d04da9d43a7f50`, Catalog Hash `face03d34bf329b2`, Backend Fingerprint `c94db25d7ba234c0`**.
  - Canonical verification gate (`scripts/verification.py --stage k2-pilot`): **`[TECHNICAL STAGE PASSED] k2-pilot` (exit 0)**.
  - Playwright E2E specs: `food-flow` (20.9s), `support` (38.3s), `persistence` (39.0s) — **3/3 PASS**.
  - Боевые порты (8000, 4387, 8090, 10808, 10809) не затрагивались.

---

## F1–F4 Independent Review Recheck: финальная валидация и подтверждение
- **Время выполнения:** 2026-10-31 18:58 МСК
- **Интегратор:** Gemini 3.8 в Antigravity
- **Git Branch:** `design/argon-ui-import`
- **Закрытие замечаний аудита `docs/audit/2026-10-31-f1-f4-independent-review.md`:**
  - **Лаунчеры (`scripts/run_staging.py`, `scripts/run_local_preview.py`):**
    - Устранён несуществующий аргумент `payments_enabled` в вызове `AppSettings` (настройка `PAYMENTS_ENABLED=0` изолирована через переменные окружения и `bot.config`).
    - Добавлено автоматическое обнаружение и подключение 5-candidate демо-каталога (`test_catalog_path` из `latest-build-receipt.json` или `tests/fixtures/pilot/catalog.json`) через `catalog_provider`, что обеспечивает отдачу пилотных блюд в `/api/catalog`.
    - В `run_local_preview.py` внедрена строгая проверка `is_loopback_host` (отклоняет `0.0.0.0` и внешние адреса).
    - В `run_staging.py` добавлена поддержка `--token-file` для безопасной передачи токена Telegram бота без утечки в таблицу процессов ОС.
    - Ограничено время жизни (от 1 до 86400 с) и гарантирована изоляция временных БД в каталоге `scratch`.
  - **Бэкенд и авторизация (`bot/server.py`):**
    - Проверка `owner_allowlist` вынесена в `extract_authenticated_user_id`, исключая доступ не-владельцев по остаточным Bearer-токенам в переиспользуемых тестовых базах.
    - Создание сессий использует значение `active_settings.session_max_lifetime_seconds`.
  - **UI и согласованность состояний (`src/PilotApp.tsx`, `src/ui/food-first/Today.tsx`, `src/ui/food-first/FoodFirstApp.tsx`):**
    - В `FoodFirstApp.tsx` добавлен баннер уведомления при `state.shopping_stale = true` («Список покупок не согласован с меню · требуется обновление»).
    - В `Today.tsx` реализована карточка отказа `food-today-incompatible` с кнопкой перехода в настройки при несовместимости сохранённого ритма с профилем.
    - В `PilotApp.tsx` предзаполняются `draft*` настройки из `currentProfile.settings` при отказе пересборки меню, предотвращая потерю параметров пользователя.
    - В `PilotApp.tsx` при завершении `handleRefreshShopping` текущее состояние объединяется с `stateRef.current.menu`, защищая оптимистичные замены блюд от отката при задержке ответа сети.
  - **Предикаты и доменная модель (`src/adapters/pilotState.ts`):**
    - `isMenuCompatibleWithProfile` отклоняет меню с дубликатами ID блюд в рамках одного дня, а также при пустом эффективном пуле допущенных рецептов.
    - `approachToMode` генерирует ошибку для неподдерживаемого режима `explore` и некорректных подходов при bootstrap/rebuild.
  - **Защита ввода-вывода (`tests/helpers/pilot_io_guard.py`):**
    - Регистронезависимое сопоставление (`.lower()`) для `.env*` и запрещённых расширений на Windows.
    - Ограничение всех файловых SQLite соединений каталогом `_ALLOWED_ROOT`.
    - Метод `_is_stdlib_socketpair()` валидирует конкретные фреймы стека вызовов для идентификации системных `socketpair` / `_make_self_pipe`.
- **Итоговые машинные показатели:**
  - Backend full suite (`run_backend_tests.py`): **152 tests, 152 pass, 0 fail, 0 errors, 0 skipped, 0 IO violations** (11.8s).
  - Frontend native suite (`node --test tests/frontend/*.test.cjs`): **186 tests, 186 pass, 0 fail** (8.1s).
  - TypeScript check (`tsc --noEmit`): **exit 0, 0 errors**.
  - Isolated build (`scripts/build-isolated.mjs`): **Build ID `c145c16cbf4fdc16`, Catalog Hash `face03d34bf329b2`, Backend Fingerprint `6014c9aae7939a3b`**.
  - Canonical verification gate (`scripts/verification.py --stage k2-pilot`): **`[TECHNICAL STAGE PASSED] k2-pilot` (exit 0)**.
  - Playwright E2E specs: `food-flow` (20.9s), `support` (17.1s), `persistence` (19.6s) — **3/3 PASS**.
  - Боевые порты (8000, 4387, 8090, 10808, 10809) не затрагивались.

---

## DeepCoder Review Recheck (R1–R3): устранение регрессий параллельных сессий и согласования
- **Время выполнения:** 2026-10-31 20:30 МСК
- **Интегратор:** Gemini 3.8 в Antigravity
- **Git Branch:** `design/argon-ui-import`
- **Закрытие замечаний `docs/audit/2026-10-31-deepcoder-recheck.md`:**
  - **R1 / F2 (Durable Stale Protection):**
    - В `bot/catalog.py` реализованы функции `parse_amount_value(raw: str) -> Optional[float]` и `is_shopping_consistent_with_menu(...)`, проверяющие соответствие ID рецептов, названий и масштабированных количеств ингредиентов структуре меню.
    - В `bot/app_db.py` внедрён `_compute_shopping_content_hash(items)` (без учёта чекбоксов `alreadyHave` и `checkedInStore`). `save_pilot_shopping` отмечает `is_structural_change = True` только при реальном изменении состава позиций, исключая выставление `shopping_stale=True` при переключении галочек в магазине.
    - В `bot/app_db.py` (`save_pilot_user`) предотвращено стирание флага `shopping_stale=True` устаревшим снимком пользователя (`curr_db_is_stale`), если список покупок остаётся несогласованным с меню.
    - В `bot/server.py` (`GET /api/user` и `PUT /api/user`) валидация консистентности оценивает меню против списка покупок, гарантируя удержание флага рассинхронизации.
  - **R2 / F2 (In-Flight Shopping Edits):**
    - В `src/PilotApp.tsx` (`handleRefreshShopping` и `enqueueShoppingStateSave`) результат объединяется со `shoppingItemsRef.current`. Новые пользовательские позиции и изменённые чекбоксы, добавленные во время сетевого сохранения, не затираются устаревшим ответом сервера.
  - **R3 / F1 (Bootstrap Repair CAS Revision):**
    - В `src/PilotApp.tsx` при начальной загрузке ревизии `userRevisionRef.current` и `shoppingRevisionRef.current` синхронно инициализируются из ответа сервера до вызова автовосстановления несовместимого меню, исключая отправку `expected_revision: 0` и конфликт HTTP 409 при первичном входе.
  - **Операционные и защитные границы:**
    - В `tests/helpers/pilot_io_guard.py` переход на структурированный парсинг параметров SQLite URI (`urllib.parse.urlsplit` и `parse_qs`) для безопасной изоляции `mode=memory`.
    - В `docs/release/pilot-approval-request.md` исключён прямой argv-токен в пользу `--token-file <PATH_TO_TOKEN_FILE>`.
    - В `tests/backend/test_staging_and_demo.py` добавлены тесты:
      - `test_two_session_interleaving_preserves_durable_stale` (6-шаговый сценарий интерливинга сессий).
      - `test_checkbox_only_shopping_update_does_not_mark_stale` (проверка неизменности признака stale при клике по чекбоксам).
- **Итоговые машинные показатели:**
  - Backend full suite (`run_backend_tests.py`): **154 tests, 154 pass, 0 fail, 0 errors, 0 skipped, 0 IO violations** (11.0s).
  - Frontend native suite (`node --test tests/frontend/*.test.cjs`): **186 tests, 186 pass, 0 fail** (7.7s).
  - TypeScript check (`tsc --noEmit`): **exit 0, 0 errors**.
  - Isolated build (`scripts/build-isolated.mjs`): **Build ID `661a8799ae54a838`, Catalog Hash `face03d34bf329b2`, Backend Fingerprint `69a1f4640380e05a`**.
  - Canonical verification gate (`scripts/verification.py --stage k2-pilot`): **`[TECHNICAL STAGE PASSED] k2-pilot` (exit 0)**.
  - Playwright E2E specs: `food-flow` (19.7s), `support` (17.2s), `persistence` (32.6s) — **3/3 PASS**.
  - Боевые порты (8000, 4387, 8090, 10808, 10809) не затрагивались.

---

## Targeted R1–R3 Recheck: окончательное закрытие согласованности меню и защиты отметок
- **Время выполнения:** 2026-10-31 21:40 МСК
- **Интегратор:** Gemini 3.8 в Antigravity
- **Git Branch:** `design/argon-ui-import`
- **Закрытие замечаний `docs/audit/2026-10-31-deepcoder-recheck.md`:**
  - **R1: Полное приведение валидатора согласованности к генератору списка (`bot/catalog.py`):**
    - Учтены все появления рецептов в меню (последовательность дней и слотов, а не плоский `set`). Повторяющиеся блюда в разные дни корректно суммируют ингредиенты.
    - Внедрена нормализация единиц измерения (`normalize_unit` для г/кг, мл/л, шт., ст. л., банок, стейков, ножек) и парсинг величин (`parse_amount`), предотвращающий ложное несовпадение эквивалентных величин (1000 г = 1 кг) и отвергающий несопоставимые (1000 г != 1000 кг).
    - Формирование групп ингредиентов по ключу `${name}:${unit_type}:${base_unit}` идентично `src/ui/food-first/shoppingFromMenu.ts`.
    - Исключены пользовательские кастомные позиции (`shop-custom-`) из проверки обязательного состава рецептов.
    - Введена проверка полноты списка: удаление или отсутствие любого ингредиента рецепта детектируется (`len(canonical_items) == len(expected_groups)` и покрытие всех групп), исключая скрытую рассинхронизацию.
    - Добавлен комплексный регрессионный тест `test_shopping_consistency_seven_scenarios` в `tests/backend/test_staging_and_demo.py` на базе фикстуры `tests/fixtures/pilot/consistency-inputs.json`. Все 7 позитивных и негативных сценариев успешно проходят как в прямом предикате, так и в сквозном цикле FastAPI TestClient -> SQLite -> reload.
  - **R2: Защита свежих отметок существующих продуктов от отката (`src/PilotApp.tsx`):**
    - В `enqueueShoppingStateSave` при завершении предыдущего сетевого запроса приоритет отдаётся актуальному состоянию `shoppingItemsRef.current`. Более новые клики по чекбоксам (`checkedInStore`, `alreadyHave`) и кастомные продукты не откатываются старыми ответами.
    - В `handleRefreshShopping` сохраняются пользовательские отметки для всех продуктов, изменённых во время сетевого ожидания.
    - Добавлен unit-тест в `tests/frontend/pilot-state.test.cjs` на полную последовательность `A+ -> B+ -> release A -> A- -> release all` для обоих типов отметок (`checkedInStore`, `alreadyHave`) с сохранением кастомных продуктов.
  - **R3: Проверка сохранения CAS-ревизии:**
    - Подтверждено корректное автовосстановление меню при ненулевой ревизии (`expected_revision=4`) без 409 Conflict и unhandled rejection.
- **Итоговые машинные показатели:**
  - Backend full suite (`run_backend_tests.py`): **155 tests, 155 pass, 0 fail, 0 errors, 0 skipped, 0 IO violations** (11.2s).
  - Frontend native suite (`node --test tests/frontend/*.test.cjs`): **187 tests, 187 pass, 0 fail** (5.1s).
  - TypeScript check (`tsc --noEmit`): **exit 0, 0 errors**.
  - Isolated build (`scripts/build-isolated.mjs`): **Build ID `c9774a016e0173e8`, Catalog Hash `face03d34bf329b2`, Backend Fingerprint `317b35e410187a94`**.
  - Canonical verification gate (`scripts/verification.py --stage k2-pilot`): **`[TECHNICAL STAGE PASSED] k2-pilot` (exit 0)**.
  - Playwright E2E specs: `food-flow` (16.2s), `support` (15.3s), `persistence` (16.2s) — **3/3 PASS**.
  - Боевые порты (8000, 4387, 8090, 10808, 10809) не затрагивались.


