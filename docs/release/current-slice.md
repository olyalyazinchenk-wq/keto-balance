# Текущий рабочий срез (Current Slice)

**Дата:** 30 октября 2026 года, 16:16 МСК  
**Назначенный интегратор:** Hermes / Antigravity pair assistant  
- **Активный gate:** K1 prep (I01–I05 и V01–V06 выполнены, далее I06–I13 data bridge)  

## Прогресс критического пути
- [x] **K00–K09:** Локальный checkpoint восстановления дня (PASS).
- [x] **I01–I05:** Изоляция lifecycle сборки от неявного `bot_data.json` и защита `.env` (PASS).
- [x] **V01–V06:** Policy manifests технических stages в `scripts/verification.py` (PASS).
- [ ] **I06–I13:** Data bridge (адаптер `foodView.ts` и `menuController.ts`).
- [ ] **I14–I27:** Компонентный перенос 4 экранов food-first в `src/ui/food-first/`.
- [ ] **C01–C15:** Статический показ владельцу кнопкой Telegram (K1).

## Границы среза
- **Разрешено:**
  - K00–K06: TDD исправления инициализации и сохранения `selectedDayIndex` в `design/argon-food-first-work/src/utils/selectedDay.ts` и `src/App.tsx`.
  - K07: запуск существующих тестов и typecheck в `design/argon-food-first-work/`.
  - K08–K09: фиксация лога исполнения и acceptance checkpoint.
- **Запрещено:**
  - Редизайн экранов, изменение стилей или разметки.
  - Правка канонического домена или импорт `dayIndex` в `src/domain/`.
  - Изменение production backend, сетевые вызовы, запуск `npm run dev` со сторонним сервером.
  - Публикация, коммит, пуш.

## Критический путь к K1
`K0 (текущий) → I01–I05 (изоляция сборки) → V01–V06 (проверка 4 экранов) → I06–I20, I23–I27 (доменный адаптер и перенос) → C01–C15 (статический показ для владельца)`
