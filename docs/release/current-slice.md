# Текущий рабочий срез (Current Slice) — Gemini Working Pilot

**Дата:** 31 октября 2026 года
**Назначенный интегратор:** Gemini 3.8 в Antigravity (единственный интегратор и writer)
**Активный gate:** Рабочий пилот «Кето Баланс» (L0 -> L1 -> L2) по спецификации `docs/handoff/2026-10-31-gemini-deliver-working-pilot.md`
**Git Baseline:** `5f39a90f3eb59295869e389acc2a9add4b6e0ad0` на ветке `design/argon-ui-import`

## Прогресс критического пути
- [x] **K1 (Food-First UI & Data Bridge):** 4 экрана перенесены, unit/build/visual проверки выполнены.
- [x] **K2 (Baseline Backend & Validation):** Валидатор каталога 0 warnings, smart aggregation, baseline API.
- [x] **S01–S02:** Фиксация baseline, guard изоляции тестового ввода-вывода (`tests/helpers/pilot_io_guard.py`, `scripts/run_backend_tests.py`).
- [x] **A01–A05 (L0 Security):** Полное закрытие auth bypass, отрицательные route-тесты, hash-only сессии, валидация Telegram initData без mock/guest лазеек.
- [x] **C01–C07:** Wire v1 контракт (`pilotTypes.ts`, `pilot_models.py`), идемпотентная схема SQLite, CAS оптимистическая блокировка, roundtrip меню/настроек/покупок.
- [x] **R01–R03:** Статический release catalog exporter (`scripts/export-release-catalog.mjs`), инъекция `catalog_provider`, mapping ограничений и time guard.
- [x] **U01–U09 (L1 Connected UI):** `ketoClient.ts`, controlled `PilotApp.tsx`, save queue, связь экранов Сегодня/Меню/Рецепт/Покупки с реальным API и SQLite.
- [x] **H01:** Сохранение проверенного пути личной поддержки Ольге (`1084557944`).
- [x] **V01–V03 (L2 Verification Gate):** Изолированная сборка (`scripts/build-isolated.mjs`), test server на 18080, Playwright E2E тесты (food-flow, persistence, support), receipt/fingerprints.
- [ ] **V04 (Operational Packet):** Runbook, manifest и structured approval request владельцу.
- [ ] **T1–T2:** Внешний вход и приёмка владельцем (только после отдельного согласования).

## Границы среза
- **Разрешено:**
  - Автономная локальная реализация рубежей L0 -> L1 -> L2 в `C:\Users\HP\Keto-balance`.
  - Тестовый HTTP-сервер исключительно на `127.0.0.1:18080` с временными базами данных в `C:\Users\HP\AppData\Local\hermes\cache\scratch\`.
  - Изолированная сборка frontend без перезаписи боевого `dist/`.
- **Запрещено:**
  - Трогать чужие и боевые процессы (порт 8000, 4387, 8090, 10808, 10809).
  - Читать/раскрывать реальные секреты, `.env`, `.tunnel_cache.json`.
  - Модифицировать внешние сетевые сервисы или слать сообщения в Telegram до отдельного согласования.
  - Менять дизайн или проводить новые маркетинговые интервью.
