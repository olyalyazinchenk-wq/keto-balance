# Кето Баланс — план получения работающего результата и завершения релиза

> **Для Hermes / Antigravity:** после отдельного разрешения на исполнение использовать `subagent-driven-development`. Один интегратор владеет рабочей копией; параллельным агентам разрешено независимое чтение/ревью. В этом ходе разрешена запись только данного плана, не реализация.

**Goal:** получить проверяемое открытие настоящей сборки в Telegram и доставку вопроса лично Ольге, затем закончить ограниченный безопасный бесплатный пилот и отдельно подготовить платный выпуск.

**Architecture:** сохранить React/Vite, Python/FastAPI и существующий polling-бот; публичный HTTPS направлять на сервер сборки и API, а не на Vite dev server. Для первого результата использовать уже существующую пересылку через бота, исправив её подтверждения и границы; долговечные обращения, пользовательские данные и подписку завершать только на последующих этапах существующей спецификации.

**Tech Stack:** текущие React 18 / TypeScript / Vite 5, FastAPI, python-telegram-bot 22.8, SQLite. Никаких новых CMS, Redis, агентов питания, OCR, нейросервисов или переписывания приложения.

---

## 1. Прочитать перед исполнением

Рабочая папка: `C:/Users/HP/Keto-balance`, ветка при подготовке `master`, HEAD `2cb84d1aeddf332125d7a9bd0bd33b4ba825c503`.

Обязательные входные документы, лежащие в этом же репозитории:

1. `AGENTS.md` — безопасность и запреты.
2. `docs/audit/2026-10-27-project-state-audit.md` — что воспроизведено, а не обещано.
3. `docs/product-brief-2026-10-26.md` — PB-01…PB-12, решения владельца.
4. `.hermes/plans/2026-10-26_143341-telegram-release-executor.md` — существующая техническая спецификация A01–G06, схемы API/БД, готовые узкие заготовки и микрошаги. Не создавать вместо неё новую архитектуру.

**Приоритет:** данный документ определяет порядок, первый результат и актуальные поправки. Старый большой план — техническое приложение для оставшихся работ, не второй параллельный проект. Исполнитель не должен разыскивать прошлые чаты.

### Что изменилось после аудита

На чтении 27.10.2026 около 02:24 рабочая копия уже содержала чужие изменения `bot/bot.py`, `bot/config.py`, `bot/server.py`, `bot_data.json`, `src/data/recipes.ts`, `package.json`, `scripts/verify-p0.py`, `tests/backend/test_verify_script.py` и новые scripts/verification.py, run_backend_tests.py, stamp-release.mjs, verify-release.py, test_release_version.py. Сохранить их, не восстанавливать HEAD поверх них.

- В config.py контакты канала и лички уже различаются; добавлен ADMIN_ID. Личность получателя/работающая доставка не подтверждены новым конфигом автоматически.
- В bot.py уже есть `/ask`, `/reply`, callback `ask_start` и отправка на ADMIN_ID. НЕ создавать второй обработчик вопросов.
- Но текущая ветка отправки ловит исключение и всё равно сообщает об успехе; вопрос `70` обрабатывается калькулятором раньше пересылки; `to_main` не обязательно снимает ожидание; пользовательский текст вставляется в HTML; `/reply` разрешает произвольный target_id.
- В main() прокси назначен обычному HTTPXRequest, но отдельно проверить транспорт getUpdates. Не объявлять VPN причиной без проверки.
- Верификатор уже переписывается на чистую политику. Старое предупреждение о рекурсии относится к предыдущему снимку: перечитать текущий test_verify_script.py, не чинить удалённый код.
- build уже вызывает stamp-release.mjs, сервер уже получает `/api/version`. Это заготовки, не подтверждённые результаты запуска.
- `package.json` пока не содержит Playwright и test:e2e. Новый gate требует TAP summary, а test:unit пока не закрепляет TAP reporter.

Последняя **реально выполненная до этого plan-mode** проверка около 02:17: frontend 41 результата / 33 pass / 8 fail, включая родительские результаты, публичный туннель — HTTP 530/1033. В этом ходе тесты, build, бот, туннель и платежи не запускались. Не выдавать прошлые цифры за текущий PASS.

## 2. Границы и полномочия

- Не читать/печатать реальные .env, токены, пароли, БД, вопросы/дневники участников и сырые runtime-логи. Приложение при отдельно разрешённом старте может использовать существующие защищённые настройки; агент не раскрывает их.
- Не выполнять commit/push/deploy автоматически. Ни создание плана, ни упоминание frequent commits не являются разрешением. Не использовать `git add .`.
- Разрешение на локальную реализацию не равно разрешению на перезапуск действующего бота, публикацию HTTPS, изменение Telegram-кнопок или отправку сообщения.
- Для операционной приёмки запросить ОДИН пакет разрешения: запуск нужных локальных процессов; один временный HTTPS-вход; изменение тестовой кнопки владельца; не более двух несекретных тестовых вопросов и одного ответа; без денег, рассылок и миграции рабочей БД. Уточнить, что существующий старт бота может писать в его БД; при отсутствии разрешения использовать отдельную синтетическую среду и честно оставить live-проверку NOT RUN.
- Реальные цены/формулы/методология/production и расходы требуют отдельного одобрения. 5 000 ₽ — общий бюджет до запуска, не разрешение расходовать его.
- Не «защищать» платный контент localStorage-флагом; не считать случайный URL аутентификацией.

## 3. Четыре результата, которые нельзя смешивать

| Рубеж | Что пользователь действительно получает | Что НЕ разрешено утверждать |
|---|---|---|
| M0 — доступ и личная связь | Нужная сборка открылась в Telegram; согласованный вопрос дошёл только Ольге; ответ через бота проверен | «Готово к продажам», «аллергии/медицина проверены», «это production» |
| M1 — безопасный закрытый бесплатный пилот | Полный путь настройки → меню → покупки → приготовление → дневник → повторное открытие; проверены изоляция данных и честная поддержка | «Реальные оплаты и возвраты готовы» |
| M2 — ограниченный платный пилот | Оплата, серверный доступ, отмена/истечение/возврат, реальные условия и сопровождение | «Доход гарантирован», «всё входит в 5 000 ₽» |
| M3 — публичный выпуск | Стабильное размещение, восстановление, поддержка, пройденный пилот и отдельное разрешение анонса | «Деплой/анонс разрешён самим планом» |

**До M0 не расширять каталог, тарифы и дизайн.** Технический просмотр — только синтетические данные, без приглашения участников. Временный HTTPS-адрес технически может быть доступен посторонним: не называть его закрытым доступом. Добавить видимое предупреждение о техническом просмотре, не вводить реальные данные и не использовать непроверенный подбор как рекомендацию. До бесплатного пилота обязательны safety/ограничения и private API.

## 4. Порядок работы и микро-TDD

Для каждой карточки кода ниже выполнить отдельные шаги:

