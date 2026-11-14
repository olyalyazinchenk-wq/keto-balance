# Независимая проверка connected pilot после отчёта Gemini — 31 октября 2026

## Вердикт для владельца

Прогресс существенный: приложение больше не local-only, старые обходы авторизации закрыты, HTTP-клиент и сохранение в SQLite подключены. **Заявление «L0 → L1 → L2 полностью завершены» не принимается.** Есть воспроизведённая конкурентная потеря обновлений, расхождения ограничений/выхода рецептов и нарушение изоляции сборки. T1/T2 и реальный Telegram-вход не проверены.

Это не новый roadmap и не требование переделать дизайн. Ниже — незакрытые критерии уже выданного `docs/handoff/2026-10-31-gemini-deliver-working-pilot.md`.

Проверенная база: `5f39a90f3eb59295869e389acc2a9add4b6e0ad0`, ветка `design/argon-ui-import`, значительный dirty tree. Отсутствие новых коммитов соответствует запрету commit/push; это не недостаток работы.

## 1. Что проверено реально

| Проверка | Независимый результат | Граница доказательства |
|---|---|---|
| Все native frontend unit files | 25 файлов; TAP tests=174/pass=174/fail=0/skipped=0; exit 0 | TAP tests включает родительские subtests, это не число assertions |
| Typecheck | `CI=1 KETO_LOAD_DOTENV=0 npm run typecheck`, exit 0 | Не build/Telegram |
| Новые auth regressions + persistence roundtrip | 7 tests, failures=0/errors=0/skipped=0; exit 0 | Два выбранных backend suites, не все заявленные 133 |
| Существующий build artifact | SHA frontend `b18495425d773345`, catalog `face03d34bf329b2` пересчитаны по файлам | Не доказательство текущего запущенного процесса |
| Текущие backend sources | Fingerprint `5b58d3938f4989a9` пересчитан, совпадает с отчётом | `/api/version` всё ещё не закрепляет loaded backend |
| Whitespace | `git diff --check`, exit 0 | Есть информационные LF→CRLF warnings; dirty tree не исчез |
| Полный k2-pilot/build/E2E | Не перезапускались | Builder копирует runtime DB, поэтому небезопасен для повторения |
| Последний сохранённый E2E JSON | expected=1, unexpected=0/flaky=0/skipped=0 | В gate каждый spec перезаписывает этот файл; он не общий receipt трёх specs |

Backend запускался со scoped OS env без application credentials, временными БД в собственном scratch и дополнительным внешним audit hook. Первоначальный reviewer harness запретил внутренний Windows asyncio socketpair и дал errors=68; это **не дефекты продукта**. После узкого разрешения только stdlib socketpair self-pipe (loopback ephemeral port), при сохранении запрета application network/внешних БД, повторный запуск дал 7/7 PASS. Первый диагностический лог сохранён в scratch, не подменяет итоговые результаты.

Исходники проверены также двумя независимыми read-only reviewers. Их выводы сопоставлены с actual source и собственными синтетическими probes. Продуктовый код, .env, рабочая БД, сервисы, бот, туннель, платежи и внешние отправки reviewer не менял/не запускал. Содержимое runtime DB не читалось.

## 2. Реальные улучшения, которые сохраняем

- `src/main.tsx` монтирует `PilotApp`, а не старый local-only store. Session/catalog/user/shopping вызываются через same-origin client; token в памяти, 401 очищает сессию, 409 отличим от успеха.
- `bot/server.py:96–121,160–219`: ни query/header identity, ни `test_`/`mock` строки больше не создают обход. Нет signing key → 503, нет действительного Bearer → 401, чужой явно переданный ID → 403.
- `bot/app_db.py:150–188`: новые сессии хранят hash, не выданный raw token. Состояние и preferences действительно пишутся, shopping имеет свою revision.
- Frontend поддерживает controlled callbacks, серверный bootstrap и identity-scoped cache. Новые BrowserContext в E2E не копируют localStorage; ответы API не подменяются.
- UI не превращает непроверенные БЖУ в проверенные; поддержка остаётся явной ссылкой. Локальный таймер и честная обработка fulfilled/rejected clipboard существуют.

