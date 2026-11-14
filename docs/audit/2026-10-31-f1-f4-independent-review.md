# Кето Баланс — независимая проверка F1–F4 и конечное задание перед показом

Дата: 31 октября 2026. Проверяемый baseline: `5f39a90f3eb59295869e389acc2a9add4b6e0ad0` + текущие незакоммиченные изменения.

## Короткий вердикт

**Заявление «F1–F4 полностью закрыты, оба показа готовы» не подтверждается.** Реальный прогресс существенный: 143 backend / 184 frontend проходят, typecheck и свежая изолированная сборка совпадают с отчётом. Но оба новых launcher падают до запуска сервера; подключение пяти кандидатов к ним отсутствует; согласованность меню и покупок после частичного сохранения всё ещё нарушается.

Не откатывать исправления, не переделывать дизайн, не повторять интервью и не начинать новую архитектуру. Ни вариант А, ни вариант Б reviewer не запускал и не согласовывал. Пять кандидатов не являются утверждённым production-каталогом.

## Что проверено реальным исполнением

| Проверка | Результат независимого выполнения |
|---|---|
| Native frontend, 25 файлов | TAP summary: 184 tests, 184 pass, fail/skip/cancel/todo=0, exit 0 |
| Полный backend discovery | 143 tests, failures/errors/skipped=0, exit 0 |
| Адресный backend subset | 29 tests: auth regressions, roundtrip, harness, release version, staging/demo; это подмножество 143, не дополнительные 29 |
| TypeScript | `tsc --noEmit --incremental false --pretty false`, exit 0 |
| Свежий isolated build | Полный lifecycle validate → tsc → Vite → export → stamp, exit 0 |
| Идентификаторы | Build `e7d04da9d43a7f50`; backend `c94db25d7ba234c0`; catalog `face03d34bf329b2` — совпали с отчётом |
| Версия сервера | In-process GET `/api/version` совпал со stamped backend fingerprint для того же свежего dist в stages test/staging |
| Источники | 100 src/scripts/bot-файлов текущего дерева совпали по SHA-256 prefixes с manifest новой сборки; mismatch=0 |
| Изоляция snapshot | Запрещённых DB/env/cache/log-файлов в скопированном bot не обнаружено |
| Launcher assembly | Вызваны настоящие `main()` с собственным synthetic dist; только границы init_db/uvicorn.Server подменены. Оба дают TypeError; Server construction/run=0 |
| UI failure cases | Actual fresh built JS/CSS в отдельном Playwright context, все HTTP fulfilled/aborted синтетически; видимый empty-catalog refusal и sticky 409 подтверждены, остатки F1/F2 воспроизведены |
| Partial save, настоящий backend | FastAPI TestClient + собственная новая SQLite, UI-generated payloads: shopping=200, user=409, восстановлены старое меню + новые покупки + stale=false |
| Session policy | Synthetic DB, повторно использованная между test/staging app instances: старый non-owner Bearer допущен; отдельный session lifetime не применяется |

Полный backend выполнялся с внешним reviewer audit hook, который запрещал реальные env/runtime/БД и application network. В проверенные Python `-c` дочерние unit-probes добавлялся такой же hook. В первом полном проходе reviewer allowlist ошибочно не разрешал безопасный synthetic `SystemExit(7)`; после адресного исправления harness весь suite прошёл. Продукт ради тестов не менялся.

**Не повторялись:** `verification.py --stage k2-pilot`, исходные сетевые E2E3, пользовательский preview, Telegram, туннель, доставка сообщений. Adapted UI probes не называются настоящими серверными E2E; backend persistence проверялся отдельно на настоящем коде и собственной synthetic DB. Process timer/teardown запуском не проверялись.

## F4 — сначала исправить реальную команду показа

### F4.1. Оба launcher сейчас падают

**Реально воспроизведено:**

`AppSettings.__init__() got an unexpected keyword argument 'payments_enabled'`

- `scripts/run_local_preview.py:91–101` и `scripts/run_staging.py:97–107` передают отсутствующее поле.
- `bot/app_settings.py:18–31` этого поля не определяет.
- Перед ошибкой уже вызывается `init_db`: preview `:88`, staging `:94`. В probe эта граница подменена, реальная БД не инициализировалась.
- `tests/backend/test_staging_and_demo.py:29–100` проверяет `create_app`, но не эти `main()`; поэтому его 3/3 не доказывают работоспособность launcher.

**Исправить:** согласовать аргументы с настоящим контрактом AppSettings, сохранив выключенные платежи; валидировать конфигурацию до записи БД. Добавить проверку реального entrypoint, а не ещё один тест только `create_app`.

