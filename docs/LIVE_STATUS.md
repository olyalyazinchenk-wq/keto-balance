# LIVE STATUS — Кето Баланс (Agent-First Operations)

> **Единая точка оперативной правды для всех агентов и разработчиков.**
> Обновляется автоматически утилитой `python scripts/agent_ops.py sync-status`.
> **Дата последнего обновления**: 2026-11-05 17:04:56 RTZ 2 (зима)
> **Инициатор обновления**: Antigravity
> **Проверенный SHA**: `0a25df4ccb5dec6062598e6d004ffb86f9e1b4f0` (ветка `feat/telegram-miniapp-launch-safety-20261105`)

---

## 1. Текущий срез и репозиторий

- **Проект**: Keto-Balance (Премиум Telegram Mini App + Бот).
- **Канонический репозиторий**: `https://github.com/olyalyazinchenk-wq/keto-balance`
- **Текущая ветка**: `feat/telegram-miniapp-launch-safety-20261105`
- **HEAD коммит**: `0a25df4c` (0a25df4ccb5dec6062598e6d004ffb86f9e1b4f0)
- **Автоматический CI в GitHub Actions**: `.github/workflows/ci.yml` (активен на каждый push/PR).
- **Домашний показ (Home Pilot)**:
  - Порт сервера: строго **`127.0.0.1:18081`** (`http://127.0.0.1:18081/api/health` -> RUNNING).
  - Служба: `KetoBalanceHomePilot` в Windows Task Scheduler.
- **Изоляция проекта NutriOK («Новая папка»)**:
  - Задача `WellnessBot`: `Disabled` (Изоляция: **ПОДТВЕРЖДЕНА**, причина: Задача WellnessBot найдена и гарантированно отключена (Disabled)).
- **Финансовый статус Cloud.ru**:
  - Фактические расходы: **UNKNOWN (учётные данные API отсутствуют, обращение к биллингу не производилось)**
  - Подтверждение нулевого остатка (zero_debt_confirmed): **НЕТ (UNKNOWN)**
  - Учётные данные Cloud.ru в хранилище `.secrets/`: Отсутствуют

---

## 2. Реально проверенные факты (Machine Evidence для SHA 0a25df4c)

| Проверка / Компонент | Команда | Результат | Статус |
|---|---|---|:---:|
| **Локальный Home Pilot (порт 18081)** | `curl http://127.0.0.1:18081/api/health` | RUNNING (код 200) | **PASS** |
| **Изоляция NutriOK (Task Scheduler)** | `Get-ScheduledTask WellnessBot` | Задача WellnessBot найдена и гарантированно отключена (Disabled) | **PASS** |
| **Backend Test Suite** | `python scripts/run_backend_tests.py` | UNKNOWN (не запускалось для текущего вызова sync-status на коммите 0a25df4c) | **UNKNOWN** |
| **Frontend Unit Tests** | `npm run test:unit` | UNKNOWN (не запускалось для текущего вызова sync-status на коммите 0a25df4c) | **UNKNOWN** |
| **TypeScript Typecheck** | `npm run typecheck` | UNKNOWN (не запускалось для текущего вызова sync-status на коммите 0a25df4c) | **UNKNOWN** |
| **Docker Compose Config** | `docker compose --env-file .env.production.example config` | UNKNOWN (не проверялось в текущем вызове sync-status) | **UNKNOWN** |
| **Облачный биллинг Cloud.ru** | `scripts/cloudru_teardown.py --audit-only` | UNKNOWN (учётные данные API отсутствуют, обращение к биллингу не производилось) | **UNKNOWN** |

---

## 3. Регламент взаимодействия агентов (Agent-First)

- **Единый вход**: [`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) и [`AGENTS.md`](../AGENTS.md).
- **Принцип работы**: 1 задача = 1 исполнитель, без лишней бюрократии и повторных аудитов.
- **Охраняемые действия (GUARDED)**: требуют подтверждения владельца (`--confirm-phrase "СОГЛАСОВАНО ОЛЬГОЙ"`).

## Локальный дизайн — 6 ноября 2026, Codex

Отдельная ветка feat/appetizing-interface-20261106, базовый c6ef3a9. Обновлён интерфейс, без изменения работающего Home Pilot. Проверены 237 модульных и 15 сквозных тестов; после замены шрифта дополнительно 3 стартовых теста. TypeScript и сборка e7cd5302667a7770 успешны. Статус: локально проверено, не опубликовано. Проверка в настоящем Telegram и на пяти добровольцах не выполнена. Подробности: [отчёт](design/appetizing/HANDOFF.md).
