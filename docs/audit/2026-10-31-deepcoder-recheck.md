# Кето Баланс — повторная проверка отчёта DeepCoder

31 октября 2026. Ветка `design/argon-ui-import`; baseline `5f39a90f3eb59295869e389acc2a9add4b6e0ad0` + dirty tree.

## Вердикт и следующий полезный шаг

**Большая часть прежнего списка F1–F4 действительно исправлена. Повторять его целиком, откатывать продукт или менять дизайн не нужно.** Новые counts/build IDs независимо подтвердились. Лаунчеры больше не падают и действительно подключают пять синтетических карточек.

Однако полное «F1–F4 закрыты» пока не принимается: остались воспроизведённые ошибки согласованности/отображения покупок и автоматического восстановления меню. Ниже — три конкретных регрессии в двух уже существующих блоках F2/F1, не новый roadmap.

Для первого **визуального** показа разумен вариант А: один локальный synthetic контур, новые временные данные, без токенов/бота/туннеля. Это не приёмка серверной персистентности и не production. Если нужен уже чистый полный пользовательский проход — сначала адресно исправить случаи ниже. Запуск и контент по-прежнему согласовывает владелец; этот аудит не запускает и не утверждает их.

## Что reviewer реально выполнил

| Проверка | Независимый результат |
|---|---|
| Полный backend discovery | 152 tests, failures/errors/skipped=0, exit 0 |
| Native frontend | TAP summary 186 tests / 186 pass; fail/skip/cancel/todo=0, exit 0 |
| TypeScript | `tsc --noEmit --incremental false --pretty false`, exit 0 |
| Изолированная сборка | Полный существующий lifecycle, exit 0 |
| Build / backend / catalog | `c145c16cbf4fdc16` / `6014c9aae7939a3b` / `face03d34bf329b2` — совпали с отчётом |
| Связь со source | Все 100 файлов source manifest совпали с текущими src/scripts/bot; runtime DB/env/log/cache в copied bot не обнаружены |
| Настоящие launcher main() | AppSettings/create_app и собственная новая SQLite; подменён только OS-serving boundary. Оба прошли конфигурацию, отдали catalog=5, version/auth=200 |
| Default discovery | Без `--dist/--catalog`, с собственным latest-build-receipt: оба launcher также подключили свежий dist и 5 карточек |
| Timer/PID | Реальный timer callback при test lifetime=1 вызвал shutdown на synthetic Server; PID очищен, остаток=0. Это не запуск Uvicorn listener и не доказательство жёсткого завершения настоящего процесса |
| Existing non-owner Bearer | GET user/session теперь 403 на повторно использованной synthetic DB |
| Session TTL | Конфигурация 5 секунд реально применена к новой сессии, а не прежние 86400 |
| F1 helpers | Empty pool, duplicate-day и explore отвергаются |
| UI | Actual fresh bundle в отдельном браузере с полностью mocked/aborted transport; invalid restore возвращает к параметрам, confirmed18 сохраняется, generic error и conflict не скрываются, unrelated PUT после них=0 |
| Guard, прежние cases | `.ENV.example`/`SAMPLE.DB` запрещены вне run root; extensionless SQLite и application connect после fake bind заблокированы. Forbidden files/OS connections не выполнялись |

Full backend выполнялся с дополнительным reviewer audit hook; проверенные unit Python children также получали защиту. LOCALAPPDATA/TEMP были отдельными, обычный latest receipt владельца не перезаписывался. Launcher token-file проверялся только на собственном синтетическом текстовом fixture, не на настоящем ключе.

**Не повторялись:** canonical `verification.py --stage k2-pilot`, исходные сетевые E2E3, реальный preview listener, Telegram WebView/туннель/сообщения. Заявленные E2E3 остаются результатом исполнителя; adapted UI cases не подменяют их. Отсутствие этих проверок не мешает фиксировать уже воспроизведённые отказы, но не позволяет принять полный пилот.

## R1 / F2 — durable stale можно стереть из другой сессии

**Реально воспроизведено на настоящем FastAPI/CAS/SQLite, в собственном synthetic run.** Использованы меню и x1/x2 shopping payloads, полученные существующим domain/controller/shopping-кодом на fixtures.

1. Создана согласованная пара: меню на 3 дня, множитель 1, `shopping_stale=false`.
2. Сессия A сохранила обычный выбор дня; имеет действующий user revision=3 и cached state со stale=false.
3. Сессия B сохранила покупки x2. Новый код правильно записал durable stale=true, но user revision остался 3.
4. Второй user PUT B закономерно получил 409. На этом шаге простое partial-save исправление работает: GET user показывает stale=true.
5. A отправила свой обычный выбор другого дня с прежним cached state и `expected_revision=3`. Запись принята с 200 и стирает stale.
6. После GET: `shopping_batches=1`, shopping всё ещё соответствует x2, `shopping_stale=false`.

