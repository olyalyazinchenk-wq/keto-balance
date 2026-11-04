# Кето Баланс: довести существующий продукт до рабочего пилота — Implementation Plan

**Исполнитель и единственный интегратор:** Gemini 3.8 в Antigravity.  
**Цель:** Ольга открывает идентифицированную сборку из Telegram, задаёт настройки, получает меню из допущенного каталога, открывает рецепт, собирает покупки, возвращается в новой сессии с сохранёнными данными и имеет проверенный путь личного вопроса Ольге.

**Архитектура:** сохранить React 18 / Vite 5 / Tailwind 3 и FastAPI / SQLite / существующий Telegram-бот. Соединить готовый food-first UI с проверенной авторизацией, каноническим controller и версионированным серверным хранением; данные и ограничения должны проходить один реальный маршрут, а не независимые демо и backend. Один origin для frontend и API; новый стек, отдельная helpdesk-система и платёжная интеграция этому выпуску не нужны.

**Это полное задание вместо двух текстов Argon и прежнего файла поправок.** Аудит `docs/audit/2026-10-31-antigravity-k2-review.md` — доказательства исходных дефектов, а не дополнительный список функций. Старый большой план `.hermes/plans/2026-10-30_150846-product-to-telegram-and-revenue.md` остаётся архитектурной справкой; не запускать заново интервью и все его исторические пакеты. Приоритет: правила владельца/AGENTS → это задание → старые планы → отчёты исполнителей.

После отправки этого задания владельцем выполнять обычную локальную разработку и безопасные проверки до конца разрешённого объёма, не спрашивая разрешения на каждую функцию. **Само создание этого документа не означает, что код уже реализован или внешние операции согласованы.**

---

## 1. Что является результатом и где нельзя объявлять Done

| Рубеж | Необходимый факт | Чего он не доказывает |
|---|---|---|
| L0 SECURITY | Два auth bypass закрыты, отрицательные route-тесты и положительная подписанная сессия проходят | Не доказывает, что старый работающий процесс уже использует новый код |
| L1 CONNECTED LOCAL | Реальный UI ↔ HTTP FastAPI ↔ новая тестовая SQLite; новый BrowserContext восстанавливает данные | Не Telegram и не допуск настоящего каталога |
| L2 RELEASE PACKAGE | Изолированная воспроизводимая сборка, backend/frontend fingerprints, полный отчёт, инструкции старта/отката | Не внешняя публикация |
| T1 OWNER ACCESS | После operational approval владелец действительно открыл эту сборку через согласованный Telegram-вход | Не массовый запуск и не платежи |
| T2 OWNER PILOT | Владелец прошёл настройки → меню → рецепт → покупки → повторный вход; поддержка проверена отдельно | Не клиническая валидация, не платный продукт и не 24×7 SLA |

Не останавливаться после анализа, первого исправления, 146 зелёных тестов или L0. Дойти до L2 самостоятельно в локальном scope; подготовку содержания и operational-пакета вести без остановки остальных задач. T1/T2 выполнить только после конкретного согласования необходимых внешних действий. Если разрешений/хоста нет, закончить весь независимый локальный объём и задать **один собранный вопрос** по оставшемуся доступу; не писать «K2 готов».

**Первый полезный выпуск:** 18+, минимальные настройки питания/ограничений, меню на 1/3/7 дней, безопасная замена, рецепт с исходным выходом и ингредиентами, покупки и отметки, сохранение, личный путь помощи. Не собирать для этого выпуска анализы, диагнозы, вес/обмеры и фотографии. Ранее существующие API/данные не удалять, но новый UI не должен требовать лишних персональных полей.

**Вне этого среза:** платежи и цены, новые тарифы, автоподписка, новый AI-подбор, OCR/голос, админ-панель, массовые рассылки, напоминания, редизайн, миграция НутриОК, новая нутриентная методология. Это не недоделки текущего приёмочного маршрута.

## 2. Среда и исходный факт

- Репозиторий: `C:/Users/HP/Keto-balance`, рабочая ветка `design/argon-ui-import`.
- Последний проверенный baseline: `5f39a90f3eb59295869e389acc2a9add4b6e0ad0`. Перед стартом получить текущие ref/status и сохранить перечень уже изменённых файлов. Не восстанавливать baseline reset/stash/clean.
- На проверенном baseline: 146 frontend-тестов, typecheck и 12 targeted backend-тестов проходили; два независимых обхода авторизации при этом реально воспроизводились на синтетике.
- `src/App.tsx:535` открывает `FoodFirstApp`. Этот UI пока использует локальный preview store, весь RECIPES, fixed settings и не вызывает API.
- `bot/server.py:104–105` доверяет присланному ID без сессии; `:179–200` допускает test/mock initData без подписи. Проверить текущий код, а не предполагать, что finding ещё существует после чужой правки.
- `bot/app_db.py` пока не хранит большинство полей нового меню/отметок; успешный PUT сам по себе не доказывает сохранение.
- `src/data/releasedRecipeIds.ts`: production IDs пусты. Число 15 в backend settings не является owner approval.
- Основной `8000`, чужой preview `4387`, НутриОК `8090`, прокси `10808/10809`, туннель/его metrics — не ваши тестовые процессы.
- Рабочий `dist/` обслуживается живым сервером. Не перезаписывать его локальной сборкой.
- `current_tunnel_url.txt` меняется живым watchdog. Dirty этого файла не означает действие другого разработчика; не «чистить» его.
- Python для существующих backend-зависимостей: `.venv-p0/Scripts/python.exe`. Наличие и версии проверить; не обновлять окружение без причины.
- Node/npm/TypeScript/Playwright уже установлены. Сначала использовать их; не устанавливать новые MCP/плагины/модели ради этой задачи.

Обязательный начальный read: `AGENTS.md`, этот файл, текущие `bot/server.py`, `bot/app_settings.py`, `bot/app_models.py`, `bot/app_db.py`, `bot/catalog.py`, `src/main.tsx`, `src/adapters/{foodView,menuController}.ts`, `src/domain/{types,menu,eligibility}.ts`, `src/ui/food-first/FoodFirstApp.tsx`, `src/ui/food-first/recipesAdapter.ts`, `src/ui/food-first/contract.ts`, `src/ui/food-first/Menu.tsx`, `src/ui/food-first/Shopping.tsx`, `playwright.full.config.ts`, `scripts/verification.py`, `package.json`. Не перечитывать весь архив исследований вместо реализации.

## 3. Безопасность и полномочия — действуют для каждого агента

