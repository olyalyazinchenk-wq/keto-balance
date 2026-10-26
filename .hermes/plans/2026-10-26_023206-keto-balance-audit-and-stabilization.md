# Keto Balance — аудит и план доведения до проверяемого MVP

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task. Соблюдать режим RED → GREEN → REFACTOR. Не запускать бота с реальным токеном, не принимать платежи и не отправлять сообщения без отдельного разрешения владельца.

**Goal:** Превратить существующий прототип Keto Balance в честный, безопасный и воспроизводимо проверяемый бесплатный пилот, после чего отдельно подключать персональные данные, сопровождение и коммерческий доступ.

**Architecture:** Сохранить React/Vite, Python Telegram-бота и FastAPI; не переписывать приложение и не добавлять микросервисы. Вынести только проверяемую предметную логику из `src/App.tsx`, использовать `bot_data.json` как единый каталог и явно разделить локальный пилот и будущий серверный продукт. До проверки авторизации и платёжного провайдера закрыть все пути выдачи оплаченного доступа и убрать имитацию реальных услуг.

**Tech Stack:** React 18, TypeScript, Vite 5, Tailwind; Python, python-telegram-bot, FastAPI, SQLite; Node `node:test` для чистых функций, Python `unittest`, Playwright для сквозных сценариев.

---

## 1. Контекст, ограничения и исходные факты

### Что именно проверено 26 октября 2026 года

Рабочая директория: `C:/Users/HP/Keto-balance`. Ветка `master`, HEAD `d768b73`, предыдущий коммит `ec89404`. До создания этого плана рабочее дерево чистое. В Git — **24 файла**.

Прочитаны исходники приложения, Python-модули, BAT-файлы, npm/TypeScript/Vite/Tailwind-конфигурации, `.gitignore`, HTML; каталог разобран программно. Реальные `.env`, токены, содержимое пользовательской SQLite и другие секреты не читались. `AGENTS.md`, `CLAUDE.md`, `.cursorrules` в корне и родительской директории не найдены.

Локальное окружение на момент проверки:

- Node `v26.12.1`, npm `12.0.2`, Python `3.14.9`.
- Lockfile: React `18.3.1`, Vite `5.4.21`, TypeScript `5.9.3`, plugin-react `4.7.0`.
- В текущем Python установлены python-telegram-bot `22.8`, FastAPI `0.133.1`, Pydantic `2.13.4`, uvicorn `0.41.0`, httpx `0.28.1`.
- aiogram и pytest в этом интерпретаторе не обнаружены. Это описание окружения, а не утверждение о совместимости или безопасности перечисленных версий.

**Реально выполненные read-only проверки:**

```bash
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

Результат: exit code 0, ошибок TypeScript нет. AST-разбор семи Python-файлов также успешен. Это **не** подтверждает работоспособность интерфейса, Python-импортов, оплаты или Telegram-интеграции.

Полный `npm run build` сейчас **не запускался**, поскольку он перезаписывает `dist`. Сервер и бот не запускались; действующие оплаты, webhook и Telegram не вызывались. В этом ходе разрешены только исследование и запись этого плана.

### Карта того, что уже существует

| Область | Реализовано в исходниках | Ограничение |
|---|---|---|
| Интерфейс | Анкета, 30 маршрутов, рецепты, меню, покупки, холодильник, дневник, графики, курс, программы, темы | Почти вся логика находится в `src/App.tsx` (513 очень длинных строк); много `any` |
| Контент | 37 рецептов: 21 кето и 16 карнивор; 10 советов; 15 уроков; 9 карточек программ | Карточки программ не равны отдельным реализованным программам |
| Хранение приложения | `localStorage`, ключ `kb_state_v1` | Нет миграций схемы, валидации, серверной синхронизации и полноценного удаления |
| Telegram | `bot/bot.py`: /start, /menu, /idea, /recipes, /water, /calc, /tip, /sos, /help | Локальная БД независима от браузера; часть состояния только в памяти |
| Второй бот | `telegram_bot.py` на aiogram | Старый конфликтующий вход; aiogram не установлен; иной токен и API запуска |
| База | Пользователи, расчёты, заказы, вода | Инициализируется при импорте; нет миграций/тестов; соединения не закрываются явно |
| HTTP | `/api/health`, `/api/products`, `/api/payments/webhook`, раздача `dist` | Нет авторизации и API пользовательских данных |
| Оплаты | Создание записи заказа и программное изменение статуса | Реального подтверждения провайдера нет; `live` не защищён от демоподтверждения |
| Сопровождение | Формы сообщений, документов, записи на консультацию | Сообщения и автоответы локальные, файлы не отправляются, время не бронируется |
| Распознавание этикетки | Кнопка и задержка | Результат фиксированный, изображение не анализируется |
| Подписка | Карточки, локальный флаг `premium`, замочки | Защиты контента и срока доступа нет; прямой рецепт открыт |
| Администрирование | Локальный демонстрационный экран | Доступен любому посетителю, не является серверной админкой |
| Запуск | `run_app.bat`, `run_bot.bat`, `run_server.bat` | Нет README и Python-манифеста; порт Vite 3000, URL бота по умолчанию 5173 |

### Подтверждённые дефекты и риски

| Приоритет | Место | Что обнаружено / доказательство |
|---|---|---|
| **P0** | `bot/server.py:32–39` | Webhook принимает `order_id` и строку `success` без проверки источника; поле `secret` не используется. Это доступный путь к `mark_order_paid` по чтению кода; HTTP-эксплуатация не проводилась |
| **P0** | `bot/payments.py:30–34`, `bot/bot.py:465–503` | Демоподтверждение не проверяет `PAYMENT_MODE`, владельца заказа и уже оплаченный статус |
| **P0** | `bot/server.py:45–50` | Статика строится как `DIST_DIR / full_path` без ограничения корнем; проверка пути показала, что `dist/../package.json` выходит из `dist`. HTTP-вектор требует отдельного теста маршрута/кодирования |
| **P0** | `src/App.tsx:159–173` | Аллергии вообще не участвуют в генерации. При профиле с аллергией «Яйца» получены блюда с яйцами: `k1,k2,k5,k8,k3,k4,k19,k9,k18` |
| **P0** | `src/App.tsx:389–403,427–439` | Имитация OCR и имитация ответа специалиста отображаются как фактический результат/доставка |
| **P0** | `src/App.tsx:99–100,305–317,506–509` | Срочные симптомы перечислены в константе, но недоступны для выбора; глобальная остановка рекомендаций отсутствует |
| **P1** | `src/App.tsx:159–173` | Приём пищи используется как категория рецепта. При повторе категории `Object.fromEntries` затирает блюдо. В детерминированной проверке 700 дней на режим: кето — 100 дней не с тремя приёмами; карнивор — 595, минимум один приём |
| **P1** | `src/App.tsx:175–176` | Для одной порции `k1` список выдаёт 80 г бекона, хотя рецепт рассчитан на две порции. Условная стоимость этих 80 г — 3360 ₽ из-за формулы `/10` без единиц цен |
| **P1** | `src/App.tsx:13,224,305` | UTC-дата используется как локальная; выбранный прошлый день дневника меняет «сегодня» главной; сохранённый день устаревает |
| **P1** | `src/App.tsx:146–154` | Частичный валидный JSON принимается как полное состояние; ошибка записи localStorage не обработана |
| **P1** | `src/App.tsx:296–303` | Холодильник заполняет `pantry`, покупки исключают `hasItems`; наличие продукта не синхронизировано |
| **P1** | `src/App.tsx:319–331` | «Недельный» отчёт местами считает всю историю, средние зависят от порядка вставки; графики удаляют пропуски дат |
| **P1** | `src/App.tsx:488` | `'/home'.split('/')[0]` возвращает пустую строку: активная навигация не выделяется |
| **P1** | `bot/bot.py:362–386` | Показываются только первые восемь рецептов категории без следующей страницы; пустая категория заменяется посторонними блюдами |
| **P1** | `bot/funnel.py:6–40` | Отрицательный вес, ноль и 999 принимаются функцией; проверка дала -230, 0 и 22937 ккал. Это программный дефект валидации, не клиническая оценка формулы |
| **P1** | `bot/funnel.py:59–70`, `bot/bot.py:120–135` | Имя и строки каталога подставляются в Telegram HTML без экранирования |
| **P1** | `src/App.tsx:137–142,238,442`, `bot/config.py:43–65` | В приложении Мария, в боте Ольга; цены 390/4900 против 1900/15000; сведения о дипломах/отзывах не подтверждены |
| **P1** | `bot/database.py:11–14,168–169` | Импорт создаёт реальную БД; контекст `with sqlite3.Connection` не является явным закрытием соединения |
| **P2** | `src/App.tsx:22–60`, `bot_data.json` | Рецепты и советы продублированы; сейчас JSON-сравнение показало полное совпадение |
| **P2** | `src/App.tsx:242`, каталог | Метки/фильтры расходятся: `k14`, `k15` названы «без молочных», хотя есть топлёное масло. Метка «без яиц» у `k4` противоречит яйцам в составе |
| **P2** | Репозиторий | Нет тестов, CI, README, Python-зависимостей; версии 0.1.0 и 0.9 MVP расходятся |

**Не доказано и не следует утверждать:** что реальный бот сейчас запущен; что HTTPS-развёртывание работает; что реальные деньги когда-либо списывались; что данные участников уже утекли; что файлы `dist` соответствуют HEAD; что имеются резервные копии; что противопоказания и заявленные медицинские механизмы прошли экспертную проверку.

## 2. Предлагаемое решение и границы

### Релиз A — безопасный локальный бесплатный пилот (этот исполнимый план)

1. Закрыть все платёжные подтверждения, побочные эффекты импортов и выход статики за корень.
2. Сделать честными недоступные функции: никакого выдуманного OCR, доставки сообщений, записи на приём, защищённой админки и активной подписки.
3. Исправить генерацию меню, ограничения профиля, покупки, даты и восстановление локального состояния.
4. Исправить основные сценарии бота и добавить воспроизводимые тесты и инструкции.
5. Пройти сборку и сквозной прогон без подключения реальных аккаунтов.

**В пилоте все 37 рецептов доступны бесплатно.** Это осознанное решение, а не попытка защитить встроенный клиентский JSON замочком. `premium` в localStorage не считается полномочием. Рецепты нельзя обещать как безопасные при аллергии только по неполному каталогу; предупреждать о проверке состава и замен, не давать гарантий отсутствия следов аллергенов.

### Не делать в релизе A

- Не подключать реальные оплаты, внешнюю CRM, LLM, OCR, push, CDN и загрузку анализов.
- Не переносить локальный дневник на сервер без согласованной модели доступа/согласия/удаления.
- Не мигрировать React, роутер, Tailwind или БД ради красоты.
- Не выдумывать личность специалиста, образование, отзывы, цены, расписание и лечебные обещания.
- Не добавлять MAX-интеграцию: текущий код относится к Telegram. Решение о MAX принимается владельцем отдельно.
- Не удалять реальные БД, `.env`, историю Git, старые пользовательские данные и существующий `dist` до резервирования.

## 3. Порядок исполнения и правило маленьких шагов

Ниже каждая секция — вертикальный срез. **Каждый нумерованный шаг внутри секции — отдельная задача на 2–5 минут:** один тест, одна команда RED, одно небольшое изменение, один GREEN. Если шаг не укладывается, разделить его по отдельным тест-кейсам, не расширять область изменений.

До работы: `git status --short`, `git branch --show-current`, прочитать этот план. Создание рабочей ветки и коммиты — **только в ходе реализации и после разрешения владельца**. Если разрешения на коммиты нет, оставить изменения незакоммиченными и передать diff. Команды commit ниже — предусмотренные контрольные точки, не разрешение выполнить их в PLAN MODE.

После каждого среза:

```bash
npm test
python -B -m unittest discover -s tests/backend -p 'test_*.py' -v
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

