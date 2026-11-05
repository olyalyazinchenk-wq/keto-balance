# LIVE STATUS — Кето Баланс (Agent-First Operations)

> **Единая точка оперативной правды для всех агентов и разработчиков.**
> Обновляется автоматически утилитой `python scripts/agent_ops.py sync-status`.
> **Последнее автоматическое обновление**: 2026-11-05 04:09:42 RTZ 2 (зима) · Antigravity

---

## 1. Текущий срез и репозиторий

- **Проект**: Keto-Balance (Премиум Telegram Mini App + Бот).
- **Канонический репозиторий**: `https://github.com/olyalyazinchenk-wq/keto-balance`
- **Текущая ветка**: `feat/cloudru-real-teardown-and-backup-hardening`
- **HEAD коммит**: `23bf9d0b` (23bf9d0b5435efe8e702773140a09845b046e711)
- **Автоматический CI**: `.github/workflows/ci.yml` (активен для всех push и pull request).
- **Домашний показ (Home Pilot)**:
  - Порт сервера: строго **`127.0.0.1:18081`** (`http://127.0.0.1:18081/api/health` -> RUNNING).
  - Служба: `KetoBalanceHomePilot` в Windows Task Scheduler.
- **Изоляция проекта NutriOK («Новая папка»)**:
  - Служба `WellnessBot`: статус `Disabled` (полная изоляция, 0 конфликтов поллинга).
- **Финансовый статус**:
  - Расходы в Cloud.ru: строго **0.00 руб.**
  - Грант: не активирован, банковские карты не привязаны.
  - Учётные данные Cloud.ru в хранилище `.secrets/`: Отсутствуют.

---

## 2. Подтверждённые факты и верификация (Machine Evidence)

| Проверка / Компонент | Команда | Результат | Статус |
|---|---|---|:---:|
| **Backend Test Suite & Guards** | `python scripts/run_backend_tests.py` | **227 passed, 0 failed, 0 errors, 0 skipped** | **PASS** |
| **Frontend Unit Tests** | `npm run test:unit` | **195 passed, 0 failed** (68 тестовых файлов, TAP v13) | **PASS** |
| **TypeScript Typecheck** | `npm run typecheck` | `tsc --noEmit` код 0, **0 диагностических ошибок** | **PASS** |
| **Docker Compose Config** | `docker compose --env-file .env.production.example config` | Конфигурация 1 vCPU / 2 ГБ RAM валидна | **PASS** |
| **Agent Ops Infrastructure** | `python -m unittest tests.backend.test_agent_ops` | **6 passed, 0 failed** (P0-блокировки, бэкап-дрилл) | **PASS** |
| **Cloud.ru 11-Service Audit** | `python -m unittest tests.backend.test_cloudru_teardown` | **23 passed, 0 failed** (защита от ложного нуля) | **PASS** |
| **Non-Destructive Backup Drill** | `python scripts/agent_ops.py backup-drill` | Шифрование AES-256-GCM + PBKDF2, 100% целостность | **PASS** |
| **Emergency Migration Bundle** | `deploy/docker-compose.migration.yml` | Сформирован для переноса на Yandex Cloud / VPS | **PASS** |

---

## 3. Регламент взаимодействия агентов (Agent-First)

- **Быстрый старт**: вход через [`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) и [`AGENTS.md`](../AGENTS.md).
- **Принцип работы**: 1 задача = 1 исполнитель, без лишней бюрократии и повторных аудитов.
- **Охраняемые действия (GUARDED)**: любое действие с финансовыми обязательствами или публичным релизом требует явного подтверждения владельца (`--owner-approved`).