### F4.2. Пять кандидатов не подключены к launcher

После исправления TypeError предложенная команда всё ещё не гарантирует пользовательский путь.

- Оба launcher по умолчанию берут `ROOT/dist`, не pinned dist новой изолированной сборки. Есть `--dist`, но нет `--catalog` и нет внедрения catalog provider.
- Builder сохраняет 5 test-only кандидатов отдельным sidecar: `scripts/build-isolated.mjs:113–120`. В свежем production `released-catalog.json` — 0 recipes / 0 released IDs; это правильно при пустом production allowlist.
- Реальный TestClient с этим dist в test и staging вернул `/api/catalog`: HTTP 200, recipes=0. Пять карточек сами не «активируются» от слова preview.
- `bot/catalog.py:29–30` дополнительно запрещает test-only static catalog вне stage test. Просто скопировать sidecar в staging/dist нельзя считать решением.

**Исправить:** явно связать approved-for-demo sidecar, pinned artifact и собственную per-run DB. Это отдельный ограниченный режим, а не расширение production allowlist и не разрешение на публикацию лабораторного сервера. Нужна проверка ожидаемых build/backend/catalog IDs и наличие именно выбранного каталога. Показ со смартфона остаётся с реальной HMAC-проверкой после согласованной настройки ключа.

### F4.3. Завершить уже обещанную границу preview/staging

- **Loopback:** preview принимает произвольный `--host` (`run_local_preview.py:51,156–159`); `--host 0.0.0.0` не отклоняется. Это несовместимо со «строго локальным demo». Allowlist demo_user не удостоверяет личность: ID публичен. Preview должен fail closed на нелокальном host и не публиковаться наружу.
- **DB:** оба `--db` допускают любой путь; defaults — повторно используемые общие scratch-файлы. Нужен отдельный run root с проверенным DB path, без допуска рабочей БД. Не удалять старые файлы автоматически.
- **Сессии:** owner allowlist проверяется правильно при создании новой HMAC-сессии (`bot/server.py:209–235`), но не при Bearer-доступе (`:122–134,250–258`). На собственной synthetic DB реально подтверждено: ранее выданная non-owner сессия получает 200 в owner-only staging. Не описывать это как новый unsigned auth bypass: условие — действующая старая сессия в повторно использованной DB.
- **Lifetime:** `session_max_lifetime_seconds` объявлен, но выдача сессий использует `auth_max_age_seconds` (`server.py:235,247`). Probe с max_lifetime=1 получил owner-сессию с expiry дольше часа. Process timer и session TTL — разные механизмы.
- **Timer/PID:** код таймера появился, но tests не исполняют launcher expiry/cleanup. Timer запускается до присваивания `server`; неположительный/слишком большой lifetime не валидируется. Общие PID-файлы могут перезаписываться, cleanup не проверяет владение. Достаточно простого собственного process/run handle и проверенного bounded teardown — не нужен новый daemon/watchdog.
- **Ключ:** runbook предлагает реальный токен в argv через `--token`. Не просить токен в чат и не рекомендовать вставлять его в команду/историю. Подготовить доверенный локальный способ конфигурации только для отдельно согласованного запуска; реальные секреты сейчас не читать и не менять.

## F2 — очередь не равна атомарности меню и покупок

### F2.1. Partial save после reload теряет предупреждение

**Реально воспроизведено сначала в fresh-bundle UI, затем на настоящем backend.**

1. Чистая synthetic сессия проходит настоящий UI onboarding и успешно сохраняет согласованную пару меню/покупок на 3 дня.
2. В настройках выбирается 1 день.
3. Новый shopping PUT проходит; user PUT получает 409. В настоящий backend probe другой synthetic клиент заранее увеличивает user revision, чтобы CAS закономерно отклонил устаревшую запись.
4. После GET/reload: профиль/меню остаются на 3 дня, shopping уже от не принятого однодневного плана, `shopping_stale=false`.
5. UI показывает «Тестовый каталог · синтетические данные», без предупреждения о несогласованной паре.

**Source:** `src/PilotApp.tsx:354–405` (settings), `:627–674` (batches), `:171–233` (restore). Внутренние транзакции user/shopping отдельные; порядок двух HTTP-запросов их атомарными не делает.

**Исправить:** обеспечить согласованную серверную пару или надёжный durable stale/incomplete marker и безопасное восстановление при partial failure. После второго PUT=409/transport failure, reload и новой сессии нельзя объявлять покупки актуальными для старого меню. Не делать force overwrite чужой версии и не маскировать ошибку успешной записью другого ресурса.