**Причина:** `bot/app_db.py:471–482` изменяет `user_states.payload_json` из shopping-транзакции, не изменяя user revision. `save_pilot_user` далее проверяет прежнюю ревизию и целиком заменяет payload (`:331–340,366–387`). Проверки множеств названий в `bot/server.py:309–322` и `src/PilotApp.tsx:249–273` не обнаруживают разницу x1/x2: названия одинаковые, количества разные.

**Исправить:** согласованный контракт версий/связи меню и покупок, который не позволяет постороннему cached snapshot объявить другой shopping актуальным. Не лечить сравнением названий. Просто увеличить user revision в shopping без изменения парного API/client CAS-контракта тоже нельзя: это создаст self-conflict следующего штатного user PUT либо позволит обойти защиту более нового state.

**Приёмка:** controlled two-session interleaving выше; 409 и transport failure второго save; GET/reload/new context не дают x2-покупки при x1-меню без durable warning. Сохранить обычный happy path без ложных self-conflicts. Отдельно проверить, что галочки покупок не требуют ложной полной пересборки: сейчас любой shopping PUT ставит stale=true, даже если поменялась только отметка.

## R2 / F2 — поздний refresh стирает новый custom item с экрана

**Реально воспроизведено на свежем build с управляемой synthetic transport-задержкой.**

- Начат refresh покупок; его shopping response задержан.
- Во время ожидания добавлен собственный продукт — он виден на экране.
- Задержка снята; последующий queued custom-shopping PUT получил 200.
- В synthetic API store продукт есть, а на экране исчез: visible count 1 → 0. Unhandled rejection=0.

**Source:** refresh захватывает прежние items (`src/PilotApp.tsx:775–783`), после await безусловно делает `setShoppingItems(nextShopping)` и заменяет ref (`:795–796`). Custom callback уже обновил UI/ref до выполнения своей queued task (`:510–529,860–864`), но успех queued PUT не применяет snapshot обратно. Исправленный merge menu/state (`:808–817`) этого не покрывает.

**Исправить:** поздний refresh не должен перезаписывать более новые shopping edits. Применять результат с учётом версии/актуального draft либо корректно объединять данные; не добавлять новую offline-инфраструктуру. Очередь сама по себе не защищает optimistic UI.

**Приёмка:** refresh → добавить продукт/поменять отметку во время pending request → все операции успешны → продукт/отметка остаются видимыми и сохраняются после следующего изменения и reload. API-visible и UI-visible snapshot должны совпадать. Этот browser case — про React callbacks, не pure helper merge.

## R3 / F1 — bootstrap repair отправляет revision=0 вместо загруженной версии

**Воспроизведено на actual fresh bundle с transport, соблюдающим реальный CAS-контракт.**

Synthetic GET user вернул revision=4 и сохранённое меню с повтором блюда. Новый compatibility validator правильно отклонил его и запустил rebuild. Но enqueue отправил PUT user с `expected_revision=0`; transport получил несоответствие и вернул 409. Баннер — «Конфликт версий. Обновите страницу», исходное меню с повторами не сохранено исправленным. Unhandled rejection=0.

**Source:** bootstrap вызывает setters серверных revisions (`src/PilotApp.tsx:179–181`), затем может сразу вызвать `enqueueUserStateSave` (`:219–241`), который читает revision ref (`:472–485`). Refs изначально нулевые и обновляются через effects; setter не является синхронной гарантией готовности ref к queued callback.

**Исправить:** гидратировать user/shopping revision refs из ответов сервера до любых bootstrap save/repair. Не сбрасывать реальную серверную версию в ноль, не отключать CAS и не делать force overwrite.

**Приёмка:** existing state с ненулевой revision (например, 4), требующий допустимого repair → первый repair PUT использует именно серверную revision, проходит, а новый context восстанавливает исправленное меню без цикла конфликтов. Невосстанавливаемое меню по-прежнему возвращает к параметрам с сохранённым draft; explore не генерирует keto.

## Что из прежнего аудита больше не нужно предъявлять повторно

- Нет прежнего TypeError `payments_enabled`; AppSettings создаётся до DB init.
- Catalog provider и default discovery действительно подключены; утверждение «всегда 0 рецептов» устарело.
- Non-loopback preview отклоняется; default DB per-run, PID cleanup проверяет собственный PID, Server создаётся до Timer.
- Existing Bearer allowlist и отдельный TTL применяются.
- Generic error больше не маскируется saving; conflict и error блокируют следующие queued PUT.
- Settings перешли в очередь; поздний refresh больше не откатывает новое menu/state. Остаток R2 — другой snapshot, shopping items.
- Неудачный restore больше не показывает запрещённую Today-карточку; draft восстанавливается; empty pool/duplicates/explore проверяются. Остаток R3 — время применения серверной revision, не отсутствие validator.
- Fingerprint, case-folding, обычная extensionless SQLite и application loopback guard исправлены в проверенных случаях.