- **R1 (2–5 минут):** добавить один указанный regression-кейс.
- **R2 (2–5 минут фокуса):** запустить указанную команду; зафиксировать ожидаемый RED по конкретной причине, не по сломанному окружению.
- **I (2–5 минут):** перенести один символ/ветку из полного приложения этого плана, не пакет целиком.
- **V (2–5 минут фокуса):** повторить команду и соседний regression; записать exit/count. Не менять assertions под старую ошибку.
- **C:** после связанного зелёного пакета и только при разрешении — scoped commit с явными путями. Временный RED не коммитить как завершённый результат.

Ожидание внешней сети/согласования/загрузки и проверка на устройстве не оцениваются искусственно в пять минут. Если один узкий шаг не укладывается, не расширять scope: остановиться на конкретном блокере.

Команды ниже — **для будущего разрешённого исполнения**, не запускать в plan-mode. В Git Bash из корня:

```bash
unset PYTHONPATH
export KETO_LOAD_DOTENV=0 PYTHONDONTWRITEBYTECODE=1 PAYMENT_MODE=disabled PAYMENTS_ENABLED=0 APP_STAGE=test
PY=.venv-p0/Scripts/python.exe
btest() { "$PY" -B -m unittest "$@" -v; }
ftest() { node --test --test-reporter=tap "$@"; }
```

Никакого общего discover до проверки текущей нерекурсивной политики. Для live-старта НЕ переиспользовать тестовый shell с KETO_LOAD_DOTENV=0: отдельно настроить разрешённый операционный процесс, не распечатывая его environment.

### Пакет P — зафиксировать владельца исполнения

| ID | Узкое действие / файлы | Проверка и ожидаемый результат |
|---|---|---|
| P01 | Прочитать Git и назвать одного интегратора; согласовать паузу второго writer на пересекающихся файлах | `git --no-optional-locks status --short`, `git rev-parse HEAD`; список чужих файлов сохранён, нет reset/clean/stash |
| P02 | `docs/release/baseline.md`: актуализировать только проверенные факты, источник и время | Не копировать старое «dist» в описание devserver; NOT VERIFIED для отсутствующей проверки |
| P03 | `docs/release/status.md`: единая строка M0/M1/M2/M3 и текущая карточка | В статусе «выполнено» только принятый рубеж, не количество файлов |

### Пакет L — минимальная проверочная основа

| ID | Один предмет изменения | Тест / команда |
|---|---|---|
| L01 | Проверить уже новые policy-tests, не переписывать их автоматически | `btest tests.backend.test_verify_script`; exit0, ненулевая коллекция, ни одного настоящего полного self-run из теста |
| L02 | `package.json`: закрепить `test:unit` как `node --test --test-reporter=tap tests/frontend/*.test.cjs` | `npm run test:unit`; summary TAP присутствует даже при RED продукта; продуктовые ошибки не скрываются |
| L03 | Проверить уже добавленные stamp/version/import guards | `btest tests.backend.test_release_version tests.backend.test_import_safety`; exit0, temporary fixtures, без секретов/реальной БД |
| L04 | Новый `scripts/probe_entry.py`: сначала validate_base/read_http и негативные tests из приложения A | `btest tests.backend.test_probe_entry`; HTML вместо API, dev HTML, wrong build → RED затем PASS |
| L05 | В том же файле добавить probe()/main(); никакой записи успешного отчёта на exception | Та же команда; missing CSS/JS/неверный JSON → отказ, no money/no bot API |
| L06 | `docs/release/status.md`: не объявлять весь P0 green, пока unit RED | После локальных исправлений `npm run typecheck` и `npm run build`; exit0 доказывает только типы/сборку |

### Пакет S — личные вопросы, без второго сервиса поддержки

| ID | Единственная ветка / точные файлы | Regression |
|---|---|---|
| S01 | Новый `bot/private_support.py`: допустимый private контекст и begin_question() | `btest tests.backend.test_private_support`; группа/канал не активирует пересылку |
| S02 | deliver_pending_question(): private получатель, исходный регистр, plain text | Та же; `<b>&` остаётся текстом, единственный получатель — server ADMIN_ID |
| S03 | Раздельные delivered/failed/unknown; успех только после успешного send_message | Та же; Forbidden и TimedOut не порождают success и не сбрасывают возможность явного повторного ввода |
| S04 | Отмена pending и лимит длины; никаких вложений на первом этапе | Та же; cancel → следующее сообщение не пересылается, >1500 символов не отправляется |
| S05 | reply_to_question(): только private чат владельца и известный отправитель | Та же; обычный пользователь/отрицательный/посторонний target не получает отправку |
| S06 | `bot/bot.py:text_message_handler`: вызвать helper ДО преобразования float; удалить старый блок awaiting_question | `btest tests.backend.test_support_integration`; вопрос `70` переслан, calculate_nutrition/save_calculation не вызваны |
| S07 | `bot/bot.py:callback_handler`: ask_start вызывает begin; to_main снимает pending; не сохранять старое user_states.awaiting_question | Та же; реальный callback отменяет отправку, не только отдельная helper-функция |
| S08 | `bot/bot.py:start_cmd`: точный payload `question` открывает экран согласия ДО get_or_create_user; ask_cmd не обещает мгновенную доставку | Та же; start не отправляет вопрос/не создаёт старую запись до выбора пользователем |
| S09 | `bot/bot.py:reply_cmd`: делегировать helper, сохранить существующую регистрацию команд | Реальный handler тестируется не-admin/разрешённым ответом; HTML не интерпретируется |
| S10 | Новый `src/pages/PrivateSupportPage.tsx`: только явный переход и раскрытие получателя, приложение C | Новый `tests/frontend/support-bridge.test.cjs`; CTA содержит payload question, не канал |
| S11 | `src/App.tsx`: заменить только NutritionistPage на wrapper нового компонента | Тот же test + typecheck; в реальном маршруте нет send-таймера/вложений/записи |
| S12 | `src/App.tsx`: заменить только ChatWidget на переход к /nutritionist | Тот же test; при клике открывается фактический новый экран |
| S13 | `bot/config.py`: не смешивать CHANNEL_URL/SUPPORT_CHAT; сверить новый личный username с владельцем и private chat ID, не угадывать | Кодовый regression подтверждает разделение; реальная identity проверяется только в разрешённой операционной фазе |
| S14 | Новый `src/pages/TechnicalNotice.tsx`; вставить в App перед Router, чтобы предупреждение было и до анкеты | Typecheck/build и ручной первый экран: нет обещания готового продукта или просьбы ввести реальные данные |

Кнопка в Mini App на M0 ведёт **в чат этого бота с payload question**. Текст и дневник автоматически никуда не передаются: пользователь видит раскрытие получателя и сам отправляет вопрос. Прямую ссылку на профиль Ольги можно оставить отдельной только после подтверждения личности, не на основании одного красивого username. Канал не используется как fallback ни при каком сбое.

### Пакет N — сетевой путь от сборки до Telegram

