# LIVE STATUS — Кето Баланс (Agent-First Operations)

> **Единая точка оперативной правды для всех агентов и разработчиков.**
> **Дата последнего обновления**: 2026-11-07 18:55:00 RTZ 2
> **Инициатор обновления**: Antigravity
> **Проверенный SHA**: `6b99d476b404eaca4c3d66b9e4e6a67af47fdfb2` (ветка `feat/owner-private-acceptance-20261107`)

---

## 1. Текущий срез и репозиторий

- **Проект**: Keto-Balance (Премиум Telegram Mini App + Бот).
- **Канонический репозиторий**: `https://github.com/olyalyazinchenk-wq/keto-balance`
- **Текущая ветка**: `feat/owner-private-acceptance-20261107`
- **HEAD коммит**: `6b99d47` (6b99d476b404eaca4c3d66b9e4e6a67af47fdfb2)
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
| **Облачный Web App (84.54.56.73)** | `curl -k https://84.54.56.73.nip.io/api/version` | HTTP 200, buildId `a32499d38a5f766a`, gitSha `6b99d47...`, dirty: false | **PASS** |
| **Защита каталога от обхода** | `curl https://84.54.56.73.nip.io/released-catalog.json/.` | HTTP 401 Unauthorized (обход закрыт) | **PASS** |
| **Автономный Telegram API выход** | `curl -I --socks5-hostname 127.0.0.1:10808 https://api.telegram.org/` | HTTP 302, TLSv1.3 handshake OK | **PASS** |
| **Верификация бота без токена в логах** | `getMe` via `socks5://127.0.0.1:10808` | `ok: True, username: keto_balance_userbot` | **PASS** |
| **Проверка webhook и очередей** | `getWebhookInfo` via `socks5://127.0.0.1:10808` | `ok: True, url: '', pending_updates: 0` | **PASS** |
| **Отключение домашнего моста** | `task-750 kill`, проверка порта 18090 на ВМ | Порт 18090 освобождён, бот продолжает polling без ошибок | **PASS** |
| **Рестарт-дрилл сетевого клиента** | `docker restart ketobalance-tg-proxy` | Восстановление < 1 сек, порт 10808 активен | **PASS** |
| **Backend Test Suite** | `python scripts/run_backend_tests.py` | 331 тестов PASS | **PASS** |
| **Frontend Unit Tests** | `npm run test:unit` | 249 тестов PASS, 0 fail | **PASS** |
| **Playwright Full E2E** | `npx playwright test --config playwright.full.config.ts` | 15 тестов PASS | **PASS** |
| **24-часовая устойчивость** | Наблюдаемый период работы без домашнего ПК | Старт наблюдения: 2026-11-07 18:50 MSK | **OBSERVING** |

---

## 3. Регламент взаимодействия агентов (Agent-First)

- **Единый вход**: `docs/AGENT_CONTEXT_HUB.md` и `AGENTS.md`.
- **Принцип работы**: 1 задача = 1 исполнитель, без лишней бюрократии и повторных аудитов.
- **Охраняемые действия (GUARDED)**: требуют подтверждения владельца (`--confirm-phrase "СОГЛАСОВАНО ОЛЬГОЙ"`).