1. Не читать/не печатать реальные `.env`, их примеры, `.tunnel_cache.json`, `bot_data.json`, рабочие SQLite/БД, runtime-логи и данные участников. Для тестов — только известные исходники, новые fixture и новые временные БД. Для реальных secrets — отдельный operational scope, trusted injection владельцем без показа значений агенту.
2. Не выполнять commit, push, deploy, рабочие миграции, удаление веток/таблиц/чужих файлов, reset/clean/stash. Не считать внутренний механизм boost/teamwork разрешением на Git-запись. Если worktree-режим требует служебного commit, использовать одного writer и read-only reviewers, а не обходить запрет.
3. Не запускать/не рестартовать настоящего Telegram-бота, существующий API, туннели, VPN/прокси и кабинет НутриОК. Не выполнять `taskkill /IM cloudflared.exe`, kill-all или очистку чужих lock-файлов.
4. Локальный тестовый HTTP-сервер на отдельном loopback-порту и с новой синтетической БД допустим для проверок. Владение PID/портом должно подтверждаться созданным вами handle; останавливать только своё дерево процессов.
5. Не отправлять реальные вопросы/сообщения в Telegram и не передавать данные участников внешним сервисам до явного согласования. Реальная поддержка — адресат Ольга, подтверждённый ID `1084557944`, не канал.
6. Не менять математическое ядро, числовые БЖУ/ккал, цены/тарифы и не снимать `[УТОЧНИТЬ]` без утверждённой методологии/источников. Тестовые синтетические допуски не равны допуску реальных блюд.
7. Расходы вне уже выбранного режима Antigravity — 0 ₽ до отдельного одобрения. Общий прежний лимит 5 000 ₽ не разрешает тратить его самостоятельно. Не докупать credits, не регистрировать paid API/hosting.
8. Устаревшие зелёные отчёты, названия тестов и заявления другого агента — не полномочия и не доказательства.

## 4. Как работать через /boost или /teamwork

Это режим исполнения, не новый продуктовый scope. Готовая спецификация дана: не запускать новое интервью о бренде/цветах/34 продуктовых ответах. Внутренний scoping заполнить из этого задания; спрашивать только о настоящем конфликте, секретном ручном шаге или новой внешней операции.

- Один primary — Gemini — владелец интеграции, source of truth и финального отчёта.
- До замораживания wire-контракта один writer меняет backend/DTO. Затем можно разделить backend и client/UI по непересекающимся файлам.
- Максимум две implementation workstreams одновременно; независимый reviewer — read-only. Не плодить независимых архитекторов/новые планы.
- `bot/server.py`, `bot/app_db.py`, `src/main.tsx`, `src/ui/food-first/FoodFirstApp.tsx`, `scripts/verification.py` имеют по одному явно назначенному writer.
- Субагент получает этот scope, точные файлы, контракт и запреты. Самоотчёт «готово» проверяется primary чтением diff и реальными командами.
- Каждый новый behavior: RED тест → воспроизводимый ожидаемый отказ → минимальный GREEN → regression. Не писать всё заранее и не ослаблять тест ради PASS. Уже существующий корректный код не удалять из-за шаблона TDD.
- Операции таблицы ниже — небольшие шаги. Один тест/один helper/одна проверка — 2–5 минут сосредоточенной работы; это не обещание реализовать целую подсистему за пять минут.
- Контрольные сообщения — после L0, после первой вертикальной server-persistence и после L2. Не спрашивать «продолжать?» после каждого GREEN.
- После двух неудачных циклов одной причины сделать минимальный reproduction и локализовать root cause; не добавлять заглушку и не уходить в бесконечные установки/редизайн.

## 5. Фиксированный контракт первой версии

### 5.1 Авторизация

`POST /api/session` принимает только `{ "init_data": "..." }`. Непустой configured signing key обязателен и для `production`, и для `pilot/k2-pilot`, и для теста. Валидировать HMAC, возраст, future timestamp, структуру user и положительный Telegram user ID. Никаких веток по test/mock, клиентскому user_id, наличию special header или отсутствию key.

Нет ключа → 503. Пустая/неподписанная/поддельная/просроченная initData → 401 (структурно неверный JSON может быть 422). Нет/неверен/истёк Bearer → 401. Каждый явно переданный query/header ID, несовпадающий с verified session → 403. Никаких guest 1000 для защищённого API; `not is_production` не означает local-only.

Выдавать случайный opaque token, хранить в БД только hash, исходный отдавать один раз. `get_session_user` принимает token и ищет его hash. Сессии в браузере хранить в памяти, не в общем localStorage и не в URL/логах. Новый контекст получает новую сессию для того же синтетически подписанного Telegram user; это не требует передавать старый token между браузерами.

`POST /api/auth/validate`, если сохраняется, использует тот же verifier и те же отказы; не является альтернативным обходом. Сравнение/тестирование HMAC-helper не подменяет route tests.

### 5.2 Канонические данные и меню

Сохранить `src/domain/types.ts`: Recipe.id — string; ингредиенты — исходные пары `[name, amount]`; `serv` — исходный выход; нутриенты `kcal/p/f/nc`; DayMenu.date — ISO-дата; slots — ID; GeneratedMenu.created — number. Не добавлять `dayIndex` в домен/персистентное меню. Дата/слоты/ID сохраняются, dayIndex и русская подпись вычисляются только в presentation.

Использовать factory `createMenuController(admittedRecipes, admittedIds)`. Все генерации/замены/открытия рецепта/покупки — из одного admitted pool. Не использовать живой `UI_RECIPES = RECIPES.map(...)` без допуска. При отсутствии режима/допущенных блюд — понятное пустое состояние, не fallback на весь каталог или первый рецепт.

### 5.2.1 Настройки действительно влияют на результат

В первой версии поддерживать только перечисленные wire tokens; подписи UI русские. Mapping в `src/adapters/pilotState.ts` формирует канонический UserProfile, который передаётся controller; не передавать restrictions как неизвестное поле, которое домен игнорирует.

| Token | Подпись UI | Mapping в canonical UserProfile |
|---|---|---|
| `exclude_eggs` | Исключить яйца | добавить `яйца` в allergies |
| `exclude_dairy` | Исключить молочные продукты | добавить `молочные продукты` в allergies |
| `exclude_fish` | Исключить рыбу | добавить `рыба` в allergies |
| `exclude_nuts` | Исключить орехи | добавить `орехи` в allergies |
| `exclude_offal` | Не использовать субпродукты | добавить `субпродукты` в disliked |
| `exclude_mushrooms` | Не использовать грибы | добавить `грибы` в disliked |

Это технический фильтр известных ингредиентов, не медицинская гарантия отсутствия следов/перекрёстного загрязнения. Неизвестный token, нестроковый элемент или повреждённый список — 422 на входе API/blocked при чтении старого cache; не удалять неизвестное значение и не продолжать подбор. Объединять известные categories, не доверять одному тегу «без яиц» вопреки ингредиентам. Первому выпуску не нужен свободный текст с автоматической интерпретацией аллергий. `preferenceNote` допускает только пустое значение или существующий preset `simple_daily`; это не отдельный источник ограничений.

`prepTimeMax` — целое число 0..240 минут: 0 = без лимита, положительное = максимум по числу `Recipe.time` из исходной карточки, не «активное время у плиты». Маппить в существующий `UserProfile.cookTime`. После RED дополнить `src/domain/eligibility.ts:isRecipeAllowed` этой проверкой: при положительном лимите recipe.time должен быть конечным положительным числом и не превышать лимит. Недопустимое значение настройки отклоняется; лимит не игнорируется. Не вводить второй независимый фильтр только в MenuScreen.

Один predicate применяется при генерации, подборе замены, разрешении открыть/показать сохранённое меню и проверке меню после изменения настроек. Backend сохраняет и валидирует те же параметры; клиент до отображения restored snapshot проверяет его тем же controller/predicate. Не копировать в Python новую непроверенную медицинскую/NLP-логику. Несовместимое сохранённое меню помечается «Нужна пересборка», не объявляется подходящим и не заменяется всем каталогом.