Ожидание: все уже введённые тесты зелёные, TypeScript exit 0. В начале, пока каталоги тестов ещё не заведены, запускать только существующий набор, не выдавать отсутствие тестов за успех.

---

## 4. Задачи релиза A

### A01. Завести минимальный JS-раннер без новых unit-зависимостей

**Файлы:** создать `tests/helpers/load-ts.mjs`, `tests/frontend/harness.test.mjs`; изменить `package.json`.

1. **RED:** создать `tests/frontend/harness.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
test('loads a TypeScript module without writing compiled files', () => {
  assert.equal(typeof loadTs, 'function');
});
```

Команда: `node --test tests/frontend/harness.test.mjs`. Ожидание RED: отсутствует `tests/helpers/load-ts.mjs`.

2. **GREEN:** создать полный `tests/helpers/load-ts.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

export function loadTs(file, cache = new Map()) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} };
  cache.set(absolute, module);
  const nativeRequire = createRequire(absolute);
  const require = (name) => {
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(absolute), name);
      for (const candidate of [base, `${base}.ts`]) {
        if (fs.existsSync(candidate) && candidate.endsWith('.ts')) {
          return loadTs(candidate, cache);
        }
      }
    }
    return nativeRequire(name);
  };
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(output, {
    module, exports: module.exports, require, Date, Math, console,
  }, { filename: absolute });
  return module.exports;
}
```

Этот helper служит только unit-тестам чистых `.ts`-модулей. Проверку типов отдельно выполняет `tsc`; TSX проверяется в браузере, не через VM.

3. Добавить в `package.json.scripts`:

```json
"test": "node --test --test-reporter=spec tests/frontend/*.test.mjs",
"typecheck": "tsc --noEmit --incremental false --pretty false"
```

4. Проверить `npm test`: один проходящий тест. Контрольная точка: `git add package.json tests/helpers/load-ts.mjs tests/frontend/harness.test.mjs && git commit -m "test: add non-emitting frontend unit harness"`.

### A02. Сделать импорт БД безопасным и закрывать соединения

**Файлы:** изменить `bot/database.py`, `bot/bot.py`; создать `tests/backend/test_database.py`.

1. **RED:** создать тест:

```python
import pathlib
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

class DatabaseTests(unittest.TestCase):
    def test_import_does_not_initialize_database(self):
        import ast
        tree = ast.parse(pathlib.Path('bot/database.py').read_text(encoding='utf-8'))
        calls = [n for n in tree.body if isinstance(n, ast.Expr)
                 and isinstance(n.value, ast.Call)
                 and isinstance(n.value.func, ast.Name)
                 and n.value.func.id == 'init_db']
        self.assertEqual(calls, [])

    def test_connection_is_closed_after_context(self):
        from bot import database
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(database, 'DB_PATH', pathlib.Path(folder) / 'test.db'):
                with database.get_db() as connection:
                    connection.execute('SELECT 1')
                with self.assertRaises(sqlite3.ProgrammingError):
                    connection.execute('SELECT 1')
```

**Важно:** сначала запускать только AST-тест по фильтру `-k`: он не импортирует текущий `database` и не создаёт настоящую БД. Второй тест запускается после удаления побочного вызова. Это два отдельных TDD-цикла.

2. Команда первого RED: `python -B -m unittest discover -s tests/backend -p test_database.py -k import_does_not_initialize -v`. Ожидание: FAIL по верхнеуровневому `init_db()`; БД не создаётся.

3. Удалить последние две строки с инициализацией из `bot/database.py`; добавить `init_db` к импортам БД в `bot/bot.py` и вызывать в `main()` **после** проверки токена, **до** создания Application. В `bot/server.py` в следующей задаче импорт БД будет полностью удалён.

4. Второй RED: проверка закрытия соединения не проходит. Реализация вместо текущего `get_db`:

```python
from contextlib import contextmanager

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()
```

5. GREEN: оба теста проходят; импорт теперь не создаёт файл. Не трогать существующую БД. Commit: `fix: remove database import side effects and close connections` с явным `git add bot/database.py bot/bot.py tests/backend/test_database.py`.

### A03. Закрыть webhook и ограничить статические файлы корнем dist

**Файлы:** изменить `bot/server.py`; создать `tests/backend/test_server.py`.

1. **RED:** добавить полный тест. До изменения фабрики первый запуск даст ожидаемый отсутствующий `create_app`; после добавления пустой фабрики проверить именно нарушения поведения отдельными методами.

```python
import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import pathlib
import tempfile
import unittest
from fastapi.testclient import TestClient
from bot.server import create_app

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        (self.dist / 'index.html').write_text('<h1>PILOT</h1>', encoding='utf-8')
        (self.root / 'private.txt').write_text('PRIVATE_SENTINEL', encoding='utf-8')
        self.client = TestClient(create_app(self.dist))

    def test_webhook_cannot_mark_any_order_paid(self):
        response = self.client.post('/api/payments/webhook',
                                    json={'order_id': 'kb_example', 'status': 'success'})
        self.assertEqual(response.status_code, 503)

    def test_parent_path_is_not_served(self):
        response = self.client.get('/%2e%2e%2fprivate.txt')
        self.assertNotEqual(response.status_code, 200)
        self.assertNotIn('PRIVATE_SENTINEL', response.text)

    def test_unknown_api_does_not_return_spa(self):
        self.assertEqual(self.client.get('/api/unknown').status_code, 404)

    def test_missing_asset_does_not_return_spa(self):
        self.assertEqual(self.client.get('/missing.js').status_code, 404)

    def test_spa_route_works_without_assets_directory(self):
        response = self.client.get('/some-client-route')
        self.assertEqual(response.status_code, 200)
        self.assertIn('PILOT', response.text)

    def test_health_without_frontend_build(self):
        client = TestClient(create_app(self.root / 'absent'))
        self.assertEqual(client.get('/api/health').status_code, 200)
        self.assertEqual(client.get('/').status_code, 503)
```

2. `python -B -m unittest discover -s tests/backend -p test_server.py -v` — RED.

3. Заменить `bot/server.py` целиком:

```python
"""Keto Balance — API и безопасная раздача бесплатного пилота."""
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
from bot.config import PRODUCTS

DIST_DIR = Path(__file__).resolve().parent.parent / 'dist'

def create_app(dist_dir: Path = DIST_DIR) -> FastAPI:
    app = FastAPI(title='Keto Balance Pilot')
    root = Path(dist_dir).resolve()

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'app': 'Keto Balance', 'version': '0.1.0'}

    @app.get('/api/products')
    def products():
        return {'enabled': False, 'products': PRODUCTS}

    @app.post('/api/payments/webhook')
    def payment_webhook():
        raise HTTPException(status_code=503, detail='Payments are disabled')

    assets = root / 'assets'
    if assets.is_dir():
        app.mount('/assets', StaticFiles(directory=str(assets)), name='assets')

    @app.get('/{full_path:path}')
    def spa(full_path: str):
        if full_path == 'api' or full_path.startswith('api/'):
            raise HTTPException(status_code=404, detail='Not found')
        target = (root / full_path).resolve()
        if not target.is_relative_to(root):
            raise HTTPException(status_code=404, detail='Not found')
        if target.is_file():
            return FileResponse(target)
        if Path(full_path).suffix:
            raise HTTPException(status_code=404, detail='Not found')
        index = root / 'index.html'
        if not index.is_file():
            raise HTTPException(status_code=503, detail='Mini App is not built')
        return FileResponse(index)

    return app

app = create_app()

def main():
    uvicorn.run(app, host='127.0.0.1', port=8000)

if __name__ == '__main__':
    main()
```

Привязка к localhost выбрана намеренно. Публичный listen/TLS/reverse proxy — отдельная задача после согласования хостинга.

4. В `bot/config.py` заменить условие загрузки `.env` на `if os.getenv('KETO_LOAD_DOTENV', '1') == '1' and ENV_PATH.exists():`. Это позволяет тестам не читать реальные секреты; `.env` и его значения не редактировать и не выводить.

5. GREEN: шесть тестов проходят; добавить отдельные варианты `%2e%2e%5cprivate.txt` и `assets/../../private.txt`, ожидая отсутствие sentinel (клиент может нормализовать путь; проверять и статус, и тело). Commit: `fix: disable payment webhook and confine static responses`.

### A04. Отключить создание/подтверждение платежей и ложную выдачу тарифа