| ID | Узкое действие / файлы | Критерий |
|---|---|---|
| N01 | `bot/transport.py` и main() по приложению D: одинаковый утверждённый proxy для API и getUpdates, отдельные request-объекты | `btest tests.backend.test_bot_transport`; no network, оба транспорта настроены, direct работает без Windows proxy по умолчанию |
| N02 | `bot/bot.py`/логирование: убрать вывод str(exception), raw updates, API URL с token; httpx/httpcore не INFO | Выполнить старую A09 с `tests/backend/test_log_redaction.py`; synthetic URL/exception не раскрывают маркер. Не читать существующие реальные логи |
| N03 | Только после локального build: будущий API-процесс `KETO_LOAD_DOTENV=0 PAYMENT_MODE=disabled .venv-p0/Scripts/python.exe -B -m bot.server` на 127.0.0.1:8000 | Разрешённый управляемый background-процесс; probe local PASS, HTML API недопустим |
| N04 | Разрешённый туннель направить на 8000, а не 3000; один подтверждённый процесс | Команда ниже; внешний probe PASS с тем же buildId, не наличие PID/строки URL |
| N05 | Подготовить актуальный WEBAPP_URL в защищённой конфигурации, без чтения остального .env; перезапустить только подтверждённое дерево бота | Разрешённая операция; приложение само читает настройки, агент не распечатывает токен |
| N06 | `bot/bot.py:post_init`: кнопка WebApp для тестового личного чата владельца, затем read-back get_chat_menu_button | URL совпадает с проверенным HTTPS; отдельно новый /start выдаёт правильную inline-кнопку. Не массово редактировать старые сообщения |
| N07 | Открыть на устройстве владельца, сверить buildId и пройти не-секретный вопрос/ответ | Реальные screenshot/наблюдение владельца. При отсутствии устройства — NOT VERIFIED, а не «всё готово» |

**Сетевой runbook после разрешения:**

1. Проверить локально `scripts/probe_entry.py http://127.0.0.1:8000`. Из PASS взять buildId, не придумывать его.
2. Не запускать ещё один tunnel поверх старого: определить точный PID и остановить только согласованный старый процесс. Windows Python launcher/child — не два независимых poller.
3. Существующий `tools/cloudflared.exe` использовать только для короткого технического просмотра:

```bash
# Будущее выполнение только после разрешения, не сейчас:
tools/cloudflared.exe tunnel --url http://127.0.0.1:8000 --edge-ip-version 4
```

4. Взять фактически выданный публичный HTTPS hostname, не сохранять прежний случайный адрес. Проверить:

```bash
# PUBLIC_URL и BUILD_ID — значения, полученные шагами выше, не фиктивные строки:
"$PY" -B scripts/probe_entry.py "$PUBLIC_URL" --expect-build "$BUILD_ID"
```

5. Если снова 1033: одна ограниченная диагностическая попытка с `--protocol http2` (официальный Cloudflare run parameter; протокол не равен http2-origin). Временной предел одной попытки — 120 секунд, один процесс за раз. Отказ сети не лечить `--no-tls-verify`, выключением firewall или массовой сменой VPN. Доступность параметров сверить с установленным `--help`/официальной документацией.
6. Если обе поддерживаемые попытки не дали внешнего PASS — **M0 BLOCKED_NETWORK**; неподдерживаемый CLI-флаг/версия — BLOCKED_TOOLING, не ложный диагноз сети, приложить безопасный код ошибки и локальный PASS. Не заниматься часами сменой туннелей. Перенос на уже согласованный Linux-хост — следующий отдельный операционный шаг, без покупки/деплоя молча.
7. Quick Tunnel не считать постоянным размещением. Для M2/M3 нужен согласованный стабильный хост/домен из старого G02; поломка временного адреса не должна повторно маскироваться отчётом «релиз готов».

### Разрешённый фрагмент Telegram-настройки, не запускать в unit-тестах

В post_init после успешной операционной проверки, только для настроенного owner private chat; необходимые импорты `MenuButtonWebApp`, `WebAppInfo` из telegram. Данный фрагмент не проверяет доступность HTTPS сам: перед ним обязателен внешний probe.

```python
if WEBAPP_URL.startswith('https://'):
    await application.bot.set_chat_menu_button(
        chat_id=ADMIN_ID,
        menu_button=MenuButtonWebApp(
            text='Открыть приложение', web_app=WebAppInfo(url=WEBAPP_URL)
        ),
    )
    actual = await application.bot.get_chat_menu_button(chat_id=ADMIN_ID)
    if getattr(getattr(actual, 'web_app', None), 'url', None) != WEBAPP_URL:
        raise RuntimeError('Owner WebApp menu read-back mismatch')
```

Если ADMIN_ID/get_chat не подтверждены как ожидаемый private chat — не менять меню. Имя бота через get_me сверить с `keto_balance_userbot` до включения ссылок из приложения C. Не делать отдельный реальный getUpdates вручную поверх polling.

## 5. Полные узкие приложения к первому результату

Код ниже — материал будущей реализации, не созданные сейчас исходники. Делить перенос по символам/веткам карточек, сохраняя TDD. Не копировать поверх параллельно изменённого файла без перечитывания.

### A. Проверка именно production-сборки, а не красивого HTTP 200

Новый `scripts/probe_entry.py`:

```python
import argparse
import json
import re
import sys
from html.parser import HTMLParser
from urllib.parse import urlsplit, urljoin
from urllib.request import Request, ProxyHandler, build_opener

class ProbeError(ValueError):
    pass

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []
    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        value = data.get('src') if tag == 'script' else data.get('href') if tag == 'link' else None
        if value and re.fullmatch(r'/assets/[A-Za-z0-9_.-]+\.(js|css)', value):
            self.paths.append(value)

def validate_base(base):
    u = urlsplit(base)
    if u.username or u.password or u.query or u.fragment or u.path not in ('', '/'):
        raise ProbeError('Expected a public origin without credentials or query')
    local = u.hostname in ('127.0.0.1', 'localhost', '::1')
    if not u.hostname or u.scheme not in ('https', 'http') or (u.scheme == 'http' and not local):
        raise ProbeError('HTTPS required outside loopback')
    return base.rstrip('/')

def read_http(url):
    local = urlsplit(url).hostname in ('127.0.0.1', 'localhost', '::1')
    opener = build_opener(ProxyHandler({})) if local else build_opener()
    with opener.open(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=10) as r:
        if r.status != 200:
            raise ProbeError('Expected HTTP 200')
        if urlsplit(r.url).netloc != urlsplit(url).netloc:
            raise ProbeError('Unexpected cross-origin redirect')
        body = r.read(2_000_001)
        if len(body) > 2_000_000:
            raise ProbeError('Unexpected response size')
        return r.headers.get('Content-Type', '').lower(), body

def probe(base, expected=None, read=read_http):
    base = validate_base(base)
    if base.startswith('https://') and not expected:
        raise ProbeError('Public probe needs the local buildId')
    def get_json(path):
        kind, body = read(base + path)
        if 'application/json' not in kind:
            raise ProbeError('API returned non-JSON')
        return json.loads(body)
    kind, html = read(base + '/')
    if 'text/html' not in kind or b'/@vite/client' in html:
        raise ProbeError('Expected built HTML, not Vite dev server')
    health = get_json('/api/health')
    version = get_json('/api/version')
    release = get_json('/release.json')
    build_id = version.get('buildId', '')
    if health.get('status') != 'ok' or not re.fullmatch(r'[0-9a-f]{16}', build_id):
        raise ProbeError('Invalid health/version')
    if release.get('buildId') != build_id or (expected and expected != build_id):
        raise ProbeError('Wrong build')
    parser = Assets()
    parser.feed(html.decode('utf-8'))
    chosen = []
    for suffix in ('.js', '.css'):
        item = next((p for p in parser.paths if p.endswith(suffix)), None)
        if not item:
            raise ProbeError('Missing built JS/CSS')
        asset_kind, body = read(urljoin(base + '/', item))
        if not body or 'text/html' in asset_kind:
            raise ProbeError('Asset returned HTML/empty body')
        chosen.append(item)
    return {'status': 'ENTRY_PROBE_PASS', 'buildId': build_id, 'assets': chosen}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('base')
    p.add_argument('--expect-build')
    a = p.parse_args()
    try:
        result = probe(a.base, a.expect_build)
    except Exception as exc:
        print(json.dumps({'status': 'ENTRY_PROBE_BLOCKED', 'errorType': type(exc).__name__}))
        return 1
    print(json.dumps(result))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
```