Обязательный behavior-test от DTO до результата: фиксированный допущенный fixture pool с рецептами разного времени и содержащими исключаемый ингредиент; DTO с token и лимитом → generation и replacements не содержат нарушителей. Затем поменять ограничения/уменьшить лимит уже существующего меню → старый несовместимый выбор блокируется. Отдельно unknown token и недостаточный eligible pool приводят к явному отказу, не fallback.

### 5.3 Wire v1 — создать `src/api/pilotTypes.ts`; зеркально валидировать в `bot/pilot_models.py`

```ts
import type { GeneratedMenu, Recipe } from '../domain/types';

export type PilotRestrictionToken =
  | 'exclude_eggs' | 'exclude_dairy' | 'exclude_fish' | 'exclude_nuts'
  | 'exclude_offal' | 'exclude_mushrooms';
export interface PilotPreferencesV1 {
  confirmed18Plus: boolean;
  approach: 'keto' | 'carnivore' | 'explore';
  restrictions: PilotRestrictionToken[];
  prepTimeMax: number;
  mealsPerDay: 2 | 3 | 4;
  preferenceNote: '' | 'simple_daily';
}
export interface PilotProfileV1 {
  settings: PilotPreferencesV1 | null;
  // Legacy fields accepted for existing authorized API tests, not collected by new UI.
  weight?: number | null;
  height?: number | null;
  age?: number | null;
  gender?: 'male' | 'female' | 'other' | null;
  goal?: string | null;
  contraindications?: string[];
}
export interface PilotStateV1 {
  schema_version: 1;
  menu: GeneratedMenu | null;
  selected_date: string | null;
  checked_ingredients: Record<string, boolean>;
  checked_steps: Record<string, boolean>;
  shopping_batches: 1 | 2;
  shopping_stale: boolean;
}
export interface PilotShoppingItemV1 {
  id: string;
  name: string;
  amountLabel: string;
  department: string;
  linkedRecipeTitles: string[];
  alreadyHave: boolean;
  checkedInStore: boolean;
}
export interface PilotUserReadV1 {
  schema_version: 1;
  user_id: number;
  revision: number;
  profile: PilotProfileV1 | null;
  state: PilotStateV1 | null;
}
export interface PilotUserWriteV1 {
  schema_version: 1;
  expected_revision: number;
  profile: PilotProfileV1 | null;
  state: PilotStateV1 | null;
}
export interface PilotShoppingReadV1 {
  schema_version: 1;
  user_id: number;
  revision: number;
  items: PilotShoppingItemV1[];
}
export interface PilotShoppingWriteV1 {
  schema_version: 1;
  expected_revision: number;
  items: PilotShoppingItemV1[];
}
export interface PilotSaveResultV1 {
  status: 'ok';
  user_id: number;
  revision: number;
}
export interface PilotCatalogV1 {
  schema_version: 1;
  catalog_id: string;
  test_only: boolean;
  released_ids: string[];
  recipes: Recipe[];
  nutrition_status: 'unverified';
}
```

- `GET /api/user` → PilotUserReadV1; новый user имеет revision 0 и nullable profile/state.
- `PUT /api/user` принимает **полный** PilotUserWriteV1; profile+state записываются атомарно. expected_revision сравнивается в той же SQLite-транзакции; stale revision → 409 без изменения данных; успех увеличивает revision и возвращает PilotSaveResultV1.
- `GET /api/shopping` → PilotShoppingReadV1, новая запись revision 0/items []. `PUT` → PilotShoppingWriteV1 и такой же CAS/результат, своя shopping revision.
- Не подавать пользовательские идентификаторы из body/query в авторизацию. Не возвращать из БД служебные SQL-поля как изменяемый profile.
- Unknown поля DTO отклоняются (422), не исчезают с ложным 200. Ограничить размеры строк/списков/payload; не сохранять произвольный HTML/исполняемый JSON.
- `selected_date` принадлежит menu.days; при menu=null дата null. Даты настоящие календарные ISO, ID уникальны, slots соответствуют meals; даты, IDs и payload проверяются на сервере. Сохранённое меню с отозванным ID не отдаётся как действующее — требуется явная пересборка.
- Все ID меню и замен проверяются против текущего admitted catalog. Никаких встроенных рецептов из клиента вместо ссылок на canonical IDs.
- Boolean flags действительно boolean, revision — неотрицательный integer. Значения неизвестного количества не превращаются в число 0.
- `approach='explore'`, неподтверждённое 18+ или неподдерживаемые ограничения не должны молча запускать персональный кето-подбор.

### 5.4 Конкретное хранение, без переписывания всей БД

В `bot/app_db.py` расширить существующие таблицы: `user_profiles.settings_json`, `user_states.payload_json` и `revision`, `shopping_states.revision`. Полный state v1 хранить JSON; canonical date — внутри него. Existing legacy columns/functions сохранить там, где ещё используются: делать явный mapping, не создавать две противоречащие истины для живого UI. Персональные данные удаляются каскадно, export включает новые поля, backup/restore сохраняет их.

Мигратор расширения проверяет columns через schema metadata и идемпотентен. **Испытывать его только на новых/синтетических БД**, включая synthetic old-schema fixture. Рабочую БД не открывать и не мигрировать. Импорт/create_app не инициируют DDL в default DB. Тестовый startup вызывает init только для явно переданного временного db_path.

Предпочтения сохраняются полностью, не выводятся из жёсткого DEFAULT_SETTINGS. Для новых пользователей 18+ не подтверждено; ограничения пусты как незаполненный выбор, не доказательство медицинской безопасности.

## 6. Каталог: единый источник и реальные допуски

1. Сохранить `src/data/recipes.ts` как исходный статический каталог. Числа/формулы не исправлять ради прохождения валидатора.
2. `src/data/releasedRecipeIds.ts` — один authoritative список допуска. До owner approval оставить пустым. В том же файле добавить `RELEASED_RECIPE_APPROVALS`: записи approved ID с source/content hash, ссылкой на явное решение владельца, датой, базовым выходом/единицами, статусом изображения/лицензии. Не генерировать вымышленные approvalRef.
3. Создать `docs/content/catalog-release-checklist.md`: **предложение** небольшого набора, не утверждение 15. Для каждого — заголовок, исходный выход, ингредиенты/ограничения, provenance/asset/license, что непроверено. Для local tests можно иметь синтетический manifest, он не попадает в production IDs.
4. Создать `scripts/export-release-catalog.mjs`. На build из **тех же** RECIPES и IDs/approvals формировать `dist/released-catalog.json` со схемой PilotCatalogV1. Использовать существующий `loadTs` в build-окружении как валидатор уже делает; не переносить TypeScript-loader в Python runtime. Не читать bot_data.json. Exporter проверяет дубли, missing ID, stale content hash, неполные approval и отсутствие самовольного test_only для обычного релиза.
5. `bot/catalog.py` читает только этот статический release artifact. `create_app(..., catalog_provider=None)` — явная инъекция provider; в tests provider возвращает синтетический документ, default читает artifact из resolved_dist. Никакой fallback на bot_data.json/полный каталог/жёсткие 15.
6. Backend settings `PILOT_RECIPE_IDS` больше не самостоятельный production-допуск. В tests IDs берутся из конкретной fixture. Каталог с пустым допустимым списком честно пуст; UI показывает причину и не формирует меню.
7. Runtime UI получает catalog API, валидирует его и создаёт controller от этого admitted pool; не дополняет его локальными неопубликованными рецептами. `test_only=true` допускается только в injected test/provider и честно помечается в UI, не включается параметром HTTP-запроса.
8. Любое изменение содержимого одобренной карточки требует нового допуска. Проверить negative: существующий исходный ID вне manifest нельзя выбрать, заменить, открыть напрямую через hash/URL или включить в покупки.