**Файлы:** `bot/payments.py`, `bot/bot.py`, `bot/config.py`; создать `tests/backend/test_payments.py`.

1. **RED:**

```python
import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import unittest
from unittest.mock import patch
from bot import payments

class PaymentTests(unittest.TestCase):
    def test_purchase_disabled_for_every_mode(self):
        for mode in ('disabled', 'demo', 'live'):
            with self.subTest(mode=mode):
                with patch.dict(os.environ, {'PAYMENT_MODE': mode}):
                    with self.assertRaises(RuntimeError):
                        payments.init_purchase(123, 'sub_month')

    def test_legacy_demo_confirmation_disabled(self):
        with self.assertRaises(RuntimeError):
            payments.complete_demo_payment('kb_example')
```

Первый RED текущего `init_purchase` может упасть на отсутствии таблицы вместо нужного RuntimeError. Для него временно подменить `payments.create_order` через `patch.object(..., return_value=None)` и убедиться, что FAIL именно «RuntimeError not raised». После следующего изменения убрать эту подмену: запрещённый путь вообще не должен иметь зависимости на БД.

2. Минимальная полная замена `bot/payments.py`:

```python
"""Платежи отключены до реализации проверяемого провайдера и прав доступа."""
def init_purchase(user_id: int, product_id: str):
    raise RuntimeError('Payments are disabled')

def complete_demo_payment(order_id: str):
    raise RuntimeError('Payments are disabled')
```

3. В `bot/config.py` default `PAYMENT_MODE` заменить на `disabled`. В `bot/bot.py` удалить импорт двух функций. Заменить целиком ветви `buy_` и `confirm_demo_` одной ветвью:

```python
    elif data.startswith(('buy_', 'confirm_demo_')):
        await query.edit_message_text(
            'ℹ️ Покупки временно недоступны. Деньги не списываются. '
            'Бесплатный пилот не требует подписки.',
            reply_markup=get_main_keyboard(),
        )
```

4. `tariffs` должен показывать только «Пилот бесплатный; коммерческие тарифы не подключены» и кнопку назад; `get_plateau_keyboard()` — только назад, без покупки. Сохранить старые callback-предикаты как безопасный ответ для старых сообщений. Не удалять записи заказов из настоящей БД. Не считать прежние boolean-флаги подтверждённой оплатой.

5. GREEN: `test_payments.py` проходит; тест callback через `IsolatedAsyncioTestCase`/`AsyncMock` для `buy_sub_month`, `confirm_demo_kb_example` подтверждает ответ и отсутствие обращения к БД. Commit: `fix: fail closed on all legacy payment paths`.

### A05. Единый каталог и точные типы

**Файлы:** создать `src/domain/types.ts`, `src/data/catalog.ts`, `tests/frontend/catalog.test.mjs`; изменить `src/App.tsx`.

1. **RED:** тест `catalog.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTs } from '../helpers/load-ts.mjs';
test('frontend and bot share one complete catalog', () => {
  const expected = JSON.parse(fs.readFileSync('bot_data.json', 'utf8'));
  const actual = loadTs('src/data/catalog.ts');
  assert.equal(JSON.stringify(actual.RECIPES), JSON.stringify(expected.recipes));
  assert.equal(JSON.stringify(actual.TIPS), JSON.stringify(expected.tips));
  assert.equal(actual.RECIPES.length, 37);
  assert.equal(new Set(actual.RECIPES.map(r => r.id)).size, 37);
});
```

2. Перенести тип `Recipe` из `src/App.tsx:6` в `src/domain/types.ts`, добавить `export`. Тип `Mode` оставить в App или экспортировать из того же файла. Создать `src/data/catalog.ts`:

```ts
import data from '../../bot_data.json';
import type { Recipe } from '../domain/types';
export const RECIPES = data.recipes as unknown as Recipe[];
export const TIPS: string[] = data.tips;
```

3. В App добавить импорты `RECIPES,TIPS` и `Recipe`; удалить **только** массивы `RECIPES` и `TIPS` и старое определение Recipe. `FOODS`, `MODE_INFO`, уроки и прочие константы пока не трогать. Двойное приведение типов допустимо только здесь: структуру JSON закрывает следующий тест.

4. Вторым TDD-циклом добавить проверки каждого рецепта: `id,title,mode,cat`, массив `g` длиной 2; непустые `ing`, `steps`; каждая пара `ing` — две непустые строки; конечные неотрицательные `kcal,p,f,nc,time`; целое `serv >= 1`; допустимые категории `breakfast,lunch,dinner,snack,dessert,prep`; `subs` — объект. Это тест имеющегося контракта; если он сразу проходит, записать как baseline, не притворяться, что был RED.

5. `npm test && npm run typecheck` — GREEN. Commit: `refactor: share recipe catalog between app and bot`.

### A06. Единый фильтр ограничений профиля

**Файлы:** создать `src/domain/eligibility.ts`, `tests/frontend/eligibility.test.mjs`.

1. **RED:** добавить тест:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
const { RECIPES } = loadTs('src/data/catalog.ts');
test('eggs, dairy, fish and grouped dislikes are actually excluded', () => {
  const { isRecipeAllowed } = loadTs('src/domain/eligibility.ts');
  const r = id => RECIPES.find(x => x.id === id);
  assert.equal(isRecipeAllowed(r('k2'), { allergies: ['Яйца'] }), false);
  assert.equal(isRecipeAllowed(r('k14'), { allergies: ['Молочные продукты'] }), false);
  assert.equal(isRecipeAllowed(r('c6'), { allergies: ['Рыба'] }), false);
  assert.equal(isRecipeAllowed(r('k11'), { disliked: ['Грибы'] }), false);
  assert.equal(isRecipeAllowed(r('c5'), { disliked: ['Печень и субпродукты'] }), false);
  assert.equal(isRecipeAllowed(r('k4'), { disliked: ['Авокадо'] }), false);
  assert.equal(isRecipeAllowed(r('k2'), { allergyNote: 'цитрусовые' }), false);
  assert.equal(isRecipeAllowed(r('k2'), { cookTime: 15, budget: 'эконом' }), true);
  assert.equal(isRecipeAllowed(r('c1'), { budget: 'эконом' }), false);
  assert.equal(isRecipeAllowed(r('c7'), { cookTime: 30 }), false);
});
```

2. Полная реализация `src/domain/eligibility.ts`:

```ts
import type { Recipe } from './types';
export type Preferences = {
  allergies?: string[]; disliked?: string[]; allergyNote?: string;
  budget?: string; cookTime?: number; prep?: boolean | null;
};
const norm = (s: string) => s.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
const groups: Record<string, string[]> = {
  'яйца': ['яйц'],
  'молочные продукты': ['молок', 'сыр', 'слив', 'сметан', 'творог', 'моцарелл', 'топленое масло'],
  'рыба': ['рыб', 'семг', 'лосос', 'скумбр', 'горбуш', 'тун', 'треск'],
  'орехи': ['орех', 'миндал', 'фундук', 'кешью', 'пекан', 'фисташ'],
  'грибы': ['гриб', 'шампиньон'],
  'печень и субпродукты': ['печен', 'серд', 'субпродукт', 'костный бульон'],
  'морепродукты': ['кревет', 'мид', 'кальмар', 'краб', 'устриц'],
};
export function isRecipeAllowed(r: Recipe, p: Preferences = {}): boolean {
  if ((p.allergyNote || '').trim()) return false;
  const blocked = [...(p.allergies || []), ...(p.disliked || [])];
  const ingredients = r.ing.map(([name]) => norm(name));
  if (blocked.some(label => {
    const tokens = groups[norm(label)] || [norm(label)];
    return ingredients.some(name => tokens.some(token => name.includes(token)));
  })) return false;
  if (p.budget === 'эконом' && r.cost > 1) return false;
  if (p.budget === 'средний' && r.cost > 2) return false;
  const limit = Number(p.cookTime || 0);
  if (limit > 0 && limit < 60 && r.time > limit) return false;
  return true;
}
```

3. Непустая свободная аллергия намеренно **останавливает автоматический подбор**, а не «угадывает» аллерген. UI должен объяснять это и оставлять просмотр каталога без обещания безопасности. Группы применяются к ингредиентам, не к маркетинговым tags; замену ингредиентов алгоритм не выполняет.

4. GREEN: `npm test`. Отдельно пройти все восемь значений disliked из анкеты и четыре категории аллергий. Commit: `feat: enforce explicit profile constraints in recipe selection`.

### A07. Генератор со стабильными слотами, без исчезновения блюд

**Файлы:** создать `src/domain/menu.ts`, `tests/frontend/menu.test.mjs`; изменить wrapper `genMenu` в `src/App.tsx`.

1. **RED:**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
const { RECIPES } = loadTs('src/data/catalog.ts');
test('seven carnivore days always preserve three requested meal slots', () => {
  const { generateMenu } = loadTs('src/domain/menu.ts');
  const menu = generateMenu(RECIPES, {
    mode: 'carnivore', numDays: 7, meals: 3, profile: {},
    today: new Date(2026, 9, 26, 12), random: () => 0,
  });
  for (const day of menu.days) {
    assert.equal(Object.keys(day.slots).join(','), 'breakfast,lunch,dinner');
    assert.equal(new Set(Object.values(day.slots)).size, 3);
  }
});
test('does not silently relax allergies when no recipes remain', () => {
  const { generateMenu } = loadTs('src/domain/menu.ts');
  assert.throws(() => generateMenu(RECIPES, {
    mode: 'keto', numDays: 1, meals: 3,
    profile: { allergyNote: 'индивидуальная реакция' },
  }), /Нет подходящих/);
});
```

2. Полная реализация:

```ts
import type { Recipe } from './types';
import { isRecipeAllowed, type Preferences } from './eligibility';
export type Menu = {
  mode: string; meals: number; portion: number; saved: boolean; created: number;
  days: { date: string; slots: Record<string, string> }[];
};
type Options = {
  mode: string; numDays: number; meals: number; profile?: Preferences;
  today?: Date; random?: () => number;
};
const dateKey = (d: Date) => [d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
export function generateMenu(recipes: Recipe[], options: Options): Menu {
  const { mode, numDays, meals, profile = {}, today = new Date(), random = Math.random } = options;
  if (!['keto', 'carnivore'].includes(mode) || ![1, 3, 7].includes(numDays)
      || ![2, 3, 4].includes(meals)) throw new Error('Некорректные параметры меню');
  const eligible = recipes.filter(r => r.mode === mode && isRecipeAllowed(r, profile));
  if (eligible.length < meals) throw new Error('Нет подходящих блюд для всех приёмов пищи. Проверьте ограничения.');
  const slots = meals === 2 ? ['breakfast', 'dinner']
    : meals === 3 ? ['breakfast', 'lunch', 'dinner'] : ['breakfast', 'lunch', 'dinner', 'snack'];
  const days: Menu['days'] = [];
  const counts = new Map<string, number>();
  for (let dayIndex = 0; dayIndex < numDays; dayIndex++) {
    const selected = new Set<string>();
    const result: Record<string, string> = {};
    for (const slot of slots) {
      const available = eligible.filter(r => !selected.has(r.id));
      const preferred = available.filter(r => slot === 'snack'
        ? ['snack', 'dessert'].includes(r.cat) : r.cat === slot);
      const candidates = preferred.length ? preferred : available;
      const least = Math.min(...candidates.map(r => counts.get(r.id) || 0));
      const balanced = candidates.filter(r => (counts.get(r.id) || 0) === least);
      const prep = profile.prep ? balanced.filter(r => r.make || r.batch) : [];
      const pool = prep.length ? prep : balanced;
      const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
      const recipe = pool[index];
      result[slot] = recipe.id;
      selected.add(recipe.id);
      counts.set(recipe.id, (counts.get(recipe.id) || 0) + 1);
    }
    const date = new Date(today);
    date.setDate(date.getDate() + dayIndex);
    days.push({ date: dateKey(date), slots: result });
  }
  return { mode, meals, portion: 1, saved: false, created: Date.now(), days };
}
```

3. В App импортировать `generateMenu`. Заменить старую `genMenu` полным wrapper:

```ts
function genMenu(mode: string, numDays: number, meals: number) {
  return generateMenu(RECIPES, { mode, numDays, meals, profile: P() });
}
```

4. Вторым RED/GREEN циклом проверить все сочетания `keto/carnivore × 1/3/7 дней × 2/3/4 приёма`, валидные даты, отсутствие повторов в один день и запрещённых ингредиентов. Слоты теперь означают **приём пищи**, а `recipe.cat` — категорию; отображение CATR продолжает работать по слоту.

5. Удалить неиспользуемый `pool` только если на него нет вызовов. `npm test && npm run typecheck` — GREEN. Commit: `fix: preserve every meal slot and honor selection constraints`.

### A08. Обработать отказ подбора и закрыть обход ограничений через замену

**Файлы:** `src/App.tsx` (`Onboarding`, `MenuPage`, `ProgramsPage`, `BuilderPage`, `FridgePage`); создать `tests/frontend/replacement.test.mjs`; дополнить `src/domain/menu.ts`.

1. **RED:** тестировать новую функцию `replacementCandidates`: кето-рецепт `k2`, исключение текущих id, аллергия на яйца, отсутствие подходящих блюд возвращает `[]`.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
test('replacement cannot bypass allergy restrictions', () => {
  const { RECIPES } = loadTs('src/data/catalog.ts');
  const { replacementCandidates } = loadTs('src/domain/menu.ts');
  const result = replacementCandidates(RECIPES, 'keto', 'breakfast', ['k2'], { allergies: ['Яйца'] });
  assert.equal(result.some(r => r.id === 'k2'), false);
  assert.equal(result.some(r => r.ing.some(([n]) => n.includes('Яйца'))), false);
});
```

2. Реализация:

```ts
export function replacementCandidates(
  recipes: Recipe[], mode: string, slot: string, occupied: string[], profile: Preferences,
): Recipe[] {
  const available = recipes.filter(r => r.mode === mode
    && !occupied.includes(r.id) && isRecipeAllowed(r, profile));
  const preferred = available.filter(r => slot === 'snack'
    ? ['snack', 'dessert'].includes(r.cat) : r.cat === slot);
  return preferred.length ? preferred : available;
}
```

3. В `MenuPage` обработчик замены вместо текущего `pool2` использует эту функцию; при пустом списке — `setToast('Подходящей замены нет: ограничения сохранены')`; иначе меняет слот и вызывает emit. Не ставить `r.cat` вместо выбранного slot.

4. Защитить три места генерации:

- `MenuPage.gen`: в timeout обернуть `genMenu` в try/catch/finally; при ошибке `setToast(error.message)`, **не изменять** старые menu/shopping; finally `setLoading(false)`.
- `ProgramsPage`: вычислять `const menu = genMenu(...)` до `setSt`; catch `alert(error.message)` и return; без ложного перехода при ошибке. Карточки переименовать «Примеры подборок», убрать обещания отдельной программы и ограничения Premium, пока алгоритм у всех один.
- `Onboarding`: при `explore` не навязывать кето-меню; выставить `onboarded=true,menu=null,shopping={items:[],checked:{}}`. Для выбранного питания попытаться создать меню; при отказе завершить анкету с menu=null, объяснить причину через alert, разрешить каталог. Финальная фраза анкеты: «Анкета сохранена. Если ограничения позволяют, подготовим пример меню» — не утверждать заранее, что меню уже собрано.

5. `BuilderPage.list`, `FridgePage.suggestions` и `HomePage.sug` фильтровать через `isRecipeAllowed(r, st.profile)`; для Home при пустом списке показать «Нет автоматических предложений по текущим ограничениям» вместо чтения `sug.id`. Обычный каталог сохраняется для самостоятельного просмотра с заметным предупреждением; рецепты не объявляются одобренными при аллергии.

6. Интеграционный тест A17 обязательно проверяет все три входа. Commit: `fix: keep profile restrictions across all automatic suggestions`.

### A09. Правильные количества, единицы и отсутствие выдуманной стоимости

**Файлы:** создать `src/domain/shopping.ts`, `tests/frontend/shopping.test.mjs`; изменить `src/App.tsx`.

1. **RED:**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
const { RECIPES } = loadTs('src/data/catalog.ts');
test('one portion uses half of a two-serving recipe', () => {
  const { aggregateIngredients } = loadTs('src/domain/shopping.ts');
  const menu = { portion: 1, days: [{ slots: { breakfast: 'k1' } }] };
  const bacon = aggregateIngredients(menu, RECIPES).find(x => x.name === 'Бекон');
  assert.equal(bacon.qty, 40);
  assert.equal(bacon.unit, 'г');
  assert.equal(bacon.cost, null);
});
test('normalizes kilograms and keeps unknown quantities textual', () => {
  const { parseAmount } = loadTs('src/domain/shopping.ts');
  assert.equal(JSON.stringify(parseAmount('1,5 кг', 1)), '{"qty":1500,"unit":"г","text":null}');
  assert.equal(parseAmount('по вкусу', 0.5).qty, null);
});
```

2. Полная реализация:

```ts
import type { Recipe } from './types';
type Amount = { qty: number | null; unit: string; text: string | null };
export function parseAmount(raw: string, multiplier: number): Amount {
  const value = raw.trim();
  const match = value.match(/^(\d+(?:[.,]\d+)?)\s*(г|кг|мл|л|шт|ст\.\s*л\.|банка|банки|ножки|стейка)$/u);
  if (!match) return { qty: null, unit: '', text: value };
  const unit = match[2].replace(/\s+/g, ' ');
  const factor = unit === 'кг' || unit === 'л' ? 1000 : 1;
  return { qty: Number(match[1].replace(',', '.')) * multiplier * factor,
    unit: unit === 'кг' ? 'г' : unit === 'л' ? 'мл' : unit, text: null };
}
export function aggregateIngredients(menu: any, recipes: Recipe[]) {
  const map = new Map<string, { name: string; qty: number | null; unit: string;
    text: string | null; cost: null }>();
  for (const day of menu.days) {
    for (const id of Object.values(day.slots)) {
      const recipe = recipes.find(r => r.id === id);
      if (!recipe) continue;
      const multiplier = Number(menu.portion || 1) / recipe.serv;
      for (const [name, raw] of recipe.ing) {
        const amount = parseAmount(raw, multiplier);
        const key = `${name}|${amount.unit}|${amount.text || ''}`;
        const old = map.get(key);
        if (old && old.qty !== null && amount.qty !== null) old.qty += amount.qty;
        else if (!old) map.set(key, { name, ...amount, cost: null });
      }
    }
  }
  return [...map.values()];
}
export function formatAmount(item: { qty: number | null; unit: string; text?: string | null }) {
  return item.qty === null ? (item.text || 'уточнить количество')
    : `${Number(item.qty.toFixed(2))} ${item.unit}`.trim();
}
```

Не преобразовывать ложки в граммы без плотности, яйца в граммы, банки в миллилитры. Для дробных штук показывать точное расчетное количество; округление закупки упаковками будет отдельной функцией с известными размерами упаковки.

3. App: `menuIng` заменить `return aggregateIngredients(menu, RECIPES)`. В `MenuPage`, `ShoppingPage`, share-тексте заменить все `qty.toFixed(...) + unit` на `formatAmount(item)`. Строки условной цены убрать; `cost=null` означает «стоимость не рассчитана», а не 0 ₽.

4. `RecipePage.addShop` должен пользоваться `aggregateIngredients({portion:1,days:[{slots:{selected:r.id}}]}, RECIPES)` и объединять позиции по `name+unit+text`; не push-ить дубликаты. Создать `mergeShoppingItems(existing, incoming)` в этом модуле: сохранить id и checked существующих, суммировать одинаковые числовые единицы, текстовые не дублировать; новые id создавать только в UI через существующий uid. Тест RED: два добавления k1 → бекон 80 г одной строкой, г и ст. л. не смешиваются. Полная реализация для `src/domain/shopping.ts`:

```ts
export function mergeShoppingItems(existing: any[], incoming: any[], makeId: () => string) {
  const result: any[] = [];
  const byKey = new Map<string, any>();
  for (const item of [...existing, ...incoming]) {
    const key = `${item.name}|${item.unit || ''}|${item.text || ''}`;
    const previous = byKey.get(key);
    if (previous) {
      if (typeof previous.qty === 'number' && typeof item.qty === 'number') {
        previous.qty += item.qty;
      }
      continue;
    }
    const next = { ...item, id: item.id || makeId(), cost: null, custom: !!item.custom };
    result.push(next);
    byKey.set(key, next);
  }
  return result;
}
```

Точная интеграция `RecipePage.addShop`:

```tsx
const addShop = () => {
  const incoming = aggregateIngredients({ portion: 1,
    days: [{ slots: { selected: r.id } }] }, RECIPES)
    .filter(item => !store.pantry.includes(item.name));
  setSt(s => { s.shopping.items = mergeShoppingItems(s.shopping.items, incoming, uid); });
  checkAch();
  emit();
  setToast('Ингредиенты добавлены в список покупок 🛒');
};
```

`shoppingItems` заменить полностью:

```ts
function shoppingItems(menu: any) {
  const items = aggregateIngredients(menu, RECIPES)
    .filter(item => !store.pantry.includes(item.name));
  return mergeShoppingItems([], items, uid);
}
```

5. `BuilderPage` «недостающее в список» брать точные ингредиенты выбранного рецепта через aggregateIngredients, не qty=1 шт. `BudgetPage` переименовать «Учебный пример бюджета» и пометить расчёт демонстрационным, не связывать с реальной корзиной. Полноценные цены появятся только после определения единиц, региона и источника.

6. GREEN: `npm test`, `npm run typecheck`. Commit: `fix: scale shopping quantities by recipe servings`.

### A10. Одно понятие «уже есть дома» и одна локальная дата

**Файлы:** создать `src/domain/dates.ts`, `tests/frontend/dates.test.mjs`; изменить `src/App.tsx`.

1. **RED:**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
test('date follows local calendar rather than UTC', () => {
  const { localDay, recentDays } = loadTs('src/domain/dates.ts');
  assert.equal(localDay(new Date(2026, 9, 26, 0, 30)), '2026-10-26');
  assert.equal(recentDays(3, new Date(2026, 10, 1, 12)).join(','),
    '2026-10-30,2026-10-31,2026-11-01');
});
```

2. Реализация:

```ts
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function recentDays(count: number, today = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - count + 1 + i);
    return localDay(date);
  });
}
```

3. В `menu.ts` удалить локальный dateKey, импортировать `localDay`; использовать его. В App заменить `dayISO` на `const dayISO = localDay;`, импортировать localDay/recentDays. `HomePage.today` — `localDay()`, не st.day. Поле `st.day` остаётся только выбранной датой дневника. При открытии страницы дневника выбирать сегодня, если сохранённая дата вне отображаемых семи дней; историческую дату не переносить на главную.

4. В App добавить эффект с минутным таймером, который вызывает локальный `setState` для обновления даты после полуночи; cleanup clearInterval обязателен. **Не** менять выбранный исторический день пользователя таймером. Тестировать Playwright clock в A17; проверка должна перейти с 23:59 на 00:01 без перезагрузки.

5. В shoppingItems/addShop использовать `store.pantry`, исключить `store.hasItems`. При загрузке старого состояния сделать объединение `pantry` и `hasItems` с дедупликацией; после миграции `hasItems` больше не использовать. В холодильнике выбранные названия должны совпадать с каталогом; свободный ввод остаётся строкой и не считается автоматическим совпадением с неизвестным синонимом.

6. GREEN: `TZ=Europe/Moscow npm test` и `TZ=America/New_York npm test`. Commit: `fix: use local calendar days and one pantry source`.

### A11. Миграция localStorage, ошибка записи и полное локальное удаление

**Файлы:** создать `src/domain/storage.ts`, `tests/frontend/storage.test.mjs`; изменить store-блок в `src/App.tsx`.

1. RED — три независимых цикла: (а) повреждённый JSON → defaults; (б) валидный частичный JSON → defaults + проверенные поля; (в) Storage.setItem throws → приложение остаётся работоспособным и сообщает об ошибке.

Минимальный тест для (б):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
test('repairs partial legacy state and migrates pantry', () => {
  const { normalizeStore } = loadTs('src/domain/storage.ts');
  const defaults = { profile: { name: '', mode: '', allergies: [], disliked: [] },
    pantry: [], diary: {}, shopping: { items: [], checked: {} }, accent: 'sage',
    theme: 'light', onboarded: false, premium: false, fav: {}, menu: null };
  const result = normalizeStore({ profile: { name: 'Анна' }, hasItems: ['Яйца'] }, defaults);
  assert.equal(result.profile.name, 'Анна');
  assert.equal(Array.isArray(result.profile.allergies), true);
  assert.equal(result.pantry.join(','), 'Яйца');
  assert.equal(result.premium, false);
});
```

2. Реализация helper:

```ts
type Dict = Record<string, any>;
const record = (x: any): x is Dict => !!x && typeof x === 'object' && !Array.isArray(x);
export function normalizeStore(raw: unknown, defaults: Dict): Dict {
  const out = structuredClone(defaults);
  if (!record(raw)) return out;
  for (const [key, value] of Object.entries(defaults)) {
    const input = raw[key];
    if (input === undefined) continue;
    if (Array.isArray(value)) {
      if (Array.isArray(input)) out[key] = input;
    } else if (record(value)) {
      if (record(input)) out[key] = { ...value, ...input };
    } else if (value === null || typeof input === typeof value) out[key] = input;
  }
  out.profile = { ...defaults.profile, ...(record(raw.profile) ? raw.profile : {}) };
  out.profile.name = typeof out.profile.name === 'string' ? out.profile.name : '';
  out.profile.mode = ['keto', 'carnivore', 'explore', ''].includes(out.profile.mode) ? out.profile.mode : '';
  for (const key of ['allergies', 'disliked']) {
    out.profile[key] = Array.isArray(out.profile[key])
      ? out.profile[key].filter((x: any) => typeof x === 'string') : [];
  }
  const legacy = Array.isArray(raw.hasItems) ? raw.hasItems : [];
  out.pantry = [...new Set([...out.pantry, ...legacy].filter(x => typeof x === 'string'))];
  out.shopping = record(out.shopping) ? out.shopping : { items: [], checked: {} };
  out.shopping.items = Array.isArray(out.shopping.items) ? out.shopping.items.filter(record) : [];
  out.shopping.checked = record(out.shopping.checked) ? out.shopping.checked : {};
  out.theme = out.theme === 'dark' ? 'dark' : 'light';
  out.accent = ['sage', 'terracotta', 'honey'].includes(out.accent) ? out.accent : 'sage';
  out.premium = false;
  out.schemaVersion = 2;
  return out;
}
export function saveStore(storage: Pick<Storage, 'setItem'>, value: unknown): boolean {
  try { storage.setItem('kb_state_v1', JSON.stringify(value)); return true; }
  catch { return false; }
}
```

В helper для VM добавить `structuredClone` в sandbox A01. Не заменять его JSON roundtrip для обхода ошибки тестового окружения.

3. В App отделить существующий return defaults в `createDefaultStore()` (возвращает новый объект каждый вызов). `loadStore()` читает через try/catch и вызывает normalizeStore. Это первая ступень валидации; отдельным циклом добавить отбрасывание menu с неизвестными recipe id, неправильным days/slots/portion и diary с не-массивом symp. Не передавать непроверенный menu рендереру с non-null `!`.

4. `emit`: сохранить через saveStore; listeners вызвать **даже если запись не удалась**; показать постоянный баннер «Изменения не удалось сохранить на устройстве. Не закрывайте страницу до копирования нужных записей». Не логировать дневник, profile и localStorage. Повторное сообщение не должно создавать бесконечный emit.

5. В Settings добавить кнопку «Удалить все данные на этом устройстве», confirm с точным перечнем анкета/дневник/покупки/переписка. При согласии `localStorage.removeItem('kb_state_v1'); store=createDefaultStore(); listeners.forEach(...); location.hash='/home';`. При ошибке удаления показать ошибку и не заявлять об удалении. Не удалять посторонние ключи и ничего в серверной БД. Политика: удаление **локальное**, не серверное.

6. GREEN: unit и A17 повреждённое состояние/удаление. Commit: `fix: migrate local state and handle unavailable storage`.

### A12. Убрать симуляцию специалиста, OCR, оплаты и открытой админки

**Файлы:** `src/App.tsx`; создать `tests/frontend/pilot-contract.test.mjs`.

