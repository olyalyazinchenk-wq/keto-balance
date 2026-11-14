# Приёмка рубежей (Acceptance Matrix) — Gemini Working Pilot

| Рубеж | Статус | Доказательство | Ограничения и остаточные блокеры | Следующий шаг |
|---|---|---|---|---|
| **K0** (Локальный checkpoint) | **PASS** | TDD `selectedDay`: 5/5 pass; донорский suite: 28/28 pass, TypeScript exit 0. Выбор дня сохраняется. | Локальный прототип. | Завершён. |
| **I01–I05** (Изоляция сборки и .env) | **PASS** | `catalog-build-safety.test.cjs`: 7/7 pass; `test_strict_import_safety_in_fresh_process`: subprocess аудит исключает чтение `.env`, SQLite connection и network sockets; изоляция Vite `envDir`. | Локальная изоляция. | Завершён. |
| **L0 SECURITY** (Безопасность аутентификации) | **PASS** | 1. `test_pilot_auth_regressions.py` (6/6 pass, 49 assertions): все guest fallback и mock bypass устранены.<br>2. 401 на запросы без Bearer токена, 403 на межпользовательские подмены.<br>3. `test_app_db.py`: токен сессии хранится в SQLite исключительно в виде SHA-256 хеша. | Полностью закрыты уязвимости обхода аутентификации. | Завершён. |
| **L1 CONNECTED UI** (Сквозная связка UI → API → SQLite) | **PASS** | 1. `src/api/ketoClient.ts` + `src/adapters/pilotState.ts` (9/9 unit tests pass).<br>2. `PilotApp.tsx` оркестрирует онбординг (18+), генерацию меню из канонического каталога, замену блюд, рецепт с таймером и умные покупки.<br>3. CAS оптимистическая блокировка (`test_pilot_roundtrip.py`, HTTP 409 Conflict).<br>4. Границы импорта (`food-import-boundary.test.cjs`, 3/3 pass): отказ от неконтролируемого legacy `loadStore`. | Готов локально в тестовом окружении. | Завершён. |
| **L2 RELEASE PACKAGE** (Изолированная сборка и верификация) | **PASS** | 1. `scripts/build-isolated.mjs` выполняет чистую сборку во временной директории scratch без перезаписи боевого `dist/`.<br>2. `scripts/verification.py --stage k2-pilot`: **`[TECHNICAL STAGE PASSED] k2-pilot`** (exit 0).<br>3. 152 backend-теста, 186 frontend unit assertions, 3/3 Playwright E2E теста (`food-flow`, `persistence`, `support`).<br>4. Фингерпринты: Build ID `c145c16cbf4fdc16`, Backend `6014c9aae7939a3b`, Catalog `face03d34bf329b2`. | Технический этап подтверждён на машине. Боевые порты (8000, 4387, 8090, 10808, 10809) не затрагивались. | Подготовка к показу (F4). |
| **F1–F4 INDEPENDENT RECHECK** (Закрытие замечаний аудита 31.10.2026) | **PASS** | 1. F1: автоподключение демо-каталога sidecar (`catalog_provider`), карточка несовместимости `food-today-incompatible` в `Today.tsx`, предзаполнение настроек при отказе пересборки меню, защита in-flight замен в `PilotApp.tsx`, отказ от дубликатов и режима `explore`.<br>2. F2: баннер при `state.shopping_stale`, строгая очередь сохранения `saveQueue` (`putShopping` перед `putUser`), `stickyErrorRef` при 409.<br>3. F3: побайтовое совпадение фингерпринта бэкенда (`6014c9aae7939a3b`), Windows-aware case-folding для `.env*`, запрет файловых SQLite вне scratch, проверка стека `socketpair`.<br>4. F4: лаунчеры `run_staging.py` (с `--token-file`, owner allowlist на уровне Bearer) и `run_local_preview.py` (strict loopback `127.0.0.1`, demo session в 1 клик). | Полностью подтверждено 152 backend + 186 frontend + 3 E2E тестами. | Готов к личной приёмке. |
| **DEEPCODER R1–R3 RECHECK** (Согласованность сессий и защита in-flight данных) | **PASS** | 1. R1: полное приведение валидатора к генератору списка (`bot/catalog.py`), учёт повторяющихся рецептов, нормализация единиц (1000 г = 1 кг, отказ 1000 кг), отсечение `shop-custom-`, детектирование пропавших ингредиентов; все 7 сценариев `consistency-inputs.json` подтверждены в прямом предикате и HTTP->SQLite цикле.<br>2. R2: сохранение актуальных отметок существующих продуктов и кастомных покупок при завершении отложенных запросов (`shoppingItemsRef.current` приоритет), подтверждено тестом `A+ -> B+ -> release A -> A- -> release all`.<br>3. R3: синхронная гидратация ревизий перед bootstrap repair меню исключает 409 Conflict при входе.<br>4. Безопасность: структурированный парсинг SQLite URI в guard, исключение argv-токена бота. | Подтверждено: 155 backend (155/155 pass), 187 frontend (187/187 pass), tsc exit 0, Build ID `c9774a016e0173e8`, 3/3 E2E specs. | Готов к показу. |
| **T1 STAGING & BOT BUTTON** (Внешнее тестовое окружение) | **PENDING OWNER APPROVAL** | Подготовлен операционный пакет `docs/release/pilot-approval-request.md` и руководство `docs/release/pilot-runbook.md`. | Требует явного решения Ольги по тестовому порту 18080, выделенному staging токену бота и тестовой кнопке. Никаких автоматических сообщений в Telegram не отправляется. Тестовый сервер с синтетическим ключом наружу не выставляется. | Ожидание подтверждения владельца. |
| **T2 OWNER ACCEPTANCE** (Приёмка владельцем через Telegram) | **PENDING** | Программа приёмочного тестирования `docs/release/pilot-smoke.md` (4 экрана, персистентность, личная поддержка). | Выполняется Ольгой лично со смартфона после развёртывания T1. | После согласования T1. |
| **K3** (Платный пилот и монетизация) | **OUT OF SCOPE** | Платежи, Stars и монетизация отключены (`tests/backend/test_payments_disabled.py` 3/3 pass). | Не входит в рамки текущего бесплатного технического пилота. Отдельный коммерческий срез после успешного T2. | Будущий этап. |