## Границы А, Б и полного утверждения F3/F4

**А не следует блокировать отсутствием реального Telegram.** После отдельного согласия можно посмотреть визуальный synthetic сценарий с одним контекстом, новыми default per-run данными и явно зафиксированными artifact/catalog IDs. Не объявлять этим закрытыми R1–R3, персональный рацион или серверную сохранность.

До полноценного operational Б/строгого Done остаются ранее заданные границы, а не новая инфраструктура:

- Discovery через latest receipt не заменяет pinning: dist и catalog выбираются раздельно, metadata только печатается, backend берётся из ROOT. Для показа нужно связать точные проверенные пути/IDs; не утверждать, что произвольный default в любое время запускает именно проверенный build.
- Default per-run DB безопаснее прежней общей; но custom `--db` блокирует только ROOT/bot, а не все пути вне разрешённого run root. Для А не передавать произвольный `--db`; не утверждать глобальный confinement всех параметров.
- Таймер в проверке действительно сработал и PID очистился. Но callback лишь задаёт `should_exit`; жёсткое завершение реального Uvicorn процесса через час не проверено. Для операционного запуска нужен bounded teardown своего handle, без остановки чужих процессов.
- Source-only остаток guard: `pilot_io_guard.py:107–110` распознаёт memory URI по substring `mode=memory`, не по структурированному URI-параметру. Не считать этим доказанным полный confinement всех SQLite URI. Этот edge test-guard не является сам по себе запретом на локальную визуальную демонстрацию.
- Approval request всё ещё предлагает argv-токен (`pilot-approval-request.md:71–77`), хотя runbook запрещает это. Токены в чат/argv не передавать; реальный token-file сейчас не читать.
- Runbook содержит старые build/backend IDs и counts (`pilot-runbook.md:58–70`). Обновлять документ по фактической новой проверке, не вручную переносить старый PASS.

Пять test-only карточек остаются кандидатами с `[УТОЧНИТЬ]`; production allowlist и решение о данных не менялись. Разрешение показа/данных — решение владельца, а не подключённый технический enforcement в launcher.

## Готовое адресное задание Antigravity

Сохрани исправленную версию и закрой только оставшиеся F1/F2-регрессии R1–R3 этого файла. Не возвращай прежние уже устранённые дефекты и не строй новую среду. Сначала воспроизведи каждую приведённую последовательность на текущем source, добавь regression на реальном уровне её возникновения (HTTP+CAS / React callback / bootstrap с ненулевой revision), затем исправь root cause и повтори проверки. Pure helper или вручную написанный merge не заменяет проверку настоящего PilotApp.

После исправлений повтори full backend/frontend/typecheck/isolated build и обязательный gate в согласованном synthetic test scope; дай реальные counts/exit codes и новый build/source manifest. Не называй F1–F4 полностью Done, пока не проверены прежние обязательные критерии. Отдельные operational/guard ограничения раздела выше можно довести теми же адресными тестами/проверками, без расширения продукта; не подменять разрешение запуска исправлением кода.

Реальные env/секреты/рабочую DB/данные участников не читать и не менять. Не запускать пользовательский показ, настоящего бота, туннель, Telegram API, платежи, рассылки или внешние ИИ. Не commit/push/deploy, не трогать чужие процессы/порты и изменения владельца. Пять кандидатов не утверждать от имени Ольги. После адресного исправления — один конкретный запрос на ограниченный вариант А, а не новое интервью или выбор архитектуры.

## Доказательства и изменённые файлы reviewer

`docs/audit/evidence/deepcoder-recheck-2026-10-31/`: `checks.json`, `backend-full.txt`, `frontend.tap`, `build.txt`, `build-receipt.json`, `source-manifest.json`, `backend-probes.json`, `helper-probes.json`, `ui-probes.json`, `default-launchers-policy.json`, `synthetic-payloads.json`, `refresh-interleaving-ui.json`.

Независимые source reviewers: `deleg_8f2f11e0`. Их findings сверены с source и родительскими runtime probes; оставшиеся source-only выводы явно помечены.

Reviewer добавлял только audit/evidence и собственные scratch harnesses. Продуктовый код не менялся. Реальные данные, env, бот, пользовательский listener, внешние подключения и сообщения не затрагивались. Этот документ целиком пригоден для передачи исполнителю, собирать задание из переписки не требуется.