Новый `tests/backend/test_probe_entry.py`, полностью без HTTP:

```python
import json
import unittest
from scripts.probe_entry import probe, ProbeError

class TestProbeEntry(unittest.TestCase):
    def fixture(self):
        build = '0123456789abcdef'
        values = {
            '/': ('text/html', b'<script src="/assets/a.js"></script><link href="/assets/a.css">'),
            '/api/health': ('application/json', b'{"status":"ok"}'),
            '/api/version': ('application/json', json.dumps({'buildId': build}).encode()),
            '/release.json': ('application/json', json.dumps({'buildId': build}).encode()),
            '/assets/a.js': ('text/javascript', b'console.log(1)'),
            '/assets/a.css': ('text/css', b'body{}'),
        }
        return values, lambda url: values[url.removeprefix('http://127.0.0.1:8000')]
    def test_real_shape_passes(self):
        _, read = self.fixture()
        self.assertEqual(probe('http://127.0.0.1:8000', read=read)['status'], 'ENTRY_PROBE_PASS')
    def test_html_health_is_not_api(self):
        values, read = self.fixture()
        values['/api/health'] = ('text/html', b'<html>app</html>')
        with self.assertRaises(ProbeError):
            probe('http://127.0.0.1:8000', read=read)
    def test_dev_server_rejected(self):
        values, read = self.fixture()
        values['/'] = ('text/html', b'<script src="/@vite/client"></script>')
        with self.assertRaises(ProbeError):
            probe('http://127.0.0.1:8000', read=read)
    def test_wrong_build_rejected(self):
        _, read = self.fixture()
        with self.assertRaises(ProbeError):
            probe('http://127.0.0.1:8000', expected='ffffffffffffffff', read=read)
    def test_missing_asset_rejected(self):
        values, read = self.fixture()
        values['/assets/a.css'] = ('text/html', b'app')
        with self.assertRaises(ProbeError):
            probe('http://127.0.0.1:8000', read=read)
    def test_public_http_and_credentials_rejected(self):
        for base in ('http://example.invalid', 'https://u:p@example.invalid'):
            with self.subTest(base=base), self.assertRaises(ProbeError):
                probe(base, expected='0123456789abcdef')
```

Добавить отдельный кейс public HTTPS без --expect-build: отказ до первого read; отдельный malformed JSON: отказ. Не трактовать ENTRY_PROBE_PASS как авторизацию, безопасность меню или настоящий Telegram WebView-тест.

### B. Личная доставка с честным результатом

Новый `bot/private_support.py`:

```python
from telegram.error import BadRequest, Forbidden, NetworkError, TelegramError

PENDING = 'pending_private_question'
KNOWN = 'private_support_senders'

def is_private(update):
    return bool(update.effective_chat and update.effective_chat.type == 'private')

def cancel_question(context):
    context.user_data.pop(PENDING, None)

def begin_question(update, context):
    if not is_private(update):
        return False
    context.user_data[PENDING] = True
    return True

async def deliver_pending_question(update, context, owner_id):
    msg = update.message
    user = update.effective_user
    if not is_private(update) or not msg or not user or not context.user_data.get(PENDING):
        return False
    text = (msg.text or '').strip()
    if not text or len(text) > 1500:
        await msg.reply_text('Нужен текст вопроса от 1 до 1500 символов. Он пока не отправлен.', parse_mode=None)
        return True
    result = 'failed'
    attempted = False
    try:
        if type(owner_id) is not int or owner_id <= 0:
            raise ValueError('Private owner is not configured')
        owner = await context.bot.get_chat(owner_id)
        if owner.type != 'private' or owner.id != owner_id:
            raise ValueError('Private owner is not verified')
        known = context.bot_data.setdefault(KNOWN, set())
        if len(known) >= 1000 and user.id not in known:
            raise ValueError('Preview support capacity exceeded')
        known.add(user.id)
        attempted = True
        await context.bot.send_message(
            chat_id=owner_id,
            text=f'Личный вопрос от пользователя {user.id}:\n\n{text}\n\nОтвет через бота: /reply {user.id} текст ответа',
            parse_mode=None,
        )
        result = 'delivered'
    except (BadRequest, Forbidden, ValueError):
        result = 'failed'
    except NetworkError:
        result = 'unknown' if attempted else 'failed'
    except TelegramError:
        result = 'failed'
    if result == 'delivered':
        cancel_question(context)
        answer = 'Вопрос отправлен в личный чат Ольги. Прочтение пока не подтверждено.'
    elif result == 'unknown':
        answer = 'Не удалось подтвердить доставку. Вопрос мог дойти; повтор может создать дубликат. Автоматического повтора не будет.'
    else:
        answer = 'Не удалось отправить вопрос. Доставка не подтверждена. Можно повторить позже или отменить.'
    await msg.reply_text(answer, parse_mode=None)
    return True

async def reply_to_question(update, context, owner_id):
    user, msg = update.effective_user, update.message
    if not is_private(update) or not user or not msg or user.id != owner_id:
        return
    args = context.args or []
    try:
        target = int(args[0])
        text = ' '.join(args[1:]).strip()
    except (IndexError, ValueError):
        target, text = 0, ''
    known = context.bot_data.get(KNOWN, set())
    if target <= 0 or target not in known or not text or len(text) > 1500:
        await msg.reply_text('Нужен известный отправитель и текст: /reply ID ответ. После перезапуска preview-связь нужно восстановить новым вопросом.', parse_mode=None)
        return
    try:
        await context.bot.send_message(chat_id=target, text='Ответ Ольги:\n\n' + text, parse_mode=None)
    except (BadRequest, Forbidden):
        await msg.reply_text('Ответ не отправлен.', parse_mode=None)
    except NetworkError:
        await msg.reply_text('Доставка ответа не подтверждена. Не повторяйте вслепую.', parse_mode=None)
    except TelegramError:
        await msg.reply_text('Ответ не отправлен.', parse_mode=None)
    else:
        await msg.reply_text('Ответ отправлен. Прочтение не подтверждено.', parse_mode=None)
```