Нутриенты: сохранять `[УТОЧНИТЬ]`, не печатать p/f/nc как проверенный профиль на одну порцию. `nc` не выдавать за общие carbs. Для первого выпуска использовать **исходный выход рецепта и исходные строки**, не личные нормы калорий/БЖУ/электролитов.

Порции: выбор 1/2 в этом срезе означает **одно/два приготовления полного исходного рецепта**, UI подписывает именно это. Не называть весь рецепт «1 порцией», если serv иной. Нечисловые строки («по вкусу») остаются строками; 0/unknown serv не заменяется молча на 1. Структурную агрегацию совместимых известных единиц покрыть тестами; разнородные/неизвестные единицы оставлять отдельными строками. Не переносить checked/alreadyHave на изменившееся количество автоматически.

## 7. UI: подключить без нового дизайна и утечки legacy state

- Создать тонкий `src/PilotApp.tsx`; `src/main.tsx` переключить прямо на него. Старый `src/App.tsx` не удалять/не переносить: его top-level legacy loadStore не должен исполняться в новом персональном пути. Для typecheck всех src сделать только совместимую правку его последнего return/import: legacy App возвращает `<PilotApp />`, а не вызывает новый controlled FoodFirstApp без обязательных props. Не делать props optional и не возвращать sample defaults ради компиляции. Обязательно проверить реальный import graph, не наличие строк в старом файле.
- `src/PilotApp.tsx` владеет клиентом, bootstrap, session user ID, revisions и очередями save. `FoodFirstApp.tsx` становится представлением **уже загруженного** snapshot/catalog и callbacks. Не монтировать его с sample state до завершения загрузки.
- Создать `src/adapters/pilotState.ts`: DTO ↔ canonical ↔ view projection и маленькая сериализованная save queue; pure helpers тестируются Node harness. Не добавлять state-библиотеку.
- Создать `src/api/ketoClient.ts`, типы из раздела 5. Клиент same-origin fetch, token только в памяти, methods session/catalog/getUser/putUser/getShopping/putShopping. Нет private token → protected request не отправляется. 401 завершает сессию; 409 не маскируется успехом; некорректный JSON и HTTP error → явная ошибка, не fixtures.
- Bootstrap: awaiting Telegram identity → authenticating → loading profile/state/catalog/shopping → ready/error. React StrictMode не вызывает неконтролируемые duplicate bootstrap/autosave.
- Перед ready **никаких PUT**. Перед каждой записью использовать последнюю подтверждённую revision. Queue сериализует изменения; более старый save/response не откатывает новый user intent. При 409 reload/conflict UI, не force overwrite. Начать с простой очереди и видимого retry, не с offline-sync engine.
- Cache только `kb_pilot_v1:<verified-user-id>:...`; не импортировать общий kb_proto/kb_state как персональные данные. В первой версии offline — read-only; после 401 не показывать прошлый cache другому пользователю. Не чистить чужие browser storage.
- Если server profile/state отсутствует — минимальная форма настроек и явное подтверждение 18+, не DEFAULT_SETTINGS с confirmed=true. Изменение ограничений проверяет уже выбранное меню; несовместимый рецепт требует замены/пересборки, не скрытого игнорирования.
- Все замены повторно валидируются controller в callback, а не только фильтром demo tag в MenuScreen.
- Persist menu, selected date, checked steps/ingredients, shopping batches, stale, оба shopping flags и custom items. Новый BrowserContext для того же user восстанавливает их с сервера.
- Заменённое меню делает shopping stale. «Обновлено/сохранено» только после успешного rebuild и подтверждённых save; при failure сохранять предупреждение/несохранённый draft.
- Recipe detail показывает именно выбранный ID. Неизвестный/отозванный ID — честное недоступно, не UI_RECIPES[0]. Фото соответствует ID либо нейтральная заглушка; alt-текст сам по себе не доказывает правильную фотографию.
- Сегодня → Меню → Рецепт → Покупки: тот же food-first стиль, тёплый фон, sans, существующие CSS/layout, «ты», без новых иллюзорных health forecasts. Не газетный/музейный редизайн.
- Неактивные Дневник/Ещё/напоминания не ведут в пустой/фиктивный функционал: явный disabled/«Позже» в согласованном первом выпуске.
- До реальной готовности session/catalog показывать «Демонстрационный режим»/«Загрузка»/«Нет допущенного набора». После — нейтральный фактический sync status. Не снимать предупреждения только ради вида готового продукта.
- Clipboard: успех только после resolved writeText; rejection/missing API — честная ошибка; никаких скрытых отправок.

## 8. Поддержка — один проверенный путь, не новая очередь

Сохранить существующий `src/pages/PrivateSupportPage.tsx` и путь к боту с ясным сообщением, что на странице ничего не отправлено. Проверить существующие bot handlers с синтетическим Telegram I/O, точным получателем, отменой pending question и ошибками отправки. Не придумывать username по числовому ID и не направлять личный вопрос в канал.

Не добавлять новую форму/ticket dashboard ради POST в E2E. Существующий `/api/support` остаётся защищённым; его ответ должен честно различать сохранение в сервисе и подтверждённую доставку. Не обещать «команда скоро свяжется», если этого процесса нет. Unit tests на ticket persistence могут быть, но не объявляются поддержкой Ольги.

Реальная доставка/ответ Ольги — отдельный согласованный nonsensitive тест, не более двух тестовых вопросов владельца; без анализов/историй участников и без автоответа модели.

## 9. Тестовая изоляция — сначала, а не после пишущих E2E

