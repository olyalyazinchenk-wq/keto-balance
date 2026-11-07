# LIVE STATUS — Кето Баланс (Agent-First Operations)

> **Единая точка оперативной правды для всех агентов и разработчиков.**
> **Дата последнего обновления**: 2026-11-07 18:35:00 RTZ 2
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
  - Облачный бот: `ketobalance-cloud-bot` (`@keto_balance_userbot`), единственный poller, платежи выключены.
  - Временный сетевой мост: SSH reverse SOCKS 18090 (фоновый процесс `task-750`).
- **Текущая задача**: `TASK-NET-1` — автономный сетевой выход КетоБаланса на ВМ Cloud.ru через разрешённый профиль Happ без зависимости от домашнего компьютера.
- **Изоляция проекта NutriOK («Новая папка»)**:
  - Задача `WellnessBot`: `Disabled` (Изоляция: **ПОДТВЕРЖДЕНА**).
- **Финансовый статус Cloud.ru**:
  - Грант: 3998 из 4000 бонусов. Новые платные ресурсы не создаются.

---

## 2. Реально проверенные факты (Machine Evidence для SHA 6b99d47)

| Проверка / Компонент | Команда | Результат | Статус |
|---|---|---|:---:|
| **Облачный Web App (84.54.56.73)** | `curl -k https://84.54.56.73.nip.io/api/version` | HTTP 200, buildId `a32499d38a5f766a`, gitSha `6b99d47...`, dirty: false | **PASS** |
| **Защита каталога от обхода** | `curl https://84.54.56.73.nip.io/released-catalog.json/.` | HTTP 401 Unauthorized (обход закрыт) | **PASS** |
| **Backend Test Suite** | `python scripts/run_backend_tests.py` | 331 тестов PASS (включая 7 тестов owner_access_mode) | **PASS** |
| **Frontend Unit Tests** | `npm run test:unit` | 249 тестов PASS, 0 fail | **PASS** |
| **Playwright Full E2E** | `npx playwright test --config playwright.full.config.ts` | 15 тестов PASS (320px–1440px, persistence, start gate, support) | **PASS** |
| **Автономный сетевой выход ВМ (TASK-NET-1)** | Ожидание штатного экспорта профиля Happ | В процессе получения профиля от владельца | **IN_PROGRESS** |

---

## 3. Регламент взаимодействия агентов (Agent-First)

- **Единый вход**: `docs/AGENT_CONTEXT_HUB.md` и `AGENTS.md`.
- **Принцип работы**: 1 задача = 1 исполнитель, без лишней бюрократии и повторных аудитов.
- **Охраняемые действия (GUARDED)**: требуют подтверждения владельца (`--confirm-phrase "СОГЛАСОВАНО ОЛЬГОЙ"`).