1. RED: source-contract тест проверяет отсутствие выдуманных результатов и обещания доставки, а затем A17 проверяет поведение DOM. Source-contract нужен только как дешёвый tripwire, не как замена E2E.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('pilot does not ship simulated professional delivery or OCR results', () => {
  const source = fs.readFileSync('src/App.tsx', 'utf8');
  for (const text of ['carbs: 6.4', 'Мария ответит в течение рабочего дня',
    'Сертификат нутрициолога №1042', 'Демо: реальная оплата']) {
    assert.equal(source.includes(text), false, text);
  }
});
```

2. Заменить **целиком** `NavigatorPage`, `NutritionistPage`, `PremiumPage`, `AdminPage` следующими реализациями. Удалить неиспользуемую константу NUTRI с неподтверждёнными персональными сведениями и отзывами.

```tsx
function NavigatorPage() {
  return <Empty e="🛍️" t="Распознавание этикеток пока не подключено"
    d="Приложение не анализирует фотографии и не знает состав конкретного продукта. Проверяйте данные на его этикетке."
    btn="К рецептам" onClick={() => go('#/recipes')} />;
}
function NutritionistPage() {
  return <Empty e="💬" t="Связь со специалистом пока не подключена"
    d="Сообщения, документы и записи на консультацию из приложения не отправляются. Не загружайте сюда анализы. Контакт специалиста появится после подтверждения владельцем."
    btn="На главную" onClick={() => go('#/home')} />;
}
function PremiumPage() {
  return <Empty e="🌿" t="Бесплатный пилот Keto Balance"
    d="Сейчас все рецепты доступны без оплаты. Подписка, платные консультации и списания не подключены."
    btn="Открыть рецепты" onClick={() => go('#/recipes')} />;
}
function AdminPage() {
  return <Empty e="🔒" t="Администрирование недоступно"
    d="В бесплатном пилоте нет серверной админ-панели и доступа к данным других пользователей."
    btn="На главную" onClick={() => go('#/home')} />;
}
```

3. Удалить объявления `locked`/замочки из RecipeCard; не скрывать уже встроенные рецепты как платные. Убрать ссылки на админку из Settings, desktop sidebar и More. Убрать «Написать Марии» и якобы личное сообщение специалиста из Home: заменить нейтральной карточкой «О сопровождении» со ссылкой на честную заглушку. В Shell Premium-баннер переименовать «О пилоте», не обещать покупку.

4. `ReportPage` кнопку «Нутрициологу» назвать «О сопровождении»; текст «Отчёт уходит…» заменить «Автоматическая отправка отчёта не подключена». `RemindersPage` сохранить как локальный список пожеланий и убрать ввод времени без сохранения; текст «Уведомления не отправляются». Не обещать сохранение медицинских документов или передачу файлов.

5. В `Legal.privacy`: явно различить localStorage приложения и серверную БД Telegram-бота; не писать «никуда не передаются» обо всём проекте. Убрать неподтверждённую гарантию защиты. До серверного релиза политику/согласие проверить с ответственным специалистом; не выдавать технический текст за юридическое заключение.

6. GREEN: unit + E2E отсутствие ложных «Отправлено/Оплачено/Распознано». Commit: `fix: replace simulated services with honest pilot states`.

### A13. Сделать предупреждение при срочных симптомах достижимым

**Файлы:** создать `src/domain/safety.ts`, `tests/frontend/safety.test.mjs`; изменить `src/App.tsx`.

1. RED: функция `hasUrgentSymptoms` должна возвращать true для любой строки из текущего RED_FLAGS, false для обычной головной боли, и не падать на повреждённых данных. Историческая запись не должна автоматически блокировать сегодняшний день.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
test('urgent symptoms activate hold without classifying ordinary notes', () => {
  const { hasUrgentSymptoms } = loadTs('src/domain/safety.ts');
  assert.equal(hasUrgentSymptoms(['Сильная боль в груди'], ['Сильная боль в груди']), true);
  assert.equal(hasUrgentSymptoms(['Головная боль'], ['Сильная боль в груди']), false);
  assert.equal(hasUrgentSymptoms(null, ['Сильная боль в груди']), false);
});
```

2. Реализация:

```ts
export function hasUrgentSymptoms(value: unknown, flags: string[]): boolean {
  return Array.isArray(value) && value.some(x => typeof x === 'string' && flags.includes(x));
}
```

3. В DiaryPage **вне условной карточки `redFlag ? ... : ...`** добавить `<details><summary>Срочные симптомы</summary>…</details>` с Chip по RED_FLAGS и текущим up, чтобы пользователь мог отметить и снять ошибочную отметку; предупреждение должно появиться сразу. Не добавлять диагностику и лечение.

4. В Router перед map-рендером вычислять:

```tsx
const urgent = hasUrgentSymptoms(st.diary[localDay()]?.symp, RED_FLAGS);
const permitted = ['/medical', '/diary', '/settings', '/privacy', '/terms', '/profile'];
if (urgent && !permitted.includes(r.path)) {
  return <Shell path={r.path}><LegalPage k="medical" />
    <Btn variant="soft" onClick={() => go('#/diary')}>Проверить отметку в дневнике</Btn>
  </Shell>;
}
```

ChatWidget не рендерить, если urgent=true, даже на разрешённых маршрутах. Историческая запись показывает предупреждение внутри DiaryPage, но не объявляет текущее состояние человека. Текст не обещает, что снятие отметки означает выздоровление.

5. GREEN unit; A17 проверить переход напрямую `#/menu`, `#/builder`, `#/programs`, `#/recipe/k2` после отметки и возврат к дневнику. Формулировки и номера помощи из существующего проекта подлежат проверке владельцем по региону перед публикацией. Commit: `fix: make urgent symptom guidance reachable and consistent`.

### A14. Исправить недельные периоды, даты графиков и навигацию

**Файлы:** создать `src/domain/reports.ts`, `tests/frontend/reports.test.mjs`; изменить `src/App.tsx`.

