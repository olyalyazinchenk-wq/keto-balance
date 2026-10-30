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