## 3. Воспроизведённые дефекты и обязательные исправления

### R1 — изоляция не соответствует заданию

`build-isolated.mjs:71–74` делает рекурсивный copy **всей** `bot/`. В исходном дереве и в заявленном scratch snapshot найден файл `bot/keto_balance.db` (проверены только имена/существование). Это запрещённая копия runtime DB, не allowlisted source snapshot. Доказательств внешней передачи нет; содержимое БД reviewer не открывал.

`run_backend_tests.py:45–50` при провале guard продолжает работу с WARN. Синтетический install failure + один фиктивный unittest дал exit **0**. `pilot_io_guard.py:23–30,54–74` допускает `.env.staging`/`.env.example` вне test root, а socket guard разрешает весь loopback. Скрипты сборки/старта наследуют весь `process.env` (`build-isolated.mjs:135–141,209–214`), а не согласованный allowlisted OS env.

**Исправить:** копировать только явно разрешённые source/config файлы; исключить БД/env/examples/runtime JSON/logs/cache на любой глубине. Проверить synthetic sentinels до реальных copy/read. Ошибка установки/проверки guard должна блокировать runner; guard не должен сбрасываться тестами так, чтобы исчезали неожиданные нарушения. Дочерние процессы получают только разрешённое окружение. Не удалять найденные чужие scratch/БД автоматически — очистка требует отдельного понятного scope.

### R2 — CAS и snapshot не атомарны по контракту

`bot/app_db.py:326–368,408–429`: SELECT revision выполняется до начала пишущей транзакции, затем безусловный INSERT OR REPLACE. Собственный scheduling probe на новой synthetic SQLite заставил два writer прочитать revision 0: **оба вернули ok/revision 1, в БД остался только второй товар**. Это потеря обновления, которую последовательный тест 409 не обнаруживает.

`pilot_models.py:97–112`: PUT с одним expected_revision принимается за полный snapshot, отсутствующие поля становятся null/[]; явный profile=null прежний профиль не очищает (`app_db.py:339–358`). Это тоже воспроизведено на synthetic DB/model.

**Исправить:** atomic CAS обоих ресурсов, включая concurrent initial revision 0, с конфликтом 409 без записи проигравшего. Полные write-поля обязательны; определённая контрактом семантика explicit null сохраняется при чтении. Profile+state — одна транзакция. Добавить concurrent, missing-field, null, user+shopping roundtrip tests.

### R3 — один допуск/предикат должен действовать во всех точках

`state.ts:153–173` сохраняет второй demo-filter: wire `exclude_*` ищутся в recipe tags, `prepTimeMax=0` исключает все положительные времена. Собственный pure probe: canonical predicate допускает k1 без грибов, view-filter его отвергает; «без лимита» возвращает 0 блюд.

`PilotApp.tsx:402–429` callback замены не проверяет candidate controller; `179–186` несовместимое restored menu переводится в ready с **shopping** stale вместо блокировки неподходящего меню; `FoodFirstApp.tsx:265–266` проверяет только наличие recipe ID. `explore` превращается в keto (`PilotApp.tsx:277–282`). На HTTP write/read нет проверки recipe IDs по admitted catalog; `CatalogService` не ограничивает static test_only artifact стадией.

**Исправить:** один canonical predicate/controller для generation/replacement/restored menu/detail; отдельно проверять принадлежность admitted pool, режим, повторы дня, ограничения и время. Unknown/revoked/несовместимый snapshot требует пересборки и не показывается как действующий. Explore не запускает персональную keto generation. Сервер валидирует IDs/структуру меню и stage/test-only boundary, frontend не может расширить допуск. Синтетический provider — только явный изолированный test path.

