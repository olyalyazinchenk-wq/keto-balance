# LIVE STATUS — Кето Баланс (Home Pilot & Release Candidate 1.0.0)

> **Единая точка оперативной правды для всех агентов и разработчиков.**
> Читать первым при входе в сессию. Обновлять при завершении этапа.
> **Последнее обновление**: 2026-11-02 04:45 MSK · Antigravity (Strict safe termination by PID, create_time and full absolute executable path; removed port-only termination; eliminated active-process path fallback; 57 tests passed: 45 ops + 12 backend).

---

## 1. Текущий срез и репозиторий

- **Проект**: Keto-Balance (Премиум Telegram Mini App + Бот).
- **Канонический путь**: `C:\Users\HP\Keto-balance`.
- **Ветка релиза**: `release/1.0.0` (создана от `design/argon-ui-import`).
- **HEAD коммит**: `b29659c` — `fix(ops): harden process matching, tree termination, URL normalization, and receipt dist validation`.
- **Текущий этап**: **Home Pilot — защищённый домашний показ для Ольги (Telegram ID 1084557944)**.
- **Инфраструктура показа**:
  - Изолированный порт сервера: строго **`127.0.0.1:18081`** (порты 8000, 4387, 8090, 10808, 10809 не затрагиваются).
  - Внешнее подключение: SSH-туннель `localhost.run` с верификацией SSH host key (`StrictHostKeyChecking=yes`).
  - Персональное меню Telegram: кнопка «🥑 Открыть Кето Баланс» обновляется строго в чате Ольги (`chat_id=1084557944`).
  - Автозапуск и защита от сбоев: задача Windows Task Scheduler `KetoBalanceHomePilot` (`ops/setup-home-pilot-task.ps1`).
- **Смежный контур НутриОК** (`C:\Users\HP\Desktop\Новая папка`):
  - Единственный легитимный владелец Telegram updates — Windows Scheduled Task `WellnessBot`.
  - Запуск второго слушателя категорически запрещён.

---

## 2. Подтверждённые факты и верификация (Evidence)

Все значения в этой таблице получены реальным выполнением команд:

| Компонент / Проверка | Команда | Результат | Статус |
|---|---|---|:---:|
| **Home Pilot Ops Suite** | `unittest discover -s tests/ops -p test_home_pilot.py` | **45 passed, 0 failed** (безопасность токена, независимое восстановление, полный абсолютный путь процесса, 8 негативных тестов, защита от остановки чужих процессов, 11 тестов отсутствующего/неполного/устаревшего состояния, бэкофф) | **PASS** |
| **Home Staging & Webhook Security** | `unittest test_home_staging test_payment_webhook_security` | **12 passed, 0 failed** (авторизация Ольги 1084557944, persistent DB, receipt alignment, безопасные платежи) | **PASS** |
| **Recovery Drill (Live)** | `ops/status-keto-balance.ps1` | Сервер PID 18932 сохранён при падении туннеля, туннель восстановлен (PID 23424), кнопка Ольги обновлена | **PASS** |
| **Backend Test Suite** | `python scripts/run_backend_tests.py` | **168 passed, 0 failed, 0 errors, 0 skipped** across all backend modules | **PASS** |
| **Subscription & Billing** | `unittest test_subscription_*.py` | **62 passed, 0 failed** (атомарность, идемпотентность, CAS, продление) | **PASS** |
| **Stars Webhook & Invoices** | `unittest test_telegram_stars_webhook.py` | **4 passed, 0 failed** (pre_checkout, successful_payment, replay idempotency) | **PASS** |
| **Data Governance & Consents** | `unittest test_data_rights.py` | **6 passed, 0 failed** (согласия, GDPR выгрузка, анонимизация заказов) | **PASS** |
| **Frontend Unit Tests** | `npm run test:unit` | **193 passed, 0 failed** across 68 test files (TAP v13) | **PASS** |
| **TypeScript Diagnostics** | `npm run typecheck` | `tsc --noEmit` завершился с кодом 0, **0 диагностических ошибок** | **PASS** |
| **Playwright Full E2E Suite** | `npx playwright test --config=playwright.full.config.ts` | **11 passed, 0 failed** (Chrome headless, 45.6s) | **PASS** |
| **Catalog Pre-Publication** | `npm run validate:catalog` | **42 PASS, 0 WARN, 0 ERROR** (макс. расхождение 26 ккал) | **PASS** |
| **Exploit Closure Check** | `unittest test_production_payment_boundaries.py` | `POST /api/subscription/confirm-demo` возвращает **403 Forbidden** в проде | **PASS** |
| **SQLite WAL Backup CLI Test** | `unittest test_backup_restore_cli.py` | Онлайн бэкап и восстановление с валидацией SHA-256 и `integrity_check` | **PASS** |
| **Real DB Backup/Restore Drill** | `drill_backup_restore.py` | Бэкап `bot/keto_balance.db`, восстановление в temp DB, `PRAGMA integrity_check` OK, **10/10 таблиц совпали, 0% потерь данных** | **PASS** |
| **Autostart Windows Task** | `ops/setup-home-pilot-task.ps1 -Status` | Задача `KetoBalanceHomePilot` зарегистрирована (`Ready`), AtLogOn trigger, auto-recovery 5 restarts/1m | **PASS** |
| **NutriOK Polling Single Owner** | `ops/agent-sync-status.ps1` | `WellnessBot` task Running, `BotOwnerCount: 1`, `LegacyHermesPolling: False` | **PASS** |

---

## 3. Реализованные этапы релиза и Home Pilot

- **R0–R6 (Release Candidate 1.0.0):** Инвентаризация, безопасность платежей (блокировка Stars в пилоте, закрытие обходов), каталогизация, Food-First UI, Docker-стек, утилиты бэкапов.
- **R7–R9 (Документация и готовность к пилоту):** `closed-pilot-results.md`, `paid-pilot-readiness.md`, `release-dossier.md`.
- **M5 (Пользовательские маршруты двух ботов):**
  - НутриОК: `/start`, дисклеймер Ольги, скрининг «ОК-Старт», сохранение состояния анкеты на диск, возобновление через `/continue`, выявление красных флагов (`find_red_flags`) и fail-closed шлюз аппрува (`review_gate.py`). Отсутствие ложных медицинских обещаний.
  - Кето Баланс: Приветствие `/start`, Start Gate (18+ и 152-ФЗ обязательные чекбоксы), настройки ограничений (аллергены: яйца, молочка, рыба, орехи; нелюбимое: субпродукты, грибы, авокадо, лук, брокколи, перец, морепродукты), меню дня с заменой блюд, рецепты с таймером у плиты, список покупок по отделам, строго бытовой характер без замены врача.
- **M6 (Инфраструктура Home Pilot и документация):**
  - Автозапуск: `ops/setup-home-pilot-task.ps1` (задача Windows `KetoBalanceHomePilot` с автовосстановлением и защитой от дублей).
  - Инженерный дрилл бэкапа и восстановления SQLite WAL: подтверждено нулевое расхождение данных.
  - Руководство пользователя и оператора: `docs/release/home-pilot-runbook.md`.
  - Полный технический отчёт: `docs/handoff/home-pilot-report.md`.

---

## 4. Следующие шаги координатора

1. Дождаться завершения интеграции сетевого туннеля и эндпоинтов Home Pilot Исполнителем А (M2–M4).
2. Запустить единый верификационный гейт `scripts/verification.py --stage home-pilot`.
3. Передать Ольге `docs/release/home-pilot-runbook.md` для личной проверки Mini App в Telegram.