- Scratch: `C:/Users/HP/AppData/Local/hermes/cache/scratch/` с уникальным подкаталогом на запуск.
- Test HTTP: `127.0.0.1:18080`; `reuseExistingServer:false`. Занят → отказ, не kill чужого процесса. Внешний staging — другой отдельный процесс/решение.
- Явно переданные temporary db_path/dist/catalog_provider. Новый synthetic signing key, ни одного действительного токена. У дочернего процесса allowlisted OS env без application credentials, очищенный PYTHONPATH; KETO_LOAD_DOTENV=0, PAYMENTS_ENABLED=0, PAYMENT_MODE=disabled, APP_STAGE=test.
- `tests/helpers/pilot_io_guard.py`: fresh-process audit guard на попытки open настоящих env/runtime JSON/logs, SQLite вне тестового дерева и внешнюю сеть. Записывает попытки **до** исключения, чтобы caught error не дал PASS. У unit TestClient на Windows допускается только проверенный stdlib socketpair loopback, не весь localhost. У E2E разрешён только свой test origin; сторонние изображения/аналитика/Telegram API блокируются.
- `scripts/run_backend_tests.py` до discovery создаёт уникальный run root, выставляет непустой `KETO_TEST_ROOT` внутри Hermes scratch, одинаковые TMPDIR/TMP/TEMP и tempfile.tempdir, затем включает изоляцию. Tests используют этот run root, а не соседние чужие scratch-каталоги. Сначала проверить test_catalog_api/test_release_boundaries: на baseline они реально обращаются к bot_data.json, поэтому полный backend/gate нельзя запускать до перевода на injected fixtures.
- Подготовить `tests/fixtures/pilot/manifest.json` и `catalog.json`: только test_only, известные синтетические допуски. Можно копировать структуру статических рецептов, но не объявлять их owner-approved. Создать их до запуска зависимых tests/server.
- Создать `scripts/pilot_test_server.py`: startup только собственной временной БД, explicit isolated dist и fixture provider. Fake Telegram signing key известен только test harness; в product bundle не встраивается. Пример контракта startup в разделе 13.
- Перед browser navigation через fixture установить только test Telegram WebApp initData, независимо подписанную Node crypto тестовым ключом. Настоящий HMAC-verifier сервера используется без bypass.
- Не `route.fulfill` ответов session/user/shopping/catalog в интеграционном E2E. Реальный HTTP и реальная временная SQLite. Network-error cases можно отдельно имитировать на transport boundary.
- `localStorage.clear()` допускается только в созданном тестовом BrowserContext. Для основного persistence proof закрыть context A и открыть новый context A2 без обоих storages, с **новой** подписанной initData того же test user.

## 10. Сборка и verifier

Создать `scripts/build-isolated.mjs`: allowlisted snapshot исходников/config/scripts/tests-helper, не копия всего workspace. Не копировать .env, .env.example, БД, bot_data.json, cache, .tunnel_cache, logs и чужие dist. Уже установленные node_modules доступны только как зависимости. Выполнять обычный **полный** npm build lifecycle внутри scratch snapshot, не менять его на tsc-only и не пропускать validate:catalog.

`package.json` build дополнить экспортом статического release catalog после Vite и до stamp; exporter source вводится до этого шага. Пустой реальный manifest может собираться как честный locked artifact; не вставлять fake approved IDs ради build.

Builder возвращает receipt: абсолютный artifact/dist, SHA-256 source manifest (включая новые незакоммиченные файлы), base Git SHA + dirty marker, catalog hash, frontend buildId, backend source fingerprint, actual commands/exit codes. Git SHA baseline не выдавать за идентификатор всех dirty-правок. Проверить, что existing working dist/source файлы не переписаны.

CLI builder зафиксирован: без флага — полный isolated build и человекочитаемый результат; `--json` — тот же build, весь журнал в stderr и ровно один JSON-объект в stdout с `dist_dir`, `test_catalog_path`, `receipt_path`; все три пути абсолютные, существуют и принадлежат этому scratch run. Синтетический test catalog — sidecar вне production dist, не часть публикуемого пакета. `--serve-test` — подготовить тот же snapshot/sidecar и запустить только собственный pilot_test_server на 18080; процесс живёт до teardown Playwright и гарантированно закрывает только своих children. Нельзя подключаться к existing 8000. В config.webServer.command использовать `node scripts/build-isolated.mjs --serve-test`, а не сложную shell-цепочку или прямой product server.

`script/stamp-release` фактически называется `scripts/stamp-release.mjs`: сохранить существующий hash assets, дополнить release metadata source/catalog/backend fingerprints. Backend `/api/version` должен отражать **запущенный** backend artifact/fingerprint, захваченный при старте, а не только читать свежий frontend release.json с диска. Старый процесс не становится исправленным от изменения исходника рядом с ним.

Расширять только существующий `scripts/verification.py`, не создавать второй оркестратор. Build step вызывает isolated builder; остальные steps используют изолированные fixtures/server. Новые обязательные suites добавить в manifests до приёмки: backend `test_pilot_auth_regressions`, `test_pilot_harness`, `test_pilot_roundtrip`; frontend `pilot-client`, `pilot-state`, `pilot-preferences`, `release-catalog-export`. Они вводятся перечисленными выше шагами; отсутствие любого не маскируется остальными 146 тестами. Сохранить p0/visual/free/paid/checkpoint, per-suite nonzero/no skip/failure guards и PYTHONPATH isolation. Не запускать verifier рекурсивно из его собственных тестов. Полный backend discovery тоже обязателен после устранения его небезопасных fixtures, а не только выбранные новые tests.

Playwright reporter остаётся JSON `test-results/e2e.json` для parser, backend — BACKEND_RESULT, frontend — явный TAP. Output директории тестов можно сделать isolated; parser должен читать именно свежий report текущего запуска. Missing/future suite, 0 collection, required skip, stale/flaky report, failed child — BLOCKED, не PASS.

## 11. Порядок работ — выполнять, не возвращать новый общий план

Каждая строка — вертикальный behavior. Внутри: (a) написать минимальный test, (b) запустить точную команду и записать RED, (c) минимально реализовать, (d) GREEN и соседняя регрессия. Ряд задач требует нескольких таких небольших операций; не выдавать целый раздел за «5 минут».