Это **временный M0 relay**, не коммерческая ticket-система: pending/known живут в памяти и очищаются после restart; нельзя обещать восстановление диалога/истории/дедупликацию при сетевом timeout. До M1 выполнить долговечные tickets старого E06 в новой app-БД; рабочую legacy-БД ради M0 не мигрировать. Один polling без concurrent_updates=True. Вопросы и исключения не логировать целиком.

Новый `tests/backend/test_private_support.py`:

```python
import unittest
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from telegram.error import Forbidden, TimedOut
from bot.private_support import PENDING, KNOWN, begin_question, cancel_question, deliver_pending_question, reply_to_question

class TestPrivateSupport(unittest.IsolatedAsyncioTestCase):
    def fixture(self, text='Мой Вопрос <b>&', sender=101):
        msg = NS(text=text, reply_text=AsyncMock())
        update = NS(message=msg, effective_chat=NS(type='private'), effective_user=NS(id=sender))
        bot = NS(get_chat=AsyncMock(return_value=NS(type='private', id=777)), send_message=AsyncMock())
        ctx = NS(bot=bot, user_data={PENDING: True}, bot_data={}, args=[])
        return update, ctx
    async def test_success_only_to_private_owner_plain_text(self):
        u, c = self.fixture()
        self.assertTrue(await deliver_pending_question(u, c, 777))
        data = c.bot.send_message.call_args.kwargs
        self.assertEqual(data['chat_id'], 777)
        self.assertIsNone(data['parse_mode'])
        self.assertIn('Мой Вопрос <b>&', data['text'])
        self.assertNotIn(PENDING, c.user_data)
        self.assertIn('отправлен в личный чат', u.message.reply_text.call_args.args[0])
    async def test_channel_recipient_rejected(self):
        u, c = self.fixture()
        c.bot.get_chat.return_value = NS(type='channel', id=777)
        await deliver_pending_question(u, c, 777)
        c.bot.send_message.assert_not_awaited()
        self.assertIn('Не удалось отправить', u.message.reply_text.call_args.args[0])
    async def test_forbidden_is_not_success(self):
        u, c = self.fixture()
        c.bot.send_message.side_effect = Forbidden('synthetic')
        await deliver_pending_question(u, c, 777)
        self.assertTrue(c.user_data[PENDING])
        self.assertIn('Не удалось отправить', u.message.reply_text.call_args.args[0])
    async def test_timeout_is_unknown_without_retry(self):
        u, c = self.fixture()
        c.bot.send_message.side_effect = TimedOut('synthetic')
        await deliver_pending_question(u, c, 777)
        self.assertEqual(c.bot.send_message.await_count, 1)
        self.assertIn('мог дойти', u.message.reply_text.call_args.args[0])
    async def test_read_timeout_before_send_is_not_maybe_delivered(self):
        u, c = self.fixture()
        c.bot.get_chat.side_effect = TimedOut('synthetic')
        await deliver_pending_question(u, c, 777)
        c.bot.send_message.assert_not_awaited()
        self.assertIn('Не удалось отправить', u.message.reply_text.call_args.args[0])
    async def test_cancel_stops_next_send(self):
        u, c = self.fixture()
        cancel_question(c)
        self.assertFalse(await deliver_pending_question(u, c, 777))
        c.bot.send_message.assert_not_awaited()
    async def test_group_does_not_forward(self):
        u, c = self.fixture()
        u.effective_chat.type = 'group'
        self.assertFalse(begin_question(u, c))
        self.assertFalse(await deliver_pending_question(u, c, 777))
        c.bot.send_message.assert_not_awaited()
    async def test_long_text_is_not_sent(self):
        u, c = self.fixture('x' * 1501)
        await deliver_pending_question(u, c, 777)
        c.bot.send_message.assert_not_awaited()
    async def test_unauthorized_and_arbitrary_reply_rejected(self):
        u, c = self.fixture(sender=101)
        c.args = ['202', 'hello']
        await reply_to_question(u, c, 777)
        c.bot.send_message.assert_not_awaited()
        u.effective_user.id = 777
        await reply_to_question(u, c, 777)
        c.bot.send_message.assert_not_awaited()
    async def test_known_reply_is_plain_and_private(self):
        u, c = self.fixture(sender=777)
        c.bot_data[KNOWN] = {101}
        c.args = ['101', '<b>Ответ</b>']
        await reply_to_question(u, c, 777)
        c.bot.send_message.assert_awaited_once_with(chat_id=101, text='Ответ Ольги:\n\n<b>Ответ</b>', parse_mode=None)
```

**Точное встраивание в bot.py, не второй handler:**

- Импортировать helper-функции из bot.private_support.
- В text_message_handler сразу после проверки message/text выполнить `if await deliver_pending_question(update, context, ADMIN_ID): return`. Это ДО float и `.lower()`. Удалить старую ветку user_states.awaiting_question полностью.
- В ask_start вызвать begin_question(update, context), при False не открывать сбор в группе. Текст согласия: «Следующее текстовое сообщение будет передано Ольге в личный чат. Не отправляй анализы и документы. Для отмены нажми “Отмена”.»
- В to_main, menu_cmd и ask_cmd первым действием cancel_question(context); обычный /start тоже отменяет старое ожидание. Перед helper в text_message_handler сравнить исходный текст с точными b.text из get_reply_keyboard().keyboard: нажатие существующей reply-кнопки снимает pending и идёт в обычную навигацию, а не пересылается как вопрос. Не блокировать обычное слово «меню» внутри вопроса. /cancel зарегистрировать отдельным CommandHandler: снять pending, ответить «Отправка отменена», без отправки владельцу. Дополнительный integration-case: кнопка «📖 Рецепты» не уходит Ольге; recipes_cmd подменён AsyncMock, реальный text-handler вызван.
- В start_cmd точный `context.args == ['question']` ведёт в ask_cmd, до регистрации через get_or_create_user. ask_cmd показывает описание/согласие, но НЕ ставит pending до кнопки ask_start.
- Тело reply_cmd заменить единственным `await reply_to_question(update, context, ADMIN_ID)`.
- Старое обещание «немедленно доставит» удалить. Вложения в question-flow отклоняются с понятным текстом, не показывают success; зарегистрировать узкий обработчик только для pending private flow, остальные вложения не анализировать.

Новый `tests/backend/test_support_integration.py` обязан импортировать РЕАЛЬНЫЙ bot.bot с KETO_LOAD_DOTENV=0 и подменять Bot API/DB, а не только повторять helper-tests. Обязательный числовой кейс:

```python
import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import unittest
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch
from bot import bot as app
from bot.private_support import PENDING

class TestSupportIntegration(unittest.IsolatedAsyncioTestCase):
    async def test_numeric_question_precedes_calculation(self):
        msg = NS(text='70', reply_text=AsyncMock(), reply_html=AsyncMock())
        update = NS(message=msg, effective_chat=NS(type='private'), effective_user=NS(id=101))
        bot = NS(get_chat=AsyncMock(return_value=NS(type='private', id=777)), send_message=AsyncMock())
        ctx = NS(bot=bot, user_data={PENDING: True}, bot_data={})
        with patch.object(app, 'ADMIN_ID', 777), patch.object(app, 'calculate_nutrition', side_effect=AssertionError('calculation forbidden')), patch.object(app, 'save_calculation', side_effect=AssertionError('DB write forbidden')):
            await app.text_message_handler(update, ctx)
        self.assertIn('70', bot.send_message.call_args.kwargs['text'])
        self.assertEqual(bot.send_message.call_args.kwargs['chat_id'], 777)

    async def test_cancel_callback_clears_real_flow(self):
        from bot.private_support import PENDING
        query = NS(data='to_main', from_user=NS(id=101), answer=AsyncMock(), edit_message_text=AsyncMock())
        update = NS(message=None, callback_query=query, effective_chat=NS(type='private'), effective_user=NS(id=101))
        ctx = NS(user_data={PENDING: True}, bot_data={}, args=[])
        await app.callback_handler(update, ctx)
        self.assertNotIn(PENDING, ctx.user_data)

    async def test_start_question_has_no_implicit_consent_or_legacy_db_write(self):
        msg = NS(text='/start question', reply_text=AsyncMock(), reply_html=AsyncMock())
        update = NS(message=msg, effective_chat=NS(type='private'), effective_user=NS(id=101))
        ctx = NS(user_data={}, bot_data={}, args=['question'])
        with patch.object(app, 'ask_cmd', new_callable=AsyncMock) as ask, patch.object(app, 'get_or_create_user', side_effect=AssertionError('DB write forbidden')):
            await app.start_cmd(update, ctx)
        ask.assert_awaited_once_with(update, ctx)
        self.assertNotIn(PENDING, ctx.user_data)

    async def test_real_reply_handler_rejects_unrelated_target(self):
        from bot.private_support import KNOWN
        msg = NS(text='/reply 999 text', reply_text=AsyncMock())
        update = NS(message=msg, effective_chat=NS(type='private'), effective_user=NS(id=777))
        bot = NS(send_message=AsyncMock())
        ctx = NS(bot=bot, user_data={}, bot_data={KNOWN: {101}}, args=['999', 'text'])
        with patch.object(app, 'ADMIN_ID', 777):
            await app.reply_cmd(update, ctx)
        bot.send_message.assert_not_awaited()
```

Эти методы дописать внутрь TestSupportIntegration после приведённого числового кейса, не отдельным модулем с неожиданным отступом. У query нужны AsyncMock answer/edit_message_text; никакого реального Bot API. Если текущий интегратор добавил обязательные поля update, перечитать handler и расширить fixture, не заменять реальный handler тестовой копией.

Для вложений добавить в `bot/private_support.py`:

```python
async def reject_pending_attachment(update, context):
    if is_private(update) and update.message and context.user_data.get(PENDING):
        await update.message.reply_text('В этом режиме принимается только текст. Файл Ольге не отправлен. Напиши текст или отмени вопрос.', parse_mode=None)
```

Зарегистрировать после text-handler `MessageHandler(filters.ChatType.PRIVATE & filters.ATTACHMENT, reject_pending_attachment)`, импортируя функцию; не скачивать/сохранять/пересылать файл. В test_private_support добавить кейс pending attachment: reply_text вызван, send_message не вызван, pending остаётся; при отсутствии pending — нет действий. Наличие метаданных файла в update не выдавать за его обработку или доставку.

### C. Вместо имитации переписки — понятный переход в живую поддержку

Новый `src/pages/PrivateSupportPage.tsx`:

```tsx
import React from 'react';

export const SUPPORT_BOT_URL = 'https://t.me/keto_balance_userbot?start=question';

export default function PrivateSupportPage() {
  return <section className="p-4 max-w-2xl mx-auto" data-testid="private-support">
    <h1 className="text-2xl font-bold mb-3">Написать Ольге</h1>
    <div className="rounded-2xl p-5 border border-stone-200" style={{ background: 'var(--card)' }}>
      <p className="mb-3">Личные вопросы получает Ольга в личном чате. В канал они не публикуются.</p>
      <p className="text-sm mb-4">Откроется чат бота. Там ты увидишь получателя и отдельно отправишь вопрос. На этом экране ничего не отправлено.</p>
      <a className="inline-block rounded-xl px-4 py-3 text-white font-semibold" style={{ background: 'var(--acc)' }} href={SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer">Открыть чат для вопроса</a>
      <p className="text-xs mt-4">Не отправляй анализы и медицинские документы. Срочные обращения этот чат не заменяет.</p>
    </div>
  </section>;
}
```

В `src/App.tsx` импортировать компонент; заменить ТОЛЬКО функцию NutritionistPage на `function NutritionistPage() { return <PrivateSupportPage />; }`. Не оставлять старый send/таймер/формы вложений/записи в st.msgs в этой функции. Исторические локальные сообщения не отправлять автоматически и не объявлять реально доставленными.

ChatWidget заменить на один переход, не псевдочат:

```tsx
function ChatWidget() {
  return <button type="button" aria-label="Написать Ольге" onClick={() => go('#/nutritionist')} className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full shadow-lg text-white text-xl" style={{ background: 'var(--acc)' }}>💬</button>;
}
```

Не переименовывать маршрут `/nutritionist`, не менять весь Shell. Новый `tests/frontend/support-bridge.test.cjs` должен читать новый компонент и фактические функции App, проверять CTA/правильный payload и отсутствие прежних send-таймеров/форм. Но статический тест не равен переходу на телефоне: M0 manual check обязателен.

### Видимое предупреждение на техническом просмотре

Новый `src/pages/TechnicalNotice.tsx`; импортировать и вставить `<TechnicalNotice />` перед `<Router />` в корневой App:

```tsx
import React from 'react';

export default function TechnicalNotice() {
  return <aside role="status" className="p-3 text-sm border-b border-amber-300 bg-amber-50 text-stone-800">
    <strong>Технический просмотр.</strong> Используй только вымышленные данные. Подбор и расчёты ещё не приняты для реального использования. Покупки отключены.
    <a className="underline ml-2" href="/api/version" target="_blank" rel="noopener noreferrer">Версия сервера</a>
  </aside>;
}
```

Версия сервера не выдаётся за доказательство загрузки того же JS: в Desktop/browser сверить реальные `/assets/...` из DOM/Network с release.json, на устройстве — новый предупреждающий экран и новый support-flow. До M0 это только техническая приёмка. Удаление предупреждения — отдельный проверяемый шаг после приёмки соответствующего рубежа, не косметика исполнителя.