### F2.2. Обычная network error всё ещё маскируется

**Реально воспроизведено на actual bundle с aborted user PUT:**

- До следующего действия: «Ошибка синхронизации с сервером».
- Добавить synthetic товар: shopping PUT всё равно проходит.
- После его HTTP 200 баннер остаётся «Сохранение изменений на сервере…», хотя предыдущая user-запись не исправлена.

Причина: guards блокируют только sticky `conflict`, затем ставят `saving`; на успехе при sticky `error` не восстанавливают ошибку (`PilotApp.tsx:416–438,453–474,637–670,689–726`).

**Положительное:** прежний 409 уже не скрывается; после него unrelated shopping PUT вообще не отправляется. Это исправление сохранить.

### F2.3. Общая последовательность и захваченные snapshots

**Подтверждено чтением source, отдельно runtime не воспроизводилось:**

- Submit settings по-прежнему делает прямые PUT вне `saveQueue` (`PilotApp.tsx:371–387`).
- Refresh захватывает `state` до очереди, затем по успеху устанавливает старый snapshot (`:679–715`). Если во время pending refresh пользователь меняет меню, refresh может вернуть старый state в UI; queued replacement затем сохранит новый state на сервер, но не вернёт его в UI (`:410–431`).

**Исправить тем же механизмом последовательности:** submit/batches/refresh и соседние изменения не должны обходить очередь или откатывать более новый optimistic state старым snapshot. Добавить controlled interleaving case, без настоящей сети.

## F1 — сохранить исправленные gates, дозакрыть восстановление

Что подтверждено и не требует переделки:

- Empty catalog при submit даёт видимый `settings-form-error`, PUT=0, unhandled rejection=0.
- Replacement callback подключён к controller с mode/restrictions/time/dayIds.
- Picker использует загруженный каталог; detail, включая hash, проверяет допуск, mode и predicate.
- Missing-menu restore использует выбранные planDays; неизвестный serv даёт `[УТОЧНИТЬ]` вместо молчаливой порции 1 в recipe adapter.

Остатки:

1. **Неуспешный rebuild сохранённого меню:** `PilotApp.tsx:202–233` оставляет старое несовместимое меню и переводит в ready. В synthetic profile с валидным для DTO лимитом 1 минута Today продолжает показывать неподходящую карточку. При этом Menu честно показывает отказ по ограничениям, detail блокируется; не утверждать, что эти исправленные gates отсутствуют. Нужен единый видимый отказ/возврат к параметрам и на Today, без предложения непригодного сохранённого блюда.
2. **Empty admitted pool и повторы:** `isMenuCompatibleWithProfile` проверяет membership только если effectiveIds.length>0 и не проверяет повтор ID внутри дня (`src/adapters/pilotState.ts:78–101`). Реальные helper probes вернули true для non-preview пустого допуска и для повторённого одного ID в трёх слотах. Actual UI также показал один рецепт трижды без repair PUT. Generation/replacement эти случаи отвергают.
3. **Unsupported approach при restore:** submit отвергает explore, но bootstrap/rebuild любой non-carnivore превращает в keto (`PilotApp.tsx:216,249,570`). Helper/controller probe с текущим mode-mapping и explore-профилем действительно создал keto-menu; это проверка helper/mapping, не отдельный React bootstrap E2E. Восстановление explore должно давать тот же честный отказ, что submit.

## F3 — fingerprint исправлен; guard ещё не соответствует обещанной строгости

**Закрыто и независимо подтверждено:** filename+bytes формат server/stamper совпал; endpoint дал `c94db25d7ba234c0` как свежий release. Исключение для `.env.example` удалено; guard-install failure фатален. Не повторять прежнее утверждение о несовпадающих fingerprint.

Остатки на synthetic policy probes, без чтения запрещённых файлов/сетевых операций:

- `.env` и `.env.example` вне run root запрещены, но `.ENV.example` и `SAMPLE.DB` разрешаются проверкой имён: нет case-folding для Windows (`pilot_io_guard.py:59–72`).
- Любой успешный bind регистрирует порт, затем произвольный application connect на него разрешён; это не проверка stdlib self-pipe (`:109–133`). Probe подменял сами OS bind/connect counters и действительно дошёл до connect boundary вне stdlib. Реальный socket не открывался.
- SQLite confinement проверяет suffix, а не обязательное нахождение каждой файловой БД внутри run root (`:99–107`). БД без обычного расширения не должна обходить sandbox.

