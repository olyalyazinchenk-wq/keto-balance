# LIVE STATUS — Кето Баланс (Agent-First Operations)

> **Единая точка оперативной правды для всех агентов и разработчиков.**
> **Дата последнего обновления**: 2026-11-08 15:20:00 RTZ 2
> **Инициатор обновления**: Antigravity
> **Проверенный SHA**: `96327a8df73044e4ac6cd191dd598f6133a50992` (ветка `feat/owner-private-acceptance-20261107`)

---

## 1. Текущий срез и репозиторий

- **Проект**: Keto-Balance (Премиум Telegram Mini App + Бот).
- **Канонический репозиторий**: `https://github.com/olyalyazinchenk-wq/keto-balance`
- **Текущая ветка**: `feat/owner-private-acceptance-20261107`
- **HEAD коммит**: `f3f2c1e` (f3f2c1eb6c4efa23a777dbd39d1aa6e1795fc8f5)
- **Облачный статус (Cloud.ru ВМ 84.54.56.73)**:
  - Веб-приложение: `ketobalance-owner-app` (образ `ketobalance-owner-private:v4`, `buildId: a32499d38a5f766a`, `dirty: false`, порт `18183 -> 18081`).
  - HTTPS: `ketobalance-https` (`https://84.54.56.73.nip.io/`).
  - Облачный бот: `ketobalance-cloud-bot` (`@keto_balance_userbot`), единственный poller, `KETO_BOT_PROXY=socks5://127.0.0.1:10808`.
  - Автономный сетевой клиент: `ketobalance-tg-proxy` (`ghcr.io/xtls/xray-core@sha256:ceabeac03a89d991d2a247361825c1d1d2e9c91cd5dc010f298c7dc0c2f325c9`), VLESS Reality, слушает только loopback `127.0.0.1:10808` (SOCKS) и `127.0.0.1:10809` (HTTP). Публичные прокси-порты не открывались.
  - Домашний SSH-туннель: **ОТКЛЮЧЕН** (`task-750` остановлен, порт 18090 на ВМ закрыт). Зависимость от включённого домашнего ПК и Antigravity снята.
- **Изоляция проекта NutriOK («Новая папка»)**:
  - Задача `WellnessBot`: `Disabled` (Изоляция: **ПОДТВЕРЖДЕНА**).
- **Финансовый статус Cloud.ru**:
  - Грант: 3998 из 4000 бонусов. Новые платные ресурсы не создавались.

---

## 2. Реально проверенные факты (Machine Evidence)

| Проверка / Компонент | Команда | Результат | Статус |
|---|---|---|:---:|
| **Облачный Web App (84.54.56.73)** | `curl -k https://84.54.56.73.nip.io/api/version` | HTTP 200, buildId `a32499d38a5f766a`, gitSha `cc06a65...`, dirty: false | **PASS** |
| **Защита каталога от обхода** | `curl https://84.54.56.73.nip.io/released-catalog.json/.` | HTTP 401 Unauthorized (обход закрыт) | **PASS** |
| **Автономный Telegram API выход** | `curl -I --socks5-hostname 127.0.0.1:10808 https://api.telegram.org/` | HTTP 302, TLSv1.3 handshake OK | **PASS** |
| **Верификация бота без токена в логах** | `getMe` via `socks5://127.0.0.1:10808` | `ok: True, username: keto_balance_userbot` | **PASS** |
| **Проверка webhook и очередей** | `getWebhookInfo` via `socks5://127.0.0.1:10808` | `ok: True, url: '', pending_updates: 0` | **PASS** |
| **Отключение домашнего моста** | `task-750 kill`, проверка порта 18090 на ВМ | Порт 18090 освобождён, бот продолжает polling без ошибок | **PASS** |
| **Рестарт-дрилл сетевого клиента** | `docker restart ketobalance-tg-proxy` | Восстановление < 1 сек, порт 10808 активен | **PASS** |
| **Backend Test Suite** | python scripts/run_backend_tests.py | 371 тест PASS (0 fail, 0 error, 0 skipped, I/O guard active) | **PASS** |
| **Frontend Unit Tests** | node --test tests/frontend/*.test.cjs | 308 тестов PASS (6 suites, 0 fail, 0 error) | **PASS** |
| **TypeScript Typecheck** | npm run typecheck | 0 ошибок | **PASS** |
| **Playwright Full E2E** | npx playwright test --config playwright.full.config.ts | 16 тестов PASS (320px, 390px, 768px, 1440px, безусловный тест 409) | **PASS** |
| **Каталог приёмки владельца** | `node scripts/validate-catalog.mjs && export-release-catalog.mjs` | 50 рецептов PASS; защита архива неизменяемости перенесена в изолированную сборку | **PASS** |
| **Аудит Codex c4aacb1 (Группы 1–4)** | Автономные пробы и тесты воспроизведения | 4/4 групп дефектов устранены | **PASS** |
| **Аудит Codex 3fdf051 (P1 Покупки, P2 Каталоги)** | Автономные пробы probes.cjs, api-roundtrip-probe.py, юнит-тесты | Увеличение потребности корректно сбрасывает отметку купленного для диапазона; реестр каталогов перезапрашивается после авторизации; December доступен владельцу | **PASS** |
| **Аудит Codex f3f2c1e (P1 Повторы и уменьшение потребности)** | probes.cjs, api-roundtrip-probe.py, unit-тесты обработчиков | Полное сопоставление нормализованных выходов блюд на порцию: 14 -> 15 сбрасывает отметку (false), 21 -> 20 сохраняет отметку (true), изолированные недели и кастомные периоды сохранены | **PASS** |
| **Аудит Codex 96327a8 (P1 Пересборка меню, P2 Устаревшие позиции старого меню)** | probes.cjs, api-roundtrip-probe.py, unit-тесты | Согласованный диапазонный пересчёт требований ингредиентов при полной пересборке (1 -> 5 и 1 -> 7.3 сбрасывают отметку недели в false, custom 01-07 в false, month сохраняется); устаревшие позиции старого рациона исключены из локального списка | **PASS** |
| **Месячный план и покупки** | `playwright test --config playwright.full.config.ts` | 28–31 день, недели меню, выбор диапазона покупок (неделя/месяц/custom), сохранение порций и "есть дома" | **PASS** |
| **24-часовая устойчивость** | Наблюдаемый период работы без домашнего ПК | Старт наблюдения: 2026-11-07 18:50 MSK | **OBSERVING** |

---

## 3. Регламент взаимодействия агентов (Agent-First)

- **Единый вход**: `docs/AGENT_CONTEXT_HUB.md` и `AGENTS.md`.
- **Принцип работы**: 1 задача = 1 исполнитель, без лишней бюрократии и повторных аудитов.
- **Охраняемые действия (GUARDED)**: требуют подтверждения владельца (`--confirm-phrase "СОГЛАСОВАНО ОЛЬГОЙ"`).