| ID | Behavior / точные файлы | Команда после каждого GREEN / ожидаемый факт |
|---|---|---|
| S01 | Зафиксировать baseline/своих writers и разрешения; `docs/release/current-slice.md`, `execution-log.md` | git status/ref сохранены; реальные owner approvals не придуманы |
| S02 | Guard и временные пути; create `tests/helpers/pilot_io_guard.py`, `tests/backend/test_pilot_harness.py`; modify `scripts/run_backend_tests.py` | C-S: guard traps срабатывают до доступа; тест не трогает real DB |
| A01 | Создать negative route tests из раздела 12; `tests/backend/test_pilot_auth_regressions.py` | C-A: RED на 200 вместо 401/503, не на синтаксисе |
| A02 | Убрать identity fallback; `bot/server.py`, `bot/app_settings.py` | C-A: no Bearer/query/header → 401, нет гостя в pilot |
| A03 | Убрать test/mock session bypass в обоих auth endpoints | C-A: forged marker rejected при любом anonymous flag |
| A04 | Проверить оба заявленных IDs и malformed/expired auth; те же tests + `test_auth.py` | C-A: 403 для cross user, verified HMAC path остаётся |
| A05 | Hash-only sessions; `bot/app_db.py`, `test_app_db.py` | C-A/C-APPDB: raw token нет в БД/export/logs, round-trip работает |
| C01 | Контракт v1; create `src/api/pilotTypes.ts`, `bot/pilot_models.py`; update `app_models.py` | C-TYPE/C-MODEL: неизвестные поля/неверные даты/отрицательные, дробные и boolean revisions отклоняются; revision=0 и expected_revision=0 допустимы |
| C02 | Идемпотентное расширение synthetic schema; `app_db.py`, `test_app_db.py` | C-APPDB: fresh + synthetic old schema, реальные файлы не тронуты |
| C03 | Profile/settings round-trip; `app_db.py`, `server.py`, `test_user_api.py` | C-USER: настройки не теряются, нет auto confirmed18 |
| C04 | Menu/date/step/ingredient state round-trip; create `test_pilot_roundtrip.py` | C-SNAPSHOT: deep equal snapshot, dayIndex не persist |
| C05 | Shopping amountLabel/два flags/custom items; model/db/API tests | C-USER/C-SNAPSHOT: неизвестные количества не потеряны и не стали 0 |
| C06 | CAS user, затем CAS shopping; соответствующие tests/transactions | C-SNAPSHOT: stale expected_revision → 409 и данные прежние |
| C07 | Export/delete/backup новых полей; существующие `test_data_rights.py`, `test_backup_restore.py` | C-RIGHTS: все поля round-trip и каскад, только fake DB |
| R01 | Create checklist/exporter и `tests/fixtures/pilot/{manifest,catalog}.json`; `releasedRecipeIds.ts`, `scripts/export-release-catalog.mjs`, `tests/frontend/release-catalog-export.test.cjs` | C-R: empty locked, duplicate/missing/stale approval отказ |
| R02 | Provider injection / default static artifact; `bot/catalog.py`, `server.py`, `test_catalog_api.py`, `test_release_boundaries.py` | C-R: API не читает bot_data; реальный пустой manifest закрыт; fixture явно передана |
| R03 | Подключить admitted factory и mapping ограничений в `menuController.ts`, `foodView.ts`, `pilotState.ts`; create `tests/frontend/pilot-preferences.test.cjs`; добавить time guard в `src/domain/eligibility.ts` после RED | C-R/C-PREF: один pool и одинаковые restrictions/time для generation/replacement/restored menu; DTO→результат проверен behavior-тестом |
| U01 | Новый `ketoClient.ts`; дополнить созданный в R03 `src/adapters/pilotState.ts` очередью/DTO helpers без перезаписи готового mapping; create `tests/frontend/pilot-client.test.cjs`, `pilot-state.test.cjs` | C-U: expected wire, ошибки 401/409/network/JSON, нет fake success |
| U02 | Новый `PilotApp.tsx`, switch `main.tsx`, минимальный legacy App return/import; `food-import-boundary.test.cjs` | C-U: live import graph не исполняет legacy global loadStore |
| U03 | Bootstrap и минимальная форма настроек; `PilotApp.tsx`, `FoodFirstApp.tsx` | C-U/E1: нет PUT до loading done, нет auto 18+ и sample как personal |
| U04 | Today/Menu от сохранённого canonical menu; map dates ↔ view index | E1: выбрать непервую дату, label/ID совпадают с server snapshot |
| U05 | Replace callback через controller, затем Recipe exact ID; `Menu.tsx`, `Recipe.tsx` | E1: запрет чужого ID/ограничений, никакого fallback к первому |
| U06 | Базовый выход/количество приготовлений; `recipesAdapter.ts`, Recipe/Shopping props | C-U/E1: исходные строки и serv честны; КБЖУ остаются unverified |
| U07 | Rebuild/stale/оба shopping flags; `shoppingFromMenu.ts`, `Shopping.tsx`, tests | C-U/E1: menu change→stale, save failure не скрывается, новый amount не получает старую галку |
| U08 | Ingredients/steps/custom items + очередь save | E1/E2: все действия подтверждены server save и восстанавливаются |
| U09 | Clipboard и честные unloaded/disabled/error states | C-U/E1: resolved/rejected/missing; неактивная функция не симулирует результат |
| H01 | Сохранить личный путь поддержки, signed API ticket tests; `PrivateSupportPage.tsx`, `test_support.py`, текущие private-support bot tests | C-H/E3: никто не посылает реально, сохранение не названо доставкой |
| V01 | Isolated build и artifacts; create `scripts/build-isolated.mjs`; update `package.json`, `stamp-release.mjs`, tests | C-B: actual build exit0, receipt + hashes, рабочий dist неизменён |
| T01 | Изолированный test startup + fixtures из R01; create `scripts/pilot_test_server.py` | C-S: host/port/db/env owned, existing 8000 не используется; готовый builder дополнить serve-test |
| T02 | Переписать три E2E + browser fixture; `tests/e2e/pilot.fixture.ts`, `food-flow.spec.ts`, `persistence.spec.ts`, `support.spec.ts`, config | C-E: настоящие HTTP/SQLite, fresh context A2, isolation B, no external sends |
| V02 | Интегрировать safe steps в существующий verifier, расширить policy tests | C-V: обязательные per-suite checks, no recursive gate, no fake data access |
| V03 | Полная локальная регрессия + narrow layout review | C-F, C-DB, C-V: нет обязательных fail/skip, real overflow/controls проверены |
| V04 | L2 отчёт + staging/runbook + один approval packet | Артефакт доступен локально, statuses разделены; нет ложного T1/T2 |
| O01 | После явного operational approval: выделенный staging/HTTPS/тестовая кнопка | Frontend+backend+catalog версия совпадают, не старый 8000 |
| O02 | Проверка владельцем через Telegram + повторный вход + согласованная поддержка | T1/T2 только после реального подтверждения владельца |

Параллелить можно S02/A после закрепления файлов и UI skeleton после C01/R-контракта; primary не прекращает остальные независимые шаги из-за ожидания content/hosting approval. Не пересоздавать проект с нуля.

### Команды (PowerShell в Windows Antigravity)

Ниже реальные имена будущих файлов уже перечислены выше. **Не выполнять C-DB/C-V до guard/fixture этапов.** Никакие эти команды не выполнялись автором задания при его написании.

```powershell
# C-S — после создания test harness
& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_pilot_harness
# C-A
& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_pilot_auth_regressions tests.backend.test_auth tests.backend.test_session_api tests.backend.test_user_api
# C-MODEL / C-APPDB / C-USER — целевые существующие suites до полной discovery
& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_app_models
& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_app_db
& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_user_api
# C-SNAPSHOT — только после создания test_pilot_roundtrip.py в C04
& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_pilot_roundtrip
# C-RIGHTS
& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_data_rights tests.backend.test_backup_restore
# C-DB — полная discovery только ПОСЛЕ R02 и перевода всех unsafe fixtures
& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py
# C-R
node --test --test-reporter=tap tests/frontend/catalog-build-safety.test.cjs tests/frontend/menu-controller.test.cjs tests/frontend/food-view-adapter.test.cjs tests/frontend/release-catalog-export.test.cjs
# C-PREF — только после создания этого файла в R03
node --test --test-reporter=tap tests/frontend/pilot-preferences.test.cjs
# C-U — после U01
node --test --test-reporter=tap tests/frontend/pilot-client.test.cjs tests/frontend/pilot-state.test.cjs tests/frontend/food-import-boundary.test.cjs
# C-H
& ".venv-p0/Scripts/python.exe" -B scripts/run_backend_tests.py --suite tests.backend.test_support
# C-F / C-TYPE — protect pre-existing tests/helpers/test-fixture.ts first
npm run test:unit
npm run typecheck
# C-B — helper must exist first, full npm build happens in scratch, not working dist
node scripts/build-isolated.mjs
# C-E — only after config/fixture server isolation; never bare default playwright
node node_modules/@playwright/test/cli.js test --config=playwright.full.config.ts tests/e2e/food-flow.spec.ts tests/e2e/persistence.spec.ts tests/e2e/support.spec.ts
# C-V — after the previous safe steps are integrated
& ".venv-p0/Scripts/python.exe" -B scripts/verification.py --stage k2-pilot
# Whitespace gate, scoped to the actual changed files; preserve exit code
 git diff --check
```