### R4 — исходный выход и галочки покупок искажены

`recipesAdapter.ts:70–89` игнорирует `Recipe.serv`; `FoodFirstApp.tsx:213,228` ставит serv=1. Собственный probe: исходный k1 имеет serv=2, view пишет «1 порция». `shoppingFromMenu.ts:156–179` переносит галочки на изменённое количество: probe **4 шт. → 8 шт.**, alreadyHave=true и checkedInStore=true остаются. Группировка `:122` не различает конкретные неизвестные units.

**Исправить по уже согласованной семантике:** 1×/2× = одно/два приготовления исходного рецепта; не новые личные нормы и не медицинские расчёты. Учитывать source serv, не подставлять неизвестный выход. На изменённые количества старые галочки не переносить; несовместимые/неизвестные единицы не складывать. Проверить рецепт/покупки/повторный вход. КБЖУ остаются [УТОЧНИТЬ].

### R5 — частичный save скрывает ошибку и снимает stale раньше времени

`PilotApp.tsx:508–519` сохраняет state с shopping_stale=false **до** shopping PUT. Если второй save не удался, сервер уже хранит «актуально» со старым списком. Последующие задачи queue идут дальше и любой успех переписывает общий status на saved (`:347–355,376–384`); rejected promises callbacks не обрабатываются. В test-only режиме notice скрывает sync error (`FoodFirstApp.tsx:234–245`).

**Исправить:** stale снимается только после подтверждённого shopping save и согласованного state save; partial failure сохраняет предупреждение/draft. Error/conflict не затираются успехом другого ресурса; нужен понятный retry/reload и отсутствие unhandled rejection/force overwrite. Проверить это в браузере с 401/409/network failure и delayed hydration/no early PUT.

### R6 — закончить уже обещанные варианты меню

`PilotApp.tsx:193–195,277–279` фиксирует 3 дня; согласованного выбора 1/3/7 нет. Rebuild callback передан, но не используется FoodFirstApp. `state.ts:131–150` выводит только breakfast/lunch/dinner при meals=4: четвёртый snack остаётся в сохранённом меню и покупках, но не виден человеку. Это воспроизведено pure function probe. При повторном открытии settings используются исходные drafts, а не сохранённые значения.

**Исправить:** доступные в форме параметры должны полностью работать, включая четвёртый слот, срок меню, пересборку и повторное редактирование settings. Не добавлять новые экраны/редизайн/коммерческие функции. Если потребуется сокращать согласованный scope, это отдельное решение владельца, не тихое исключение из отчёта.

### R7 — честные evidence, content approval и отдельный настоящий staging

