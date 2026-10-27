# Актуальное состояние проекта (для агентов и разработчиков)

Обновлено: **27 октября 2026, ~04:00 MSK**.
Источник правды по коду — репозиторий: https://github.com/olyalyazinchenk-wq/keto-balance (публичный, ветка `master`).
Хаб и базы в Notion — ссылки и ID в разделе «Где лежат данные» ниже.

> Этот файл — быстрый вход в контекст. Он не заменяет `AGENTS.md` (инварианты работы) и не является актом приёмки.

## 1. Проверки на момент обновления

| Проверка | Команда | Результат |
|---|---|---|
| Типизация | `npm run typecheck` | **0 ошибок** |
| Frontend-тесты | `npm run test:unit` | **42 теста: 34 pass, 8 fail** |
| Backend-тесты | `.venv-p0/Scripts/python.exe -m unittest discover -s tests/backend -t .` | **62 теста OK** |
| Production-сборка | `npm run build` | не перезапускалась в этом обновлении — статус не подтверждён |

### Почему падают 8 frontend-тестов (диагноз, не гипотеза)

1. **`Catalog integrity baseline (P05)` — 2 падения.** Тест жёстко ждёт `RECIPES.length === 37` (21 кето + 16 карнивор). Фактический каталог в `src/data/recipes.ts` — **42 рецепта (26 кето + 16 карнивор)**, добавлены `k22–k26`. Тест устарел относительно данных.
2. **`Honesty baseline and removal of simulated services (P08)` — 6 падений.** Тесты ищут в `src/App.tsx` конкретные тексты («Распознавание этикеток и поиск по проверенной базе пока не подключены» и др.) и отсутствие имитаций в `NavigatorPage`, `NutritionistPage`, `AdminPage`, `RemindersPage`. После переделки этих страниц формулировки изменились — тесты не обновлены.

Вывод: это **расхождение контрактов тестов и кода**, а не подтверждённые 8 разных дефектов. При этом менять тесты «под код» нельзя без проверки, что честность экранов не потеряна: пункт про имитации — про безопасность, а не про удобство.

## 2. Что изменилось с предыдущего обновления (26.10)

- Каталог рецептов вырос: **37 → 42** (добавлены `k22–k26`), синхронно обновлён `bot_data.json`.
  Notion-база «Каталог рецептов» синхронизирована 27.10: 37 записей + 5 новых (`k22–k26`) = **42**.
- Появились модули: `bot/transport.py`, `bot/private_support.py`, `src/pages/PrivateSupportPage.tsx`, `src/pages/TechnicalNotice.tsx`.
- Появились скрипты релиза и проверки: `scripts/verify-release.py`, `scripts/stamp-release.mjs`, `scripts/run_backend_tests.py`, `scripts/verification.py`.
- Документы: `docs/product-brief-2026-10-26.md`, `docs/product-interview-2026-10-26.md`, `docs/audit/2026-10-27-project-state-audit.md`, `docs/release/{status.md,baseline.md,evidence/}`.
- Тесты: `tests/backend/test_bot_transport.py`, `test_log_redaction.py`, `test_private_support.py`, `test_probe_entry.py`, `test_release_version.py`, `test_support_integration.py`, `tests/frontend/support-bridge.test.cjs`.

## 3. Подтверждённые блокеры релиза (из аудита 27.10)

1. **Публичный вход не обслуживает приложение**: найденный hostname отдавал `HTTP 530` / ошибка Cloudflare `1033` (нет здорового соединения cloudflared для маршрута). Причина потери соединения аудитом не установлена — нельзя автоматически винить VPN.
2. **Кнопки поддержки ведут не туда**: `bot/config.py` задаёт одинаковый fallback `https://t.me/olga_nutri_med` для `CHANNEL_URL`, `SUPPORT_CHAT` и `NUTRITIONIST_USERNAME`; `bot/bot.py` вешает этот адрес и на «Канал», и на «Задать вопрос». Личные вопросы должны идти только в личный чат Ольги, не в канал.
3. **Имитация поддержки в интерфейсе**: экран нутрициолога раньше создавал шаблонный ответ через `setTimeout`. Проверять фактическое поведение перед релизом; «отправлено» нельзя показывать до подтверждённой доставки.
4. **Расчётов БЖУ нет в проверяемом ядре**: `src/core/keto-engine/` отсутствует, числа каталога — исходные данные, не расчёт.

### Отслеживается в GitHub Issues

- #13 — 8 падающих frontend-тестов (контракты каталога и honesty-проверок)
- #14 — публичный вход: cloudflared 530 / Cloudflare 1033
- #15 — вопросы уходят в канал вместо личного чата Ольги

## 4. Что нельзя считать готовым

- Платный продукт, реальные платежи (`PAYMENT_MODE=demo`).
- Доставка личных вопросов владельцу (не проверена).
- Telegram auth / проверка `initData` (R13), согласия и удаление данных (R17), CI-гейт (R19).
- Мобильная приёмка и доступность (R16) — не подтверждены.
- Требования `R01–R20` (`docs/requirements-draft.md`) — черновик, владельцем не утверждены.

## 5. Где лежат данные (актуальные ID)

| Ресурс | Адрес |
|---|---|
| Код | https://github.com/olyalyazinchenk-wq/keto-balance |
| Задачи в GitHub | https://github.com/olyalyazinchenk-wq/keto-balance/issues |
| Хаб в Notion | страница `4058a9de-1d41-812a-95a8-da4b47ca7175` |
| Каталог рецептов (Notion) | база `4058a9de-1d41-8184-9262-ff64a0bee28f` |
| Задачи (Notion) | база `4058a9de-1d41-81eb-9920-fa37c96c8ad8` |
| Исследования (Notion) | база `4058a9de-1d41-8186-9f0e-c1ffa6dfbbc7` |
| Участники: вес и белок (Notion) | база `4058a9de-1d41-81d6-b23e-efb5ffb7cb76` |
| Журнал обновлений (Notion) | страница `4058a9de-1d41-81ac-8e4f-f5870d14a4d0` |

Google Drive проектом **не используется**: ни интеграции, ни локальной папки, ни CLI. Не создавать там копии без решения владельца — иначе появится второй источник правды и расхождения.

## 6. Что не коммитится в репозиторий

`media/` (видео-артефакты, ~32 МБ), `tools/` (`cloudflared.exe`, ~53 МБ), тестовые файлы (`test_audio.mp3`, `test_steak.jpg`), `.env`, локальные БД, логи.

## 7. Как проверить состояние самому

```bash
npm run typecheck
npm run test:unit
.venv-p0/Scripts/python.exe -m unittest discover -s tests/backend -t .
git status -sb && git log --oneline -3
```

Ожидаемо: typecheck 0 ошибок, backend 62 OK, frontend 34/8 (см. п.1), рабочее дерево чистое.