1. RED: даты diary вставлены не по порядку, есть старая запись и пропуск; сводка должна использовать только календарные последние 7 дней, график сохраняет null для отсутствующей даты.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
test('weekly report excludes old entries and preserves date gaps', () => {
  const { summarizeDiary } = loadTs('src/domain/reports.ts');
  const value = summarizeDiary({ '2026-10-26': { energy: 4 },
    '2026-09-01': { energy: 1 }, '2026-10-24': { energy: 2 } },
    ['2026-10-24', '2026-10-25', '2026-10-26'], 'energy');
  assert.equal(value.count, 2);
  assert.equal(value.average, 3);
  assert.equal(value.points.map(x => x.value).join(','), '2,,4');
});
```

2. Реализация:

```ts
export function summarizeDiary(diary: Record<string, any>, dates: string[], key: string) {
  const points = dates.map(date => ({ date,
    value: Number.isFinite(diary[date]?.[key]) ? diary[date][key] as number : null }));
  const values = points.flatMap(p => p.value === null ? [] : [p.value]);
  return { points, count: dates.filter(date => !!diary[date]).length,
    average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
}
```

3. `ReportPage.avg` использовать summarizeDiary по recentDays(7), для null — «—». daysCount — только эти семь дат. «Приготовлено» считать cooked timestamp в том же диапазоне; текущая модель хранит последнее приготовление каждого блюда, поэтому честная подпись «уникальных блюд отмечено за неделю», **не** число всех приёмов пищи. На Home считать тот же недельный диапазон или убрать заголовок «за неделю».

4. `StatsPage`: не filter-ить пропуски. `vals(k)` заменить на `summarizeDiary(st.diary, days, k).points`; передавать `<Line points={vals(k)} />`; проверку наличия значений выполнять как `vals(k).some(p => p.value !== null)`. Полная замена Line:

```tsx
function Line({ points, h = 90 }: {
  points: { date: string; value: number | null }[]; h?: number;
}) {
  const x = (index: number) => index * 100 / Math.max(points.length - 1, 1);
  const y = (value: number) => h - value * h / 5;
  return <svg viewBox={`0 0 100 ${h}`} className="w-full" role="img"
    aria-label="Динамика по датам" preserveAspectRatio="none" style={{ height: h }}>
    {points.map((point, index) => {
      if (point.value === null) return null;
      const previous = points[index - 1];
      return <g key={point.date}>
        {previous && previous.value !== null && <line x1={x(index - 1)}
          y1={y(previous.value)} x2={x(index)} y2={y(point.value)}
          stroke="var(--acc)" strokeWidth="2.5" />}
        <circle cx={x(index)} cy={y(point.value)} r="3" fill="var(--acc)">
          <title>{point.date}: {point.value}</title>
        </circle>
      </g>;
    })}
  </svg>;
}
```

Тест A17: два значения с одним отсутствующим днём → два circle и **ноль line**. Это отдельный RED/GREEN шаг, не переезд на библиотеку графиков.

5. В Shell заменить `const cur = path.split('/')[0]` на `const cur = path.split('/').filter(Boolean)[0] || 'home'`. Активной кнопке добавить `aria-current={cur === id ? 'page' : undefined}`. Тест A17 для мобильной и desktop-навигации.

6. GREEN: unit + typecheck. Commit: `fix: calculate actual calendar-week summaries and active navigation`.

### A15. Валидация ввода калькулятора и безопасный HTML бота

**Файлы:** `bot/funnel.py`, `bot/bot.py`; создать `tests/backend/test_funnel.py`, `tests/backend/test_bot_formatting.py`.

1. RED:

```python
import unittest
from bot.funnel import calculate_nutrition, get_welcome_text

class FunnelTests(unittest.TestCase):
    def test_rejects_invalid_weight_or_mode(self):
        for weight in (-1, 0, 34, 251, float('nan'), float('inf')):
            with self.subTest(weight=weight):
                with self.assertRaises(ValueError):
                    calculate_nutrition(weight)
        with self.assertRaises(ValueError):
            calculate_nutrition(70, 'unexpected')

    def test_escapes_first_name(self):
        self.assertIn('&lt;b&gt;Анна&lt;/b&gt; &amp;', get_welcome_text('<b>Анна</b> &'))
```

2. В начало `calculate_nutrition` после docstring:

```python
import math
from html import escape

# imports расположить в начале модуля
```

```python
    if not isinstance(weight, (int, float)) or isinstance(weight, bool) or not math.isfinite(weight) or not 35 <= weight <= 250:
        raise ValueError('Вес должен быть числом от 35 до 250 кг')
    if mode not in ('keto', 'carnivore') or goal not in ('loss', 'maintain'):
        raise ValueError('Неизвестный режим или цель')
```

В `get_welcome_text` первой строкой `first_name = escape(first_name, quote=False)`. В `format_recipe_card` аналогично экранировать title, ingredient names/qty, steps, difficulty из каталога; собственные `<b>` теги оставить. Тест hostile-строк `<tag>&` для каждого поля, не только имени.

3. `set_mode_`, `set_wt_` должны проверять допустимые значения до update_user_mode/save_calculation; ловить ValueError и отвечать «Проверьте ввод», не падать и не писать неверные данные. После успешного расчёта `user_states.pop(user_id,None)`; отмена/to_main также очищает ожидание. Числовой ввод веса принимать только при активном состоянии калькулятора, иначе предложить /calc. Убедиться, что есть effective_user; не обращаться к `.id` у None.

4. Диапазон 35–250 здесь повторяет уже существующую границу UI, **не** является медицински обоснованным правилом. Формулу и тексты «не менее воды/соль/80%/перезапуск метаболизма» не объявлять проверенными. До экспертного согласования заменить `/calc` на «расчёт временно недоступен» либо оставить только техническую демонстрацию, не публикуемую пользователям. Предпочтение для внешнего пилота — выключить персональные расчёты. То же относится к полной выдаче плато-протокола.

5. GREEN backend tests. Commit: `fix: validate calculator inputs and escape Telegram HTML`.

### A16. Пагинация каталога и персональная регистрация пользователя

**Файлы:** создать `bot/catalog.py`, `tests/backend/test_catalog.py`; изменить `bot/bot.py`.

1. RED:

```python
import json
import pathlib
import unittest
from bot.catalog import category_page

class CatalogTests(unittest.TestCase):
    def test_every_dinner_is_reachable(self):
        recipes = json.loads(pathlib.Path('bot_data.json').read_text(encoding='utf-8'))['recipes']
        first = category_page(recipes, 'lunch', 0)
        ids = set()
        for page in range(first['pages']):
            ids.update(r['id'] for r in category_page(recipes, 'lunch', page)['items'])
        expected = {r['id'] for r in recipes if r['cat'] in ('lunch', 'dinner', 'main')}
        self.assertEqual(ids, expected)

    def test_empty_category_stays_empty(self):
        self.assertEqual(category_page([], 'soup', 0)['items'], [])
```

2. Реализация `bot/catalog.py`:

```python
import math

def category_page(recipes, category, page=0, size=8):
    if category == 'carnivore':
        selected = [r for r in recipes if r.get('mode') == 'carnivore']
    elif category == 'lunch':
        selected = [r for r in recipes if r.get('cat') in ('lunch', 'dinner', 'main')]
    else:
        selected = [r for r in recipes if r.get('cat') == category]
    pages = max(1, math.ceil(len(selected) / size))
    page = max(0, min(int(page), pages - 1))
    return {'items': selected[page * size:(page + 1) * size],
            'page': page, 'pages': pages, 'total': len(selected)}
```

3. Callback `cat_<category>:<page>`: разделить через `partition(':')`, page default0; разрешить только ключи CATEGORY_NAMES, десерт и заготовки добавить явно. Строить кнопки по `result['items']`, навигацию «←/→» только когда соседняя страница есть. Не добавлять fallback RECIPES[:5]. Для «Супы/Салаты» сейчас нет таких category: убрать эти кнопки до редакторской категоризации, а не показывать случайные блюда. Дополнительно добавить «Десерты», «Заготовки».

4. Прямые команды /water, /calc и callback не обязаны следовать /start: после проверки effective_user обеспечить get_or_create_user перед первой записью. Покрыть async-тестом прямой /water без /start с временной БД. Логи не должны содержать токен и содержимое пользовательских записей.

5. `get_water_view` в бесплатном пилоте показывает только внесённый объём, без универсальной обязательной нормы и рекламного совета соли. День воды пока явно по часовому поясу сервера; написать это в README. Индивидуальный timezone — этап B, не незаметное изменение дат существующих логов.

6. GREEN: два unit-теста + async callback mock. Commit: `fix: paginate all bot recipes and handle direct commands`.

### A17. Сквозные проверки настоящего приложения, а не только функций

**Файлы:** создать `playwright.config.ts`, `tests/e2e/pilot.spec.ts`; изменить `package.json`, `.gitignore`, `vite.config.ts`.

1. Установить в реализации `npm install --save-dev @playwright/test`, затем `npx playwright install chromium`. Обновить lockfile. Если сеть недоступна, сообщить блокер; не выдумывать результат E2E. Не обновлять React/Vite заодно.

2. Конфигурация:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:3000', viewport: { width: 390, height: 844 } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3000 --strictPort',
    url: 'http://127.0.0.1:3000', reuseExistingServer: false,
  },
});
```

В Vite установить `open:false, strictPort:true`, port оставить3000. Добавить `test:e2e: playwright test`, `test:e2e:ui: playwright test --ui`. В gitignore добавить `.venv/`, `playwright-report/`, `test-results/`, `*.tsbuildinfo`.

3. Полный первый регрессионный E2E:

```ts
import { test, expect } from '@playwright/test';
test('partial state is repaired and pilot does not pretend to send documents', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kb_state_v1', JSON.stringify({
    onboarded: true, profile: { name: 'Анна', mode: 'keto' },
  })));
  await page.goto('/#/nutritionist');
  await expect(page.getByText('Связь со специалистом пока не подключена')).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.goto('/#/navigator');
  await expect(page.getByText('Распознавание этикеток пока не подключено')).toBeVisible();
  await page.goto('/#/premium');
  await expect(page.getByText('Бесплатный пилот Keto Balance')).toBeVisible();
});
```

Этот тест должен быть добавлен **до A11/A12**, запущен с ожидаемым FAIL, а после их реализации пройти. Порядок размещения задачи в документе не повод писать тесты после кода: сначала подготовить A17.1–3, затем выполнять A11/A12, затем расширять E2E по одному кейсу.

4. Добавлять отдельным RED/GREEN-циклом каждый сценарий:

| Кейс | Действия | Проверяемый результат |
|---|---|---|
| Анкета | Пройти все шаги, выбрать яйца, кето, три приёма | В меню ровно 3 слота на день; ни один выбранный рецепт не содержит яйца |
| Невозможный подбор | allergyNote='цитрусовые'; завершить анкету; нажать сбор меню | Понятное объяснение; нет белого экрана и «успешного» меню |
| Карнивор | Подготовить профиль; собрать7дней/3приёма | 21 слот; категории fallback не затирают слоты |
| Замена | Яичная аллергия; несколько замен завтрака | Запрет не обходится |
| Покупки | Добавить k1 дважды | Одна строка бекона 80 г; нет 3360 ₽ и NaN |
| Холодильник | Добавить точное название «Бекон»; пересобрать список | Бекон исключён из автоматических покупок |
| История | Открыть вчерашний дневник → главную | Главная показывает сегодняшнюю дату |
| Полночь | Playwright clock: 23:59→00:01 | Главная обновляет день без reload; запись вчера не переносится |
| Срочные симптомы | Отметить текущий срочный симптом; открыть меню прямым hash | Предупреждение, нет рекомендаций/ChatWidget; доступен дневник |
| Хранилище | Подать '{}', 'broken', неправильные menu/diary | Нет необработанного исключения |
| Удаление | Подтвердить удаление; reload | Анкета/дневник/покупки исчезли, чужой localStorage-ключ остался |
| Навигация | home→recipes на mobile и width1280 | Одна ожидаемая кнопка aria-current=page |
| Каталог | Открыть все37 recipe/id | Название, состав, шаги; нет падений |
| Недоступные функции | OCR/специалист/подписка/админ | Нет ложных фактов распознавания, отправки, оплаты и публикации |

5. Для каждого теста фиксировать `pageerror` и проваливать тест при необработанном исключении; не подавлять console error без разбора. Все маршруты `/home,/recipes,/recipe/k1,/builder,/menu,/shopping,/fridge,/diary,/stats,/report,/keto,/carnivore,/choose,/quiz,/programs,/budget,/learn,/cafe,/navigator,/prep,/antisryv,/reminders,/nutritionist,/premium,/profile,/settings,/admin,/privacy,/terms,/medical` пройти на mobile; основные страницы повторить на desktop и в dark mode. Навигационные проверки не являются визуальным сравнением дизайна — не утверждать pixel-perfect.

6. `npm run test:e2e` — exit0. Commit тестовых шагов отдельно: `test: cover safe pilot user journeys`.

### A18. Воспроизводимая Python-среда, один вход бота и инструкция запуска

**Файлы:** создать `requirements.txt`, `requirements-dev.txt`, `README.md`; изменить `run_bot.bat`, `run_server.bat`; удалить `telegram_bot.py` после поиска ссылок.

1. Проверить ссылки на `telegram_bot.py`, `BOT_TOKEN`, `5173` во всех отслеживаемых файлах (не читать `.env`). Подтвердить единственный поддерживаемый вход `python -m bot.bot`. Старый aiogram-файл удалить из рабочего дерева, история Git остаётся. Если обнаружен внешний сценарий запуска, сначала согласовать переключение.

2. Начальный `requirements.txt` (версии воспроизводят проверенное окружение, а не обещают последний релиз):

```text
python-telegram-bot==22.8
fastapi==0.133.1
pydantic==2.13.4
uvicorn==0.41.0
```

`requirements-dev.txt`:

```text
-r requirements.txt
httpx==0.28.1
```

Создать `.venv` и установить зависимости. Проверить `python -m pip check`; если транзитивные зависимости конфликтуют, зафиксировать корректный набор в манифесте, а не глобально переустанавливать окружение Hermes. Секреты не включать в snapshot/freeze. Python 3.14 считать рабочим только после реального прохождения тестов в этой venv; не обещать совместимость с другими версиями без CI.

3. `run_bot.bat`, `run_server.bat` после `cd /d "%~dp0"` должны проверять `.venv\Scripts\python.exe` и запускать его; если отсутствует — понятное сообщение «Сначала выполните установку по README» и exit /b1. Не fallback-ить на произвольный global Python.

4. В `bot/config.py` default `WEBAPP_URL` привести к `http://localhost:3000`. В `bot/bot.py` не создавать кнопку `WebAppInfo`, если URL не начинается `https://`: вместо неё локальный текст «Mini App требует публичного HTTPS; откройте локальное приложение в браузере». Это касается get_main_keyboard и всех остальных WebAppInfo-конструкторов: централизовать в `webapp_button(label)` и добавлять строку только если вернулся объект. Тест: при http URL ни один keyboard не содержит web_app; при https содержит разрешённый URL. Не менять `.env` автоматически.

5. README должен содержать точные команды для Git Bash на Windows:

```bash
npm ci
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
npm test
.venv/Scripts/python.exe -B -m unittest discover -s tests/backend -p 'test_*.py' -v
npm run typecheck
npm run build
npm run dev
# отдельно: .venv/Scripts/python.exe -B -m bot.server
# бот запускать только с отдельным тестовым токеном после разрешения:
# .venv/Scripts/python.exe -B -m bot.bot
```

README явно различает port3000 Vite и port8000 сервер собранного dist; объясняет, что localhost недоступен телефону как адрес компьютера; HTTPS/бот через BotFather — отдельный согласуемый деплой. Указать localStorage vs SQLite, лимиты бесплатного пилота, отсутствие денежных списаний/доставки документов/автоуведомлений, безопасность и экспорт/удаление.

6. Добавить `LICENSE` только после решения владельца о лицензии; не выбирать за него. Перед любыми платными покупками — отдельный этап B. Commit: `chore: document reproducible pilot setup and retire legacy bot`.

### A19. Контентная ревизия и релизный отчёт

**Файлы:** создать `docs/content-review.md`, `docs/release-checklist.md`; при согласованной правке менять `bot_data.json`, `src/App.tsx`, `bot/funnel.py`, `bot/bot.py`, `bot/config.py`.

1. Составить реестр контента с точными местами: все 37 рецептов (id/title/состав/порции/КБЖУ/хранение/замены/tags), 10 советов, 15 уроков, 9 обещаний программ, плато/SOS и все публичные цены/имя/контакты. Проверить несоответствия названия составу (`k5` ветчина отсутствует, `k7` лимон отсутствует, `c4` куриные сердечки vs говяжьи), взаимно противоречащие метки и неопределённые единицы.

2. Ошибку «без яиц» у k4 исправить удалением метки, а не выдуманным рецептом; «без молочных» у k14/k15 убрать из маркетинга, фильтр основывать на eligibility. Не высчитывать общие углеводы обратным вычитанием из калорий: в RecipePage показывать только существующее `nc` с подписью «чистые углеводы, ориентировочно», общие — «нет проверенных данных». Не пересчитывать КБЖУ автоматически без источника состава и веса.

3. Неподтверждённые медицинские обещания, сведения о специалисте и отзывы отправить владельцу на проверку. До этого не публиковать персональные расчёты/протоколы и категоричные физиологические объяснения. Нейтральный дисклеймер не заменяет проверку самого содержания. Это редакционная/экспертная задача, а не разрешение агенту придумать клинические нормы.

4. Полный технический gate реализации:

```bash
npm ci
npm test
npm run typecheck
npm run build
.venv/Scripts/python.exe -m pip check
.venv/Scripts/python.exe -B -m unittest discover -s tests/backend -p 'test_*.py' -v
npm run test:e2e
```

Ожидания: unit/E2E зелёные; build exit0 и создан dist/index.html + assets; pip check сообщает отсутствие нарушенных зависимостей. Сборка не является доказательством работы платежей/Telegram.

5. Дополнительный smoke **в реализации**: `.venv/Scripts/python.exe -B -m bot.server`; GET `http://127.0.0.1:8000/api/health` →200/statusok; `/` →200 HTML; неизвестный api→404; несуществующий .js→404; webhook→503; traversal не выдаёт файл вне dist. После проверки остановить **свой** сервер. Бота не запускать, если нет разрешения и тестового токена; в отчёте написать «Telegram live smoke не выполнялся».

6. `npm audit --omit=dev` и `npm audit` выполнять как сетевые read-only проверки только при реализации; сохранить реальные advisory и отдельно влияние production/dev server. Ничего не «исправлять» через `npm audit fix --force` без отдельного тестируемого решения. При необходимости обновления Vite — отдельный маленький compatibility-срез с build/E2E, не вслепую major update.

7. `docs/release-checklist.md`: реальные команды/exit codes, какие тесты прогнаны, ограничения, оставшиеся P0/P1, непроверенные внешние сценарии, кто одобрил контент. Не заполнять ожидаемые результаты как уже выполненные. Финальный `git diff --check`, `git status --short`, review на секреты и непреднамеренные изменения. Commit документации при разрешении: `docs: record pilot verification and remaining launch gates`.

---

## 5. Следующие этапы — не выполнять без решений владельца

Это **контрольные точки нового проектирования**, а не расплывчатые задачи «подключить всё». Полный copy-paste implementation plan для них составляется после ответов и проверки официальных API/правил; в релиз A они не входят.

### B1. Продукт и подтверждённые сведения

Требуются: платформа Telegram или Telegram+MAX; настоящее имя и публичный контакт специалиста; подтверждённые сведения/отзывы; состав услуги и точные тарифы; юрисдикция и география аудитории. Артефакт: утверждённые `docs/product-scope.md` и `docs/content-review.md`, без выдуманных цен и дипломов. Проверка: бот, приложение и оферта показывают одинаковые сведения.

### B2. Серверная идентификация и синхронизация

Предлагаемый контракт: клиент передаёт Telegram initData; сервер проверяет подпись и свежесть по актуальной официальной документации; user_id берётся **только** из проверенного payload. Отдельные ресурсы `/api/me`, `/api/me/diary`, `/api/me/water`, `/api/me/menu`; каждый запрос ограничен владельцем, неизвестный/просроченный initData→401, чужая запись→403/404. Источник истины после перехода — сервер, локальное состояние — явно определённый cache; импорт legacy-данных только с согласием, повторный импорт идемпотентен.

До реализации: определить retention, согласие, удаление/экспорт, резервирование, timezone и конфликты одновременных изменений. Артефакт: новый план с моделью БД/миграциями и отрицательными тестами подписи/свежести/чужого доступа. Нельзя просто добавить user_id в query string и назвать это авторизацией.

### B3. Реальные покупки и права доступа

Сначала проверить актуальные официальные правила выбранной платформы, тип продукта и поддерживаемого провайдера; не считать текущую идею «ЮKassa для любого цифрового контента внутри Telegram» автоматически допустимой. На сервере: заказ с владельцем, валютой и суммой в минимальных единицах; верифицированное событие провайдера; сверка order/user/product/currency/amount/status; транзакционная идемпотентность; отдельные entitlements с begins/expires/revoked; refund/cancel; журнал без секретов.

Acceptance: поддельный webhook, demo-callback, повторное событие, неверная сумма/валюта и чужой заказ не создают доступ; один подлинный sandbox-платёж создаёт ровно одно право; истечение и возврат закрывают доступ. Платный контент не отправляется неавторизованному клиенту. Полная тестовая матрица и документация провайдера — до включения любых списаний.

### B4. Реальное сопровождение, документы и админка

Только после B2 и согласия на обработку чувствительных данных. Определить роли owner/nutritionist/client, назначение специалиста участнику, канал доставки, квоты/типы файлов, проверку доступа к скачиванию, сроки хранения и аудит. Успех отправки подтверждается чтением созданной серверной записи/реальной доставкой, не toast по таймеру. Временные слоты консультаций бронируются транзакционно; запрет двойного бронирования обязателен.

### B5. Хостинг, резервирование и ограниченный внешний пилот

Выбрать хостинг/домен и HTTPS; проверить реальный запуск Mini App с телефона и desktop Telegram; только один polling-процесс бота. Восстановить обезличенную тестовую БД из backup и проверить целостность; задать мониторинг health/error и процедуру отката. Не выставлять наружу development Vite server и не ставить программы на диск D: ради освобождения C:.

### B6. Дополнительные функции только по спросу

OCR — после определения источника фактического результата, обработки ошибок и приватности фото. Напоминания — после timezone, явного согласия/отписки и очереди доставки. Настоящие программы — после появления отдельного проверенного содержания для каждой карточки. Метрики пилота: завершение анкеты, успешный подбор, замены, формирование списка и возвраты; не собирать медицинские тексты/имена в аналитику по умолчанию.

## 6. Риски и компромиссы

- **Безопасность важнее текущей демонстрации монетизации.** Покупки и «ответ специалиста» временно станут недоступны, зато перестанут вводить пользователя в заблуждение.
- **Аллергии:** текстовый каталог неполон, ингредиентные группы не учитывают следы/бренды/все замены. Отказ подбора и ручная проверка предпочтительнее автоматического снятия ограничений.
- **Миграции:** сохранить имя/дневник/избранное, но не доверять старому premium. Перед серверной миграцией требуется отдельная backup/restore-процедура.
- **Порции:** количество на рецепт делится на serv; не смешивать это с количеством людей/упаковок. Цены без единиц временно не показываются.
- **Тесты:** Node helper не проверяет types/DOM; обязательны typecheck и Playwright. Async handler tests не заменяют разрешённый smoke в настоящем Telegram.
- **Сборка:** текущий typecheck успешен, но строгий TypeScript выключен. Включать strict для новых domain-модулей локально либо отдельной конфигурацией после стабилизации, не превращать аудит в массовую перепись TSX.
- **Публичный медицинский контент:** требует квалифицированного согласования; план не является медицинской или юридической экспертизой.
- **Сроки:** не обещать закончить весь план за один короткий сеанс. Оценка 2–5 минут относится к одному элементарному RED/GREEN-шагу, не к полной интеграции сервиса.

## 7. Итоговые критерии готовности

### Релиз A считается готовым только если

- [ ] Нет активного пути бесплатного объявления заказа оплаченным и обхода корня dist.
- [ ] Импорты не создают/меняют настоящую БД; соединения закрываются.
- [ ] Ни одна функция не выдаёт выдуманный OCR, доставку специалисту или платёж за реальный результат.
- [ ] Все запрошенные приёмы пищи присутствуют; ограничения не теряются при замене/подборе.
- [ ] Порции и единицы списка проверены; нет недостоверной цены.
- [ ] localStorage переживает повреждённое/старое состояние; удаление действительно удаляет только данные проекта.
- [ ] Текущие и выбранные исторические даты не перепутаны; недельные периоды действительно календарные.
- [ ] Срочное предупреждение достижимо и не соседствует с продолжающимися рекомендациями.
- [ ] Все 37 рецептов доступны в приложении; все категории бота доступны постранично.
- [ ] Пройдено unit + typecheck + build + E2E; получены реальные exit codes.
- [ ] README позволяет воспроизвести установку и отличает локальный пилот от коммерческого сервиса.
- [ ] Непроверенный контент/контакты не подаются как подтверждённые; внешний запуск пока заблокирован экспертными и продуктовыми решениями.

**Рекомендация по очередности:** A01–A04 немедленно; затем A05–A10; подготовить каркас A17 до A11–A14; A15–A16; завершить A17–A19. Только после этого — решения B1 и отдельный подробный план B2/B3. Не продавать текущий прототип как готовое сопровождение до закрытия этих ворот.
