# Итоговое досье релиза: Keto Balance 1.0.0 (Release Dossier)

## 1. Паспорт релиза

- **Продукт:** Telegram Mini App «Кето Баланс» (Keto Balance).
- **Версия:** `1.0.0-rc1`
- **Каноническая ветка релиза:** `release/1.0.0`
- **Коммиты релизного цикла:**
  - `84e7b3b` — `docs(teamwork): establish release/1.0.0 baseline, protocol and master release plan` (R0)
  - `e437613` — `feat(gate): start gate onboarding screen, Argon media assets and public build pipeline` (R0)
  - `17da381` — `feat(tma): Telegram WebApp native haptics, theme sync and safe area insets` (R0)
  - `d5d567b` — `fix(security): close demo subscription activation in production and sanitize paywall claims` (R1)
  - `f66f576` — `docs(commercial): specify single monthly Stars subscription and operational cost estimate` (R2)
  - `e8ff097` — `feat(governance): server-side consent logging, educational guides and financial audit preservation` (R3)
  - `1ef928d` — `feat(ui): complete education guides view, consent onboarding wireup and food-first flows` (R4)
  - `a0c35c6` — `feat(billing): telegram stars invoice creation and webhook payment handler` (R5)
  - `5fd6589` — `feat(ops): production docker compose, wal backup tooling and public-paid verification gate` (R6)
- **Целевая аудитория:** Взрослые русскоговорящие пользователи (18+), заинтересованные в безопасном и сбалансированном кето- и карнивор-питании под кураторством эксперта.

---

## 2. Сводная верификационная ведомость

| Компонент | Объем проверок | Результат | Статус |
|---|---|---|---|
| **Backend API & БД** | 168 автоматизированных тестов | 168 passed, 0 failed, 0 errors, 0 skipped | **PASS** |
| **Frontend Модули** | 193 юнит-теста (TAP v13) | 193 passed, 0 failed | **PASS** |
| **TypeScript Проверка типов** | `tsc --noEmit --incremental false` | 0 errors | **PASS** |
| **Playwright E2E Браузер** | 11 сквозных браузерных сценариев | 11 passed (45.6s) | **PASS** |
| **Каталог рецептов** | 42 канонических рецепта (26 кето, 16 карнивор) | 42 PASS, 0 WARN, 0 ERROR (макс. отклонение 26 ккал) | **PASS** |
| **Эксплойт демо-оплаты** | Закрыт HTTP 403 в production & staging | 5 passed (тест границ платежей) | **PASS** |
| **Резервное копирование SQLite** | Онлайн бэкап с проверкой SHA-256 и целостности | 1 passed (автоматический CLI дрилл) | **PASS** |

---

## 3. Коммерческая модель и платежная инфраструктура

1. **Единый тариф:**
   - Название: `sub_month` («Кето Баланс на месяц»).
   - Стоимость: 1 900 ₽ / 1 000 Telegram Stars (XTR).
   - Включает: Все 42 авторских блюда, планирование меню на 7 дней, умный автосписок покупок с объединением мер, персональный профиль с аллергенными фильтрами, база из 8 проверенных клинических руководств.
2. **Платежи Telegram Stars:**
   - Официальный платежный шлюз Telegram Stars (XTR).
   - Подтверждение покупки: мгновенное начисление статуса `👑 Premium` с фиксацией `expires_at` (+30 дней).
   - Идемпотентность транзакций: защита от повторных списаний и накруток.
   - Поддержка и возвраты: прозрачные условия через команду `/paysupport`, отмена через Telegram Settings, возврат через `refundStarPayment`.
3. **Экономика проекта:**
   - Серверный хостинг Linux VPS: ~550–790 ₽ / месяц.
   - Окупаемость: достигается при 1 активном подписчике в месяц.
   - Вывод Stars на Fragment в TON: минимальный порог 1 000 Stars, 21-дневный холд безопасности Telegram.

---

## 4. Вопросы, требующие утверждения Владельца (Owner Decisions)

Для перехода от статуса Release Candidate к боевому деплою требуется решение владельца по следующим пунктам:
1. **Утверждение цены в Telegram Stars:** Подтвердить базовый тариф 1 000 XTR (рекомендуемый эквивалент 1 900 ₽) или альтернативный сценарий (750 XTR / 1 500 XTR).
2. **Выбор хостинг-провайдера:** Согласовать аренду виртуального сервера (Selectel, Timeweb Cloud или FirstVDS, ~550–790 ₽/мес) и покупку домена (e.g. `ketobalance.app`, ~250 ₽/год).
3. **Настройка боевого бота Telegram:** Создание публичного бота через `@BotFather`, привязка Telegram Stars и получение production `TELEGRAM_BOT_TOKEN`.
4. **Слияние ветки релиза:** Одобрение слияния `release/1.0.0` в `master` после проверки представленных доказательств.
