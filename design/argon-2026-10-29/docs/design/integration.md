# План переноса и интеграционные швы (`docs/design/integration.md`)

Дата фиксации: 28 октября 2026 года  
Песочница дизайна: `olyalyazinchenk-wq/Keto-Balance_Argon-4`  
Целевой репозиторий (без прямой записи из песочницы): `olyalyazinchenk-wq/keto-balance`

---

## 1. Архитектурный принцип разделения

Визуальный пакет спроектирован как самодостаточный слой представления (`src/components/kb/*`, `src/types/ketoBalanceContract.ts`, `src/utils/ketoBalanceState.ts`, `src/utils/telegramWebApp.ts`), который **не содержит встроенных секретов, прямых обращений к БД или фальшивых серверных маршрутов**.

При переносе в основной репозиторий `olyalyazinchenk-wq/keto-balance`:
- Доменные модели основного проекта остаются авторитетным источником данных.
- Демонстрационные фикстуры (`src/data/ketoBalanceFixtures.ts`) заменяются данными из существующего стора/API основного проекта через адаптер View Model.
- Все пользовательские действия пробрасываются через явный интерфейс `KetoBalanceIntegrationCallbacks`.

---

## 2. Сохранённые доменные контракты (Не ломать при переносе)

В `src/types/ketoBalanceContract.ts` строго соблюдены три инварианта базовой модели основного проекта:

1. **`Recipe.id` — строка (`string`):**
   ```ts
   export interface DomainRecipeRef {
     id: string; // например, 'kb-rec-eggs-avocado'
     title: string;
   }
   ```
   В UI-слое нигде не используются числовые ID рецептов.

2. **`DayMenu.slots` хранит строковые идентификаторы рецептов (`Record<string, string>`), а не вложенные объекты рецептов:**
   ```ts
   export interface DayMenu {
     dayIndex: number;
     label: string;
     slots: Record<string, string>; // { breakfast: 'kb-rec-eggs-avocado', lunch: '...', dinner: '...' }
   }
   ```
   Разрешение `slotKey -> RecipeViewModel` выполняется чистой функцией `resolveDayMenuSlots(dayMenu, recipesById, mealsPerDay)` из `src/utils/ketoBalanceState.ts`.

3. **`GeneratedMenu.created` — число (`number`, Unix timestamp):**
   ```ts
   export interface GeneratedMenu {
     id: string;
     created: number;
     title: string;
     days: DayMenu[];
   }
   ```

---

## 3. Точки интеграции (`KetoBalanceIntegrationCallbacks`)

Корневой компонент `<App integrationCallbacks={...} />` (`src/App.tsx`) принимает объект обратных вызовов:

| Колбэк | Сигнатура | Поведение в UI-прототипе (песочница) | Что подключить в `olyalyazinchenk-wq/keto-balance` |
| :--- | :--- | :--- | :--- |
| `onChooseMenu` | `(menu: GeneratedMenu) => void` | Сохраняет выбранное меню в `localStorage` и переключает состояние экрана «Сегодня» | Сохранение выбранного плана меню в пользовательской сессии / сторе основного приложения |
| `onReplaceRecipe` | `(dayIndex: number, slotKey: string, nextRecipeId: string) => void` | Обновляет `DayMenu.slots[slotKey] = nextRecipeId` и выставляет `shoppingNeedsRefresh = true` | Вызов штатного метода замены блюда в меню и пересчёт агрегированного списка покупок |
| `onUpdateShopping` | `(items: ShoppingFixtureItem[]) => void` | Обновляет отметки `alreadyHave` и `checkedInStore` локально; копирование работает только через `navigator.clipboard.writeText` | Синхронизация чек-листа покупок с локальным хранилищем или API основного проекта |
| `onSaveDiaryEntry` | `(entry: ManualDiaryEntry) => void` | Сохраняет/обновляет ручную текстовую запись в `localStorage` | Запись в приватное хранилище дневника пользователя (без отправки в внешние LLM/Drive) |
| `onOpenSupport` | `(context: { fromScreen: ScreenId; draftSaved: boolean; topic?: string }) => void` | Переводит экран поддержки в демонстрационное состояние и сохраняет шаг анкеты | Вызов `Telegram.WebApp.openTelegramLink(...)` или штатного бот-хендлера для перехода в личный диалог с Ольгой (с реальной проверкой `initData` на бэкенде) |
| `onRequestAccess` | `(tier: 'free' | 'starter' | 'subscription' | 'personal_support') => void` | Показывает локальное демо-уведомление без оплаты | Переход к реальному оформлению участия / связи с Ольгой после утверждения тарифов |

---

## 4. Какие файлы переносить в основной проект

| Файл в песочнице | Назначение при переносе |
| :--- | :--- |
| `src/index.css` | CSS-переменные палитры «Спокойная кухня» (`--kb-*`), резервная тёмная тема `[data-kb-theme="dark"]` и safe-area переменные Telegram |
| `src/types/ketoBalanceContract.ts` | Контракты View Model и интерфейс `KetoBalanceIntegrationCallbacks` |
| `src/utils/ketoBalanceState.ts` + `src/utils/ketoBalanceState.test.ts` | Чистые функции стека навигации, фильтрации рецептов без тихого снятия аллергий, разрешения слотов дня и форматирования списка покупок |
| `src/utils/telegramWebApp.ts` | Безопасная обёртка над `window.Telegram.WebApp` (`safeAreaInset`, `contentSafeAreaInset`, `viewportStableHeight`, `BackButton`, `MainButton.hide()`, деликатный `HapticFeedback`) |
| `src/components/kb/AppShell.tsx` | Адаптивная оболочка (5 вкладок Mobile + Desktop, кнопка «Назад», переход к поддержке Ольги) |
| `src/components/kb/StartAndSettingsScreens.tsx` | Экраны «Начало» (18+) и «Настройки» (3 шага с автосохранением черновика и opt-in напоминаниями) |
| `src/components/kb/TodayAndMenuScreens.tsx` | Экраны «Сегодня» и «Меню» (включая честное пустое состояние при конфликте фильтров и модальное окно замены блюда) |
| `src/components/kb/RecipeAndShoppingScreens.tsx` | Экраны «Рецепт и готовка» (1/2 порции, сохранение шагов) и «Покупки» (отделы, «Уже есть дома», индикатор изменённого меню) |
| `src/components/kb/DiarySupportMoreScreens.tsx` | Экраны «Ручной дневник», «Поддержка Ольги», «Ещё и материалы», «Предложение доступа» |
| `src/components/kb/RecipeArtwork.tsx` | Локальные SVG-иллюстрации блюд (до подключения реальных фотографий из папки бренда Ольги) |

---

## 5. Что намеренно оставлено за пределами этой дизайн-задачи

Следующие задачи относятся к серверной и инфраструктурной части основного проекта и **не должны имитироваться во фронтенд-прототипе**:
1. Криптографическая проверка подписи `Telegram.WebApp.initData` (`HMAC-SHA256` с токеном бота) на сервере.
2. Реальная отправка сообщений в Telegram Bot API и настройка webhook/команд бота.
3. Серверный парсер и нормализатор единиц измерения ингредиентов при динамической генерации списка покупок.
4. Подключение платёжного шлюза и биллинга подписок.