Полный исходный `tests/frontend/support-bridge.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('private support bridge is honest and wired to the real route', () => {
  const page = fs.readFileSync('src/pages/PrivateSupportPage.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(page.includes('keto_balance_userbot?start=question'));
  assert.ok(page.includes('ничего не отправлено'));
  assert.ok(!page.includes('olga_nutri_med'));
  assert.ok(app.includes('<PrivateSupportPage />'));
  const nutri = app.match(/function NutritionistPage\([^]*?(?=\nfunction |\n\/\*)/);
  const widget = app.match(/function ChatWidget\([^]*?(?=\nfunction |\n\/\*)/);
  assert.ok(nutri && widget, 'Expected existing route functions');
  for (const body of [nutri[0], widget[0]]) {
    assert.ok(!body.includes('setTimeout'));
    assert.ok(!body.includes('msgs.push'));
    assert.ok(!body.includes('type="file"'));
  }
  assert.ok(app.includes('<TechnicalNotice />'));
});
```

Это source regression, не замена DOM/WebView-приёмки. Запуск `ftest tests/frontend/support-bridge.test.cjs`; expected exit0 и ненулевой tests summary после внедрения. Отдельные tests для legacy OCR/админки могут оставаться RED до M1; это не скрывается.

### D. Обычные API-вызовы и polling не должны иметь разные случайные сетевые настройки

Новый `bot/transport.py`:

```python
from telegram.request import HTTPXRequest

def configure_transport(builder, proxy=None):
    normal = HTTPXRequest(proxy=proxy, connect_timeout=15.0, read_timeout=20.0)
    polling = HTTPXRequest(proxy=proxy, connect_timeout=15.0, read_timeout=20.0)
    return builder.request(normal).get_updates_request(polling)
```

В main() заменить сборку request/builder на `configure_transport(ApplicationBuilder().token(BOT_TOKEN), proxy).post_init(post_init).build()`. Proxy выбирать явно из KETO_BOT_PROXY/утверждённых environment-настроек; не навязывать `127.0.0.1:10809` на Linux, где Happ нет. На текущем Windows оператор может явно задать утверждённый локальный proxy. Не печатать URL прокси, если он содержит credentials. Метод get_updates_request подтверждён чтением установленного PTB 22.8: .venv-p0/Lib/site-packages/telegram/ext/_applicationbuilder.py:693; это проверка API-формы, не сети. Не обновлять SDK целиком. Пакет N не должен менять proxy всей Windows/VPN: только согласованную конфигурацию данного бота.

Новый `tests/backend/test_bot_transport.py`:

```python
import unittest
from unittest.mock import MagicMock, patch
from bot.transport import configure_transport

class TestBotTransport(unittest.TestCase):
    def test_both_requests_use_same_explicit_proxy(self):
        builder = MagicMock()
        builder.request.return_value = builder
        builder.get_updates_request.return_value = builder
        first, second = object(), object()
        with patch('bot.transport.HTTPXRequest', side_effect=[first, second]) as make:
            self.assertIs(configure_transport(builder, 'http://127.0.0.1:10809'), builder)
        self.assertEqual(make.call_count, 2)
        for call in make.call_args_list:
            self.assertEqual(call.kwargs['proxy'], 'http://127.0.0.1:10809')
        builder.request.assert_called_once_with(first)
        builder.get_updates_request.assert_called_once_with(second)
    def test_direct_mode_has_no_forced_local_proxy(self):
        builder = MagicMock()
        builder.request.return_value = builder
        with patch('bot.transport.HTTPXRequest') as make:
            configure_transport(builder)
        self.assertTrue(all(call.kwargs['proxy'] is None for call in make.call_args_list))
```

## 6. Приёмка M0: конкретный конец первой итерации

После разрешённой реализации локально выполнить точную целевую проверку; это НЕ общий P0/free/paid gate:

```bash
for suite in tests.backend.test_verify_script tests.backend.test_release_version tests.backend.test_import_safety tests.backend.test_probe_entry tests.backend.test_private_support tests.backend.test_support_integration tests.backend.test_bot_transport; do
  "$PY" -B scripts/run_backend_tests.py --suite "$suite" || exit 1
done
ftest tests/frontend/support-bridge.test.cjs || exit 1
npm run typecheck || exit 1
npm run build || exit 1
```

Ожидается: для КАЖДОЙ backend suite `BACKEND_RESULT tests=N failures=0 errors=0 skipped=0`, N>0; source regression — ненулевой TAP без fail/skip; typecheck/build — exit0. При ошибке остановиться. Полный `npm run test:unit` тоже запустить и записать фактический результат: известный общий RED не спрятать, не выдать целевой M0 PASS за полный P0 PASS. Дальше, отдельно в разрешённой операционной среде, обязательны local/public probe и реальное устройство. Не запускать незнакомые scripts/add_proxy.py, scripts/fix_indent.py, scripts/patch_bot.py как «готовое исправление»: они не являются шагами этого плана.

Сервер/туннель запускать как управляемые процессы с сохранёнными PID/handle (в Hermes — terminal с background=True), не бесконечным foreground-вызовом. Для чтения публичного hostname использовать безопасный вывод/локальные metrics, не сырые старые журналы. При остановке не убивать все python/node/cloudflared по имени.

Обязательны все пункты, не средняя доля:

1. Локальный probe и внешний HTTPS probe принимают один buildId, JS/CSS доступны, API отдаёт JSON, `/@vite/client` отсутствует.
2. Через реальную кнопку/меню в Telegram владельца открыта та же сборка. Проверены видимость первого экрана, возврат и переход к поддержке. Скриншот из обычного браузера не заменяет Telegram.
3. После явного согласия несекретный вопрос пришёл в PRIVATE-чат Ольги, не в канал; тестовый ответ пришёл отправителю. Видимость реальных личных чатов подтверждает владелец, не выдуманный отчёт агента.
4. Failed/unknown не показывают успех; cancel прекращает пересылку; числовой вопрос не вызывает калькулятор.
5. На странице поддержки нет ложных ответов, файлов и записей. Канал отделён от связи.
6. `docs/release/m0-report.md`: время, фактический buildId/URL без секретов, команды/exit, screenshot-пути, подтверждение владельца, ограничения временного relay и оставшиеся M1/M2/M3. Никакого «полный релиз».

После M0 перестать отлаживать доступ ради доступа: передать результат владельцу и перейти к единому следующему пакету. Новая фича не добавляется в M0 после его приёмки.

## 7. Оставшиеся работы до полноценного пользования — строго существующий scope

Следующие строки — не пятиминутные задачи, а последовательные пакеты. Конкретные файлы/полные узкие примеры/микрошаги уже находятся в A–I старого исполнительского плана; читать соответствующий раздел перед каждым символом. Не выполнять весь старый файл повторно.