GREEN: exit 0, actual nonzero tests per required suite, 0 required skips/cancelled/todo/flaky. RED: expected assertion/contract failure, не import typo/потеря зависимости. Не обещать заранее постоянное число тестов: оно изменится. Stderr warnings классифицировать отдельно. Не маскировать exit code пайпом/следующей командой.

## 12. Полный исходный negative regression — создать в A01

Новый файл `tests/backend/test_pilot_auth_regressions.py`. Его requests не используют настоящий API: TestClient, синтетический key и новая scratch DB. Auth code первого шага должен поддержать валидную подписанную сессию; эти tests не требуют ещё не созданного catalog_provider.

```python
import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from bot.app_settings import AppSettings
from bot.app_db import create_or_get_user
from bot.auth import generate_telegram_init_data
from bot.server import create_app

KEY = 'synthetic-pilot-signing-key-not-a-telegram-token'
SCRATCH = Path(os.environ.get('KETO_TEST_ROOT') or (Path(os.environ['LOCALAPPDATA']) / 'hermes' / 'cache' / 'scratch'))

class TestPilotAuthRegressions(unittest.TestCase):
    def setUp(self):
        SCRATCH.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='pilot-auth-', dir=SCRATCH)
        self.root = Path(self.temp.name)
        self.db = self.root / 'fixture.db'
        create_or_get_user(1001, username='synthetic_a', db_path=self.db)
        create_or_get_user(1002, username='synthetic_b', db_path=self.db)
        self.clients = []

    def tearDown(self):
        for client in self.clients:
            client.close()
        self.temp.cleanup()

    def client(self, stage='production', preview=False, key=KEY):
        settings = AppSettings(
            app_stage=stage, telegram_bot_token=key,
            allow_anonymous_preview=preview, db_path=self.db,
            dist_dir=self.root, released_recipe_ids=frozenset(),
        )
        app = create_app(dist_dir=self.root, db_path=self.db, settings=settings)
        client = TestClient(app)
        self.clients.append(client)
        return client

    def test_unverified_identity_never_authorizes_personal_routes(self):
        writes = {
            'schema_version': 1, 'expected_revision': 0,
            'profile': {'settings': None, 'goal': 'synthetic'}, 'state': None,
        }
        cases = [
            ('get', '/api/user', {}),
            ('get', '/api/user?user_id=1001', {}),
            ('get', '/api/user', {'headers': {'X-User-Id': '1001'}}),
            ('put', '/api/user?user_id=1001', {'json': writes}),
            ('get', '/api/shopping?user_id=1001', {}),
            ('put', '/api/shopping?user_id=1001', {'json': {
                'schema_version': 1, 'expected_revision': 0, 'items': []}}),
            ('get', '/api/user/data?user_id=1001', {}),
            ('delete', '/api/user/data?user_id=1001', {}),
        ]
        for stage in ('production', 'k2-pilot'):
            for preview in (False, True):
                client = self.client(stage, preview)
                for method, path, kwargs in cases:
                    with self.subTest(stage=stage, preview=preview, method=method, path=path):
                        response = getattr(client, method)(path, **kwargs)
                        self.assertEqual(response.status_code, 401)

    def test_unsigned_magic_strings_never_create_sessions(self):
        for stage in ('production', 'k2-pilot'):
            for preview in (False, True):
                client = self.client(stage, preview)
                for value in ('', 'test_init_data&user_id=1001', 'mock_user&user_id=1001'):
                    for endpoint in ('/api/session', '/api/auth/validate'):
                        with self.subTest(stage=stage, preview=preview, endpoint=endpoint, value=value):
                            response = client.post(endpoint, json={'init_data': value})
                            self.assertEqual(response.status_code, 401)

    def test_missing_signing_key_does_not_enable_guest(self):
        for stage in ('production', 'k2-pilot', 'test'):
            with self.subTest(stage=stage):
                response = self.client(stage, True, '').post('/api/session', json={'init_data': ''})
                self.assertEqual(response.status_code, 503)

    def test_both_claimed_ids_must_match_verified_session(self):
        client = self.client()
        signed = generate_telegram_init_data({'id': 1001, 'first_name': 'Synthetic'}, KEY)
        session = client.post('/api/session', json={'init_data': signed})
        self.assertEqual(session.status_code, 200)
        token = session.json()['session_token']
        headers = {'Authorization': 'Bearer ' + token, 'X-User-Id': '1002'}
        response = client.get('/api/user?user_id=1001', headers=headers)
        self.assertEqual(response.status_code, 403)

    def test_valid_signed_name_containing_mock_is_not_a_bypass_or_rejected(self):
        client = self.client()
        signed = generate_telegram_init_data({'id': 1001, 'first_name': 'synthetic_mock_name'}, KEY)
        response = client.post('/api/session', json={'init_data': signed})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user_id'], 1001)

    def test_malformed_authorization_does_not_fall_back_to_guest(self):
        for stage in ('production', 'k2-pilot'):
            for header in ('Basic synthetic', 'Bearer ', 'Bearer invalid-synthetic-token'):
                with self.subTest(stage=stage, header=header):
                    response = self.client(stage, True).get('/api/user', headers={'Authorization': header})
                    self.assertEqual(response.status_code, 401)

if __name__ == '__main__':
    unittest.main()
```

Дополнительно подтвердить отсутствие мутации synthetic users/state/sessions после rejected requests; raw token не появляется в SQL/log/export; expired/future signed initData и session expiration проверяются существующими/новыми tests. Положительные существующие тесты переводить на подписанную fixture и v1 payload, сохраняя реальные assertions, не удаляя их ради зелени.

## 13. Обязательный контракт isolated startup / E2E fixture

Создать `scripts/pilot_test_server.py` **до** использования в Playwright config. Интерфейс:

```powershell
$buildJson = node scripts/build-isolated.mjs --json
if ($LASTEXITCODE -ne 0) { throw "Isolated build failed" }
$build = $buildJson | ConvertFrom-Json
& ".venv-p0/Scripts/python.exe" -B scripts/pilot_test_server.py --port 18080 --dist $build.dist_dir --catalog $build.test_catalog_path
```

Это диагностический ручной старт собственного тестового сервера; при штатном C-E те же действия делает `--serve-test`. Пути берутся из проверенного build receipt автоматически, никаких placeholders и рабочего dist. Реализация: required args, reject owner ports, unique TemporaryDirectory в Hermes scratch, очищенный OS-only env + fake signing key, KETO_LOAD_DOTENV=0 до любых bot imports, explicit create_app(dist_dir,db_path,settings,catalog_provider), только host127.0.0.1, init_db исключительно temp DB, no reload, no polling, access logs не содержат tokens. Test provider принимает test_only fixture; API handlers остаются обычными строгими handlers.

`playwright.full.config.ts` должен брать свой artifact path/catalog path из **подготовленного test fixture/receipt**, а не рабочего dist. Его webServer.url и baseURL — один `18080`; reuseExistingServer false; один worker, retries0. Setup выполняет isolated build/fixture подготовку один раз, teardown закрывает только свои PID и файлы. Не запускать внутри тестового сервера verification runner или циклический build.