1. В fixture и checklist **5** рецептов k1–k5, nutrition_status=unverified/test_only=true. Production IDs/approvals пусты; пересчитанный artifact catalog содержит **0** recipes. Пятнадцать «проверенных/допущенных» рецептов не подтверждены. Не просить владельца утвердить 15 вслепую и не объявлять вымышленную лицензию: непроверенные provenance/asset/license помечаются [УТОЧНИТЬ].
2. Receipt перечисляет 23 backend suites с суммой **105**, не 133; одна ссылка `test_redact_logs` ведёт на отсутствующий модуль (есть `test_log_redaction`). Девять перечисленных frontend entries дают **53**, тогда как независимый native full run реально имеет 174 TAP tests в 25 файлах. Это дефект evidence, не доказательство отсутствия всего прогресса. Собирать totals/scopes/commands/exits из реального вывода, не вручную.
3. `computeRecipeHash` (`export-release-catalog.mjs:21–24`) использует root-key replacer, выкидывающий вложенные поля. In-memory probe на клоне действительного canonical k1: изменение записи в `subs` не меняет hash (отдельный synthetic nested-object probe также показал пропуск вложенного amount; он не выдаётся за проверку tuple-поля `Recipe.ing`). sourceHash также необязателен в guard `:87`. Нужны рекурсивный deterministic hash всех значимых полей, обязательные полные approvals и negative tests на изменение ингредиента/количества/выхода.
4. Builder хранит source_manifest_count, но сам source manifest/его путь не сохраняет. В `/api/version` читается mutable release.json (`server.py:127–142`), без startup-fixed loaded backend fingerprint. Сохранить полный manifest/digest исходников и привязку tested artifact/backend/catalog. Разные E2E invocations не должны выдавать один последний JSON за общий результат всех трёх.
5. Runbook-команда `pilot_test_server.py --port 18080` реально завершается exit **2**, потому что обязательны --dist/--catalog. `--serve-test --json` не реализует заявленный JSON stdout contract. Удалить рекомендации широкого git restore/clean и kill неизвестного процесса по порту; останавливать только собственный process handle.
6. **Не публиковать pilot_test_server.py наружу.** Он жёстко задаёт app_stage=test и общеизвестный synthetic signing key (`scripts/pilot_test_server.py:8–18,72–79`); allowlist владельца нет. Настоящий Telegram initData этим ключом не проверяется, а synthetic identity можно подписать вне Telegram. Нужен отдельный staging startup с безопасно переданным real bot key после разрешения, новым test DB, owner-only allowlist после проверки подписи, платежами off, конкретным artifact и ограниченным временем жизни. Лабораторный harness остаётся локальным.

## 4. Что должны доказать исправленные E2E

Сохранить реальные HTTP + временную SQLite + новые contexts, а не заменить ответы API mocks. Проверять точный replacement ID и detail, полный JSON user/shopping state A → закрытие A → новая подписанная A2 без storage; steps/ingredients/оба shopping flags/batches/stale/settings/day, изоляцию B. Добавить негативные cases из исходного §13: empty/revoked catalog, unsupported ID, restrictions/time, partial save errors/401/409, clipboard rejection/missing, narrow layout. Source-regex tests этого не заменяют. Личная доставка Ольге остаётся отдельным разрешённым тестом, ticket/link не delivery.

## 5. Готовое сообщение Gemini

> Прочти `docs/audit/2026-10-31-connected-pilot-review.md`. Предыдущее полное ТЗ сохраняет силу. Прогресс auth/client/storage принят только в доказанном объёме; L1/L2 целиком не приняты. Закрой R1–R7 как недостающие критерии этого же среза, без нового интервью, редизайна и расширения продукта. Сначала RED по конкретным воспроизведённым дефектам, затем минимальные исправления и реальные безопасные проверки. Не обходи guards и не подменяй meaningful E2E существованием заголовка/200. Не копируй/читай рабочие БД и секреты; не выполняй commit/push/deploy, не запускай настоящего бота или внешних сообщений. Не публикуй тестовый сервер с synthetic key. После локального закрытия выдай один исправленный operational request для отдельного owner-only staging, с точным составом предлагаемого каталога и непроверенными данными. Не проси «продолжать?» после каждой обычной разрешённой локальной правки.

## Evidence

`docs/audit/evidence/connected-pilot-2026-10-31/`:
- `metadata.json` — actual fixture/artifact counts, receipt sums, backend source hash, snapshot DB existence (metadata only).
- `independent-tests.json`, `frontend.tap`, `backend-targeted.txt` — реальные independent runs и synthetic guard/hash/CLI probes.
- `persistence-probes.json` — concurrent lost update, explicit null, incomplete DTO acceptance, только own synthetic DB.
- `ui-probes.json` — zero time, predicate disagreement, missing fourth slot, source yield and retained quantity flags.
- `canonical-hash-probe.json` — реальное изменение subs на клоне canonical k1 не меняет hash.

Ни этот review, ни исходный отчёт исполнителя не разрешают внешние операции и не заменяют личную приёмку владельцем.