---

## Закрытие замечаний независимого аудита (R1–R7)

1. **R1 (Изоляция I/O и чистое окружение сборки):**
   - `build-isolated.mjs` выполняет строго allowlisted копирование `.py` и конфигурационных файлов, исключая `.db`, `.sqlite`, `.env*`, `bot_data.json` и `dist/` на любой глубине. Дочерние процессы получают очищенный allowlist переменных ОС.
   - `pilot_io_guard.py` перехватывает все варианты `.env*` вне `allowed_root` и запрещает сокет-соединения к зарезервированным боевым портам (8000, 4387, 8090, 10808, 10809).
   - `run_backend_tests.py` при ошибке установки guard немедленно завершает работу с кодом 1.

2. **R2 (Атомарность CAS и схемы write snapshot):**
   - `app_db.py` выполняет `save_pilot_user` и `save_pilot_shopping` в рамках транзакции `BEGIN IMMEDIATE`, блокируя конкурентные потери обновлений на revision 0 (подтверждено тестом `test_concurrent_cas_prevents_lost_update`).
   - Модели `PilotUserWriteV1` и `PilotShoppingWriteV1` требуют обязательного указания `expected_revision`, `profile`, `state` и `items` (`Field(...)`).
   - Явный `profile: null` в `save_pilot_user` атомарно очищает профиль из таблицы `user_profiles` (`test_explicit_null_profile_clears_profile`).

3. **R3 (Единый предикат допуска и валидация на сервере):**
   - Устранён дублирующий demo-фильтр в `filterRecipesBySettings`: используется канонический `isRecipeAllowed` из `src/domain/eligibility.ts`. Значение `prepTimeMax = 0` корректно обрабатывается как «без ограничений по времени».
   - Сервер `bot/server.py` (`PUT /api/user`) валидирует рецепты сохраняемого меню против списка допущенных `catalog_service.get_released_recipes()`, возвращая HTTP 400 при попытке сохранить недопущенный ID.
   - Запрос на генерацию меню с режимом `explore` отклоняется от запуска персональной генерации.

4. **R4 (Сохранение выхода и сброс галочек при изменении количества):**
   - `toRecipeViewModel` и `FoodFirstApp` сохраняют реальный выход `recipe.serv` (1x = `serv`, 2x = `serv * 2`), не искажая порционность.
   - `rebuildShoppingFromMenu` сбрасывает флаги `alreadyHave` и `checkedInStore` в `false`, если количество товара изменилось (например, 4 шт. → 8 шт.), и сохраняет галочки только при неизменном объёме.
   - Ключ группировки ингредиентов включает базовую единицу измерения во избежание слияния несовместимых единиц.

5. **R5 (Порядок сохранения и приоритет ошибок):**
   - В `PilotApp.tsx` `handleRefreshShopping` ожидает подтверждения `client.putShopping` на сервере и только после этого снимает флаг `shopping_stale` в профиле пользователя.
   - Статусы ошибок синхронизации (`conflict`, `error`, `saving`) в `FoodFirstApp` имеют приоритет над информационными плашками `catalog.test_only`.

6. **R6 (Опции меню, 4-й слот и пересборка):**
   - `resolveDayMenuSlots` при `mealsPerDay === 4` формирует 4 слота, включая `snack` («Перекус»).
   - На экране меню подключена кнопка «Пересобрать» (`onRebuildMenu`), вызывающая перегенерацию на сервере.
   - Поддерживаются сроки меню на 1, 3 и 7 дней; при повторном открытии настроек форма инициализируется актуальными значениями активного профиля.

7. **R7 (Честные evidence, рекурсивное хеширование, локальный сервер):**
   - `computeRecipeHash` в `export-release-catalog.mjs` выполняет рекурсивную каноническую сериализацию всех полей рецепта, включая вложенные замены `subs`.
   - `source-manifest.json` со всеми SHA-256 хешами исходников генерируется и привязывается к `build-receipt.json`.
   - Сервер фиксирует `startup_backend_fingerprint` в момент старта и отдаёт его в `/api/version`.
   - `pilot_test_server.py --port 18080` поддерживает автоматическое обнаружение последнего билда из scratch.
   - Чеклист каталога честно фиксирует 0 релизных рецептов в продакшене и помечает неподтверждённые лицензии и авторство статусом `[УТОЧНИТЬ]`. Тестовый сервер с синтетическим ключом наружу не публикуется.

**Вердикт интегратора (Gemini 3.8):** Все критерии R1–R7, замечания речека F1–F4 и адресная независимая перепроверка DeepCoder R1–R3 закрыты и подтверждены машинными тестами (155 backend, 187 frontend, 3 Playwright E2E). Локальный контур полностью готов к согласованию безопасного показа владельцу.