**Исправить:** Windows-aware filename policy, строгий DB confinement для файловых SQLite paths, только нужный stdlib socketpair; сохранять внешний/application network запрет. Не заменять guard общим разрешением loopback и не ослаблять его ради green suite.

## Конечные критерии приёмки исправлений

Это завершение прежних F1–F4, не новый roadmap.

- [ ] Реальные launcher entrypoints собирают AppSettings/create_app и проходят запусковую конфигурацию; неизвестные kwargs ловятся tests до operational launch.
- [ ] Preview строго loopback; pinned artifact + явно выбранный demo sidecar + собственная per-run DB; 5 кандидатов подключены только к явно разрешённому demo-показу. Production allowlist остаётся пустым.
- [ ] Owner-only policy учитывает существующие сессии выбранной DB; session TTL, expiry/teardown и владение PID/run проверены синтетически. Недопустимые параметры/пути отклоняются до записей.
- [ ] Partial second-save 409 и network failure не дают несогласованные menu/shopping после reload/новой сессии; обе sticky error ветки честны.
- [ ] Settings/batches/refresh сериализованы; delayed refresh не откатывает более новый UI state.
- [ ] Restore/Today/detail/callback имеют одинаковый fail-closed допуск; проверены empty pool, duplicate-day, неподходящий сохранённый menu, explore, planDays=1/3/7.
- [ ] Guard проверен на env case variants, файловую SQLite без стандартного расширения и application bind/connect; запрещённые реальные файлы не открывались.
- [ ] Добавленные регрессии входят в обязательный technical gate; backend/full discovery, frontend, typecheck, isolated build и разрешённые synthetic E2E отчётливо разделены с фактическими counts/exit codes.
- [ ] Новый отчёт привязан к новой сборке, source manifest и актуальным проверкам; не переносить старый PASS на изменившийся исходник.

Замечание к доказательствам исполнителя: named backend entries в receipt дают 112, тогда как полный discovery действительно даёт 143. Текущий source-plan K2 включает 24 backend modules / 110 test-методов по AST и не включает новый `test_staging_and_demo` или `test_release_version`. Это не опровержение полного PASS, а разные scopes. Не называть один запуск всем suite и не считать три create_app tests проверкой launcher/timer.

## Готовое задание Antigravity — выполнить без расширения продукта

Работай как единственный интегратор текущего dirty tree. Прочти этот документ и его evidence. Сохрани реально исправленные части и закрывай только оставшиеся F1–F4: сначала constructor/entrypoint launcher и явную связку artifact/catalog/temp DB, затем целостность user+shopping и error/reload, restore/Today и оставшуюся изоляцию/owner lifetime. Не подменяй запусковую проверку тестом helper/create_app; для каждого приведённого сценария добавь регрессию, сначала воспроизведи отказ на текущем коде, затем исправь и повтори проверку. Пройди все чекбоксы выше и сообщи незакрытые честно.

Не читать и не менять реальные env/секреты/БД/данные участников. Не запускать настоящего бота, Telegram API, туннель, платежи, рассылки, внешние ИИ-сервисы или пользовательский показ. Не commit/push/deploy. Чужие процессы/порты и изменения владельца сохранять. Synthetic unit/in-process/browser checks должны использовать свои данные/каталоги/handles; возможный отдельный локальный сервер для автоматических tests — только в уже согласованном test scope, не как скрытый показ владельцу. Не переносить production catalog gate и не утверждать рецепты от имени Ольги.

После реального закрытия этих критериев достаточно одного запроса на ограниченный локальный показ **А**. Вариант Б и медицинский/content approval — отдельные решения владельца. Не просить заново выбирать продукт или строить общую инфраструктуру.

## Доказательства и границы работы reviewer

`docs/audit/evidence/f1-f4-recheck-2026-10-31/`: `checks.json`, `backend-full-result.json`, `frontend.tap`, `backend-full.txt`, `isolated-build.txt`, `build-receipt.json`, `source-manifest.json`, `source-consistency.json`, `ui-probes.json`, `network-error-ui.json`, `compound-backend.json`, `policy-probes.json`, `restore-helper-probes.json`, `session-policy-probe.json`.

Две независимые source-review задачи: `deleg_5fea07f1`. Их статические выводы сверены родительским reviewer с source и указанными runtime probes; не выполненные сценарии помечены отдельно.

Reviewer изменял только audit-документы/evidence и собственные scratch harnesses. Продуктовый код, рабочая DB, env, бот, внешние подключения, Telegram и текущие пользовательские preview не изменялись. Отсутствие production approval сохраняется.