В `tests/e2e/pilot.fixture.ts` обычный Node crypto signer с ключом, совпадающим с test server, только в tests. Data-check-string формировать независимо от Python helper (алфавитные пары, auth_date свежий, user JSON). `context.addInitScript` устанавливает Telegram.WebApp с подписанной initData и no-op ready/expand. Это test double SDK, не auth bypass. Fake key никогда не отправляется в product API или bundle.

Обязательные browser scenarios:
- E1: новый A → явные настройки/18+ → генерация 3 дней → День 2 → replace конкретным допущенным ID → detail именно этого ID → shopping содержит правильные исходные строки/единицы. Снимать реальные request/response подтверждения, проверять status и payload, не факт fetch.
- E2: A меняет checked ingredients/steps, alreadyHave/checkedInStore, custom item; дождаться успешных save; закрыть BrowserContext. A2 без storage, со свежей identity A → сервер восстанавливает **полный** snapshot и выбранную дату. B не получает A; нет cache fallback от A к B. При delayed initial GET нет преждевременного PUT/default overwrite.
- E3: help доступна до настройки, возврат сохраняет введённый draft, personal bot link правильный; никаких фактических сообщений из E2E. Ticket saved != delivered.
- Ошибки: invalid/expired session, 409, offline/network failure, empty/revoked catalog, no replacement, missing/rejected Clipboard, unavailable recipe ID, changed quantity resets old checks. Не удалять обязательный кейс потому, что его неудобно реализовать.
- Layout: 320×640 и 390×844 весь четырёхэкранный маршрут, bottom padding/safe area, последняя кнопка/строка доступна, не только scrollWidth. Остальные ширины — дополнительный smoke, не новая дизайн-кампания.

## 14. Внешний вход: один approval packet, не новый бесконечный план

Параллельно локальной работе подготовить `docs/release/pilot-runbook.md` и `pilot-approval-request.md` с **конкретным** предложением:

- Что уже выполнено локально: artifact path, source/catalog/backend/frontend hashes, tests и конкретный полезный маршрут.
- Минимальный предложенный набор карточек с checklist, какие статусы остаются `[УТОЧНИТЬ]`; не требовать утверждения всего каталога/нутриентной науки ради первого показа.
- Реальное обнаруженное место для frontend+backend одного origin, persistent SQLite и TLS; стоимость/лимит, что хранится, как остановить/откатить. Никакой автоматически выбранный VPN-хост не является сервером приложения.
- Указать известный факт: отдельного ранее согласованного application-сервера нет, работа шла на ПК. Не утверждать «хост уже есть» по условной фразе старого плана.
- Если подходящего хоста/аккаунта нет, честно указать один этот blocker и предложить конкретное owner decision. Бесплатный static dist — только отдельный честный preview, не подмена работающего API/SQLite.
- Какие свои процессы/порт/тестовый бот будут запускаться; существующие 8000/4387/8090/прокси не трогать без отдельного точного согласования. Старый insecure процесс не считать исправленным новой правкой файла.
- Secrets владелец вводит trusted способом, без передачи в чат/логи и без ввода агентом кодов/паролей. Не спрашивать действительные ключи в переписке.
- Необходимый bundled operational scope: выделенный staging и новая БД только теста владельца, HTTPS/привязка только согласованной test-кнопки, owner-only synthetic/non-sensitive data, максимум 2 согласованных support messages, расходы 0 либо конкретный отдельно утверждённый лимит. Отдельно согласовать состав реальных пилотных данных/волонтёров позже.

После одобрения продолжить без запроса разрешения на каждый обычный локальный шаг. Сначала read-only health/version проверки. Сверить не только frontend buildId, но реально запущенный backend fingerprint и catalog hash. Проверить URL повторно после 2 минут без служебных пингов и после нового открытия владельцем; changing trycloudflare hostname не выдавать за постоянный адрес. На отдельно одобренное внешнее подключение — максимум две попытки и 15 минут активной диагностики, затем один конкретный blocker, без автоматического расширения лимита. «Пинг каждые 15 секунд» не установленное лечение сети; не создавать бесконечный keepalive/перезапуски без отдельного лимита.

Затем владелец реально открывает Telegram-вход, проходит полезный сценарий и повторный вход. Реальная signed initData и доставка поддержки проверяются в этом operational scope, не синтетическими Browser tests. Если сеть/кнопка/ключ/допуск не дают выполнить шаг — записать точную границу и следующее ручное действие одной фразой. Не фабриковать screenshot/API response/user confirmation.

## 15. Отчёт, который Ольга сможет использовать

Вести `docs/release/execution-log.md` фактами после каждого принятого checkpoint. `docs/release/acceptance.md` разделяет L0/L1/L2/T1/T2; не переносить старые PASS на новую сборку. `current-slice.md` убрать устаревшую «Hermes / Antigravity pair» и K0-only рамку; writer и scope должны соответствовать этому заданию, без вымышленного owner approval.

Первым экраном финального сообщения:
1. **Что можно открыть сейчас:** точная локальная/внешняя точка и режим, насколько он проверен.
2. **Что человек может сделать:** 4–6 простых действий, без названий внутренних пакетов.
3. **Что ещё нельзя:** 1–3 настоящих ограничения, не архив всех прошлых проблем.
4. **Факты проверки:** команды, фактические tests/pass/fail/skip, build/source/backend/catalog IDs, Browser evidence, отдельно owner confirmation.
5. **Если не готов внешний вход:** один конкретный blocker/approval request, а не «скажите, какую следующую функцию делать».

Обязательно приложить `docs/release/artifact-manifest.json`, `pilot-runbook.md`, `pilot-smoke.md` и evidence directory с машинными receipts/отчётами. Не складывать туда реальные initData, session tokens, Telegram payloads и персональные данные. Проверить файлы реально существуют, счётчики сходятся и заявленные commands действительно выполнялись.

**Стоп расширению:** после L2 не начинать новые полезности вместо согласования и проведения T1/T2. После принятого T2 не подключать платежи автоматически: следующий коммерческий срез — отдельный оффер и отдельное решение владельца, не тормоз текущего выпуска.

---

## Справка по выбранному режиму

Официальная документация Antigravity различает `/boost` для сложных ограниченных исправлений/интеграций и `/teamwork` для длительной командной работы с отдельным scoping. В некоторых опубликованных вариантах command catalog указано имя `/teamwork-preview`; фактически доступное имя берётся из меню `/` установленного клиента. Здесь предпочтителен `/boost` с этим уже готовым заданием, без нового цикла интервью. Оба режима не отменяют permissions и могут расходовать лимиты существующей подписки; дополнительные покупки не разрешены.

Источники: `https://antigravity.google/docs/boost/`, `https://antigravity.google/docs/slash-commands/`, `https://antigravity.google/docs/cli/reference/`. Содержание проверено по официальным поисковым результатам; доступность конкретной команды в аккаунте пользователя отдельно не проверялась.

**Автор задания в этом ходе не реализовывал продуктовый код, не выполнял указанные будущие тесты, не менял работающие службы и не давал новых operational approvals.**
