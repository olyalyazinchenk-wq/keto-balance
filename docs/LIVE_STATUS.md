# LIVE STATUS — Кето Баланс (Release Candidate 1.0.0)

> **Единая точка оперативной правды для всех агентов и разработчиков.**
> Читать первым при входе в сессию. Обновлять при завершении этапа.
> **Последнее обновление**: 2026-11-01 15:15 MSK · Antigravity, Teamwork.

---

## 1. Текущий срез и репозиторий

- **Проект**: Keto-Balance (Премиум Telegram Mini App + Бот).
- **Канонический путь**: `C:\Users\HP\Keto-balance`.
- **Ветка релиза**: `release/1.0.0` (создана от `design/argon-ui-import`).
- **HEAD коммит**: `5fd6589` — `feat(ops): production docker compose, wal backup tooling and public-paid verification gate`.
- **Статус релиза**: **Release Candidate 1.0.0 (RC1) сформирован и полностью верифицирован**.
- **Протокол работы**:
  - НутриОК (`C:\Users\HP\Desktop\Новая папка`) находится **строго вне рамок** данного релизного цикла.
  - Боевые порты `8000`, `4387`, `8090`, `10808`, `10809` не затрагиваются.
  - Разрешены адресные коммиты и пуш в отдельную ветку `release/1.0.0`.
  - Слияние в `master`, аренда боевых серверов и реальное списание средств осуществляются только после явного утверждения владельцем.

---

## 2. Подтверждённые факты и верификация (Evidence)

Все значения в этой таблице получены реальным выполнением команд:

| Компонент / Проверка | Команда | Результат | Статус |
|---|---|---|:---:|
| **Backend Test Suite** | `python scripts/run_backend_tests.py` | **168 passed, 0 failed, 0 errors, 0 skipped** across all backend modules | **PASS** |
| **Subscription & Billing** | `unittest test_subscription_*.py` | **62 passed, 0 failed** (атомарность, идемпотентность, CAS, продление) | **PASS** |
| **Stars Webhook & Invoices** | `unittest test_telegram_stars_webhook.py` | **4 passed, 0 failed** (pre_checkout, successful_payment, replay idempotency) | **PASS** |
| **Data Governance & Consents** | `unittest test_data_rights.py` | **6 passed, 0 failed** (согласия, GDPR выгрузка, анонимизация заказов) | **PASS** |
| **Frontend Unit Tests** | `npm run test:unit` | **193 passed, 0 failed** across 68 test files (TAP v13) | **PASS** |
| **TypeScript Diagnostics** | `npm run typecheck` | `tsc --noEmit` завершился с кодом 0, **0 диагностических ошибок** | **PASS** |
| **Playwright Full E2E Suite** | `npx playwright test --config=playwright.full.config.ts` | **11 passed, 0 failed** (Chrome headless, 45.6s) | **PASS** |
| **Catalog Pre-Publication** | `npm run validate:catalog` | **42 PASS, 0 WARN, 0 ERROR** (макс. расхождение 26 ккал) | **PASS** |
| **Exploit Closure Check** | `unittest test_production_payment_boundaries.py` | `POST /api/subscription/confirm-demo` возвращает **403 Forbidden** в проде | **PASS** |
| **SQLite WAL Backup Drill** | `unittest test_backup_restore_cli.py` | Онлайн бэкап и восстановление с валидацией SHA-256 и `integrity_check` | **PASS** |
| **Production Docker Stack** | `deploy/compose.yaml`, `Dockerfile`, `nginx.conf` | Контейнеризация бэкенда, Nginx proxy, rate-limiting, static caching | **READY** |

---

## 3. Реализованные этапы релиза (Milestones R0–R8)

- **R0 (Инвентаризация и правила):** Ветка `release/1.0.0`, манифест `baseline-inventory.json` (230 файлов), master-план `release-plan.md`.
- **R1 (Безопасность и биллинг):** Демо-активация в продакшене закрыта с 403 Forbidden, Fail-closed при невалидном `expires_at`, очищены нереалистичные обещания с пейволла, оставлен строго 1 продукт `sub_month`.
- **R2 (Коммерческая спецификация и смета):** Подготовлены `commercial-spec.md` (Telegram Stars, 1 000 XTR, политика возвратов `/paysupport`) и `cost-estimate.md` (расходы на VPS ~550–790 ₽/мес, окупаемость при 1 подписчике, правила Fragment).
- **R3 (Каталог и Data Governance):** Серверное логирование согласий 18+ и ПДн (`POST /api/user/consents`), GDPR-выгрузка, сохранение фин. аудита через анонимизацию (`user_id = 0`), 8 экспертных руководств (`educational-guides.json`).
- **R4 (Пользовательские функции и UI):** Интеграция базы знаний в UI (`EducationGuides.tsx` в «Ещё» и «Дневнике»), привязка согласий на стартовом экране к API, Food-First навигация.
- **R5 (Telegram Stars и вебхук):** Обработка `pre_checkout_query` и `successful_payment` на `/api/telegram/webhook`, генерация инвойсов `createInvoiceLink` в XTR, команда `/paysupport` в боте.
- **R6 (Эксплуатация и бэкапы):** `deploy/compose.yaml`, `nginx.conf`, `Dockerfile`, утилиты `backup_db.py` и `restore_db.py`, расширение гейта `scripts/verification.py --stage public-paid`, обновление `pilot-runbook.md`.
- **R7 (Результаты закрытого пилота):** Оформлен `docs/release/closed-pilot-results.md`.
- **R8 (Чек-лист готовности к платному пилоту):** Оформлен `docs/release/paid-pilot-readiness.md`.
- **R9 (Итоговое досье и согласование):** Оформлен `docs/release/release-dossier.md`.

---

## 4. Следующие шаги координатора

1. Зафиксировать коммит этапов R7–R9 в ветке `release/1.0.0`.
2. Выполнить push ветки `release/1.0.0` в удаленный репозиторий `origin`.
3. Сформировать ссылку на Pull Request в ветку `master`.
4. Передать Владельцу итоговый отчёт с точными точками принятия решений.