| Очередь | Что исполнить из старого плана | Реальная приёмка |
|---|---|---|
| Q1 | A01–A05 только сверить/закрыть реально проверенное; A06–A09 — оставшиеся E2E/CI/log guards. Модули probe/private_support/transport и их тесты добавить в mandatory manifests по соответствующему stage | Missing/zero/skip/childfail → BLOCKED. Windows10 не выдавать за поддерживаемую native Playwright-платформу; E2E в одобренном Ubuntu runner |
| Q2 | C01,C02,C04: одна runtime-копия каталога и генератора, все рекомендации/замены используют правила. Затем C03 preference | Ограничения проходят через настоящий UI, а не только отдельный модуль; 1/3/7 дней и 2/3/4 приёма, стабильные слоты, честный empty pool |
| Q3 | C05,C06,C11: покупки/порции/единицы и неизвестная пищевая ценность | Замена меняет покупки; нет /10, неизвестных конверсий/цен и БЖУ «в уме» |
| Q4 | C07,C08: сквозной stop и отключение старых индивидуальных calc/plateau; закрыть все старые команды/callback/числовые входы | Реальные handlers/страницы, не только regex-модуль; новый support-flow не обходит safety и не становится медицинским ботом |
| Q5 | B01–B08: сохранение исходного тёплого визуала, safe areas, активная навигация, короткий старт и доступность | Одна идентифицированная сборка на согласованных устройствах. Максимум два согласованных цикла косметики; исправления блокеров обязательны |
| Q6 | D01–D07 и C09,C10,C12: Telegram identity, сессии/CSRF, fresh app-БД, строгие DTO, реальное сохранение/дневник/timezone/согласие на legacy | Два пользователя не видят данные друг друга; 401/403/409 не дают ложного Saved; личные записи не исчезают от тарифа; нет импортированного premium/admin |
| Q7 | D08,D09,E01–E06: опубликованный контент, закрытая админка, проверка рецептов/источников и долговечные обращения | Draft не доступен обычному пользователю; private вопросы по-прежнему только Ольге; тикет хранится и доступен после restart. E06 расширяет/заменяет M0 relay, не дублирует его |
| Q8 | E07,E08: только opt-in меню/покупки, без воды/электролитов и других новых уведомлений | Часовой пояс/тихие часы/отключение/повторы; только fake delivery в тестах |
| Q9 | G01–G05 в части free: честный gate, одобренный хостинг, backup/restore, реальные device checks и закрытый добровольческий бесплатный пилот | Это M1. Нет обязательного NOT VERIFIED, нет критических дефектов, полный полезный путь принят |
| Q10 | Только после M1 — F01–F08 + paid gate/G06 | Это M2: утверждённые продукты/Stars/условия/продавец/возвраты, серверные права, внешняя тестовая оплата с отдельным разрешением |
| Q11 | G02–G06 окончательно, исправления пилота, отдельное разрешение публичного запуска | Это M3: стабильное размещение и поддержка, проверенное восстановление, одно описание продукта/цен во всех поверхностях |

Старые рублёвые витрины не превращать в утверждённый прайс. 500–1 000 ₽ — ориентир покупателя; 80 000 ₽ чистыми — цель, не приёмка кода. Нет обещания выполнить весь объём за 5 000 ₽: смету и постоянные расходы согласовать до покупки.

**Что не добавлять:** новый stack, AI/фото/голос, анализы, медицинские протоколы, годовые планы, unlimited сопровождение, referral/rewards, новые рассылки, маркетинговый редизайн. Количество рецептов в рекламе берётся из проверенного опубликованного каталога; не подгонять тесты к случайному числу и не удалять владельческие рецепты ради 37.

## 8. Отчётность вместо потока «готово»

В `docs/release/status.md` одна таблица:

| Рубеж | Статус | Доказательство | Блокер | Следующая карточка |
|---|---|---|---|---|
| M0 | NOT RUN / IN PROGRESS / BLOCKED / ACCEPTED | buildId, внешний probe, Telegram и owner confirmation | конкретная причина | один ID |
| M1 | NOT RUN | полный free gate и реальный сценарий | — | — |
| M2 | NOT RUN | paid gate + согласованные внешние tests | — | — |
| M3 | NOT RUN | стабильный deploy/restore/анонс approval | — | — |

После пакета сообщать владельцу пять строк: что теперь реально можно сделать; что изменено; какая команда/устройство проверены; что не проверено; следующий единственный результат. Отчёт другой сессии — источник для проверки, не доказательство PASS.

Примеры scoped commit checkpoints, только после разрешения:

```bash
git add scripts/probe_entry.py tests/backend/test_probe_entry.py
git commit -m "test: verify real Mini App entry and build identity"
# Остальные checkpoints — явный список только файлов своего пакета.
```

Не включать в commit чужие правки, runtime-логи, .env, .db/.sqlite/WAL, личные ID/сообщения и artefacts с реальными данными. Если файл общий с другим writer — сверить diff и согласовать его владение до commit.

## 9. Риски и открытые решения

- Сеть/Cloudflare может блокировать M0 независимо от качества React. Две ограниченные попытки, затем конкретный блокер и решение о согласованном размещении; не бесконечная смена клиентов.
- Чужие незакоммиченные изменения продолжают появляться. Без одного writer результаты разных прогонов могут относиться к разным версиям. Обновлять snapshot, не ходить за движущимся кодом бесконечно.
- Наличие username не доказывает личность Ольги; числовой ID передан владельцем. Live private get_chat и подтверждение владельца нужны до реального вопроса. При недоступной личке канал не fallback.
- Bot API timeout не доказывает, что вопрос не дошёл. На M0 честный unknown; на M1 — долговечный ticket/outbox и явное управление повтором, без обещания exactly-once внешней доставки.
- Reply whitelist M0 в памяти — сознательное ограничение, которое обязано исчезнуть до M1. Не разворачивать это как платную круглосуточную поддержку.
- Медицинская методология/экспертиза не заменяется owner approval. Индивидуальные нутриентные цели отложены; существующие формулы не «улучшать» без согласования.
- Реальный хостинг, постоянный расходный лимит, продавец/получение вознаграждения, конечные цены и правила данных ещё требуют отдельного пакета решений. Не блокировать ими несекретный M0, но не обходить перед M1/M2.
- Нет конкретного устройства — соответствующая проверка NOT VERIFIED. Изображение/мок Telegram SDK не равны Telegram iOS/Android.

Первичные источники для операционного исполнителя:
- https://developers.cloudflare.com/tunnel/troubleshooting — 1033 и транспортные ошибки.
- https://developers.cloudflare.com/tunnel/configuration — run parameter --protocol, не отключение TLS.
- Документация установленного python-telegram-bot 22.8 / исходник ApplicationBuilder.get_updates_request: выбрать соответствующую версию, не latest API вслепую.
- https://core.telegram.org/bots — ограничения личного диалога с ботом.
- https://core.telegram.org/bots/webapps — HTTPS, launch modes и способы взаимодействия. Не использовать sendData как универсальный транспорт для любого inline Mini App.

## 10. Готовая инструкция исполнителю

> Работай в C:/Users/HP/Keto-balance. Прочитай AGENTS.md, этот файл и названные в нём локальные приложения. Сохрани чужие правки, договорись об одном writer. Не выполняй новый большой аудит/редизайн: сначала P → L → S → N и доказанный M0. Уже появившийся код проверяй, не переписывай автоматически. Операционные изменения, сообщения, commit/push/deploy и расходы — только в согласованной области. До M0 не добавляй новые функции. После M0 передай владельцу работающую кнопку и подтверждение личной доставки, а не очередной completion-report. Затем последовательно Q1–Q11 с отдельными M1/M2/M3 gates. При блокере укажи точную проверку и необходимое решение, не называй весь проект готовым.
