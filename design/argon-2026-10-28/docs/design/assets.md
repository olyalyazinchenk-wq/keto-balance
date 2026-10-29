# Реестр визуальных ресурсов и иллюстраций (`docs/design/assets.md`)

Дата фиксации: 28 октября 2026 года  
Продукт: **«Кето Баланс»**

---

## 1. Политика честности визуальных материалов

1. В песочнице не используются случайные внешние URL-заглушки (`unsplash.com`, `picsum.photos`) и не выдаются сгенерированные изображения за реальные фотографии готовых блюд автора.
2. Каждая карточка блюда использует локальную векторную кулинарную иллюстрацию из `src/components/kb/RecipeArtwork.tsx` с явной подписью в интерфейсе:  
   `«Иллюстрация макета · Фото блюда: [УТОЧНИТЬ]»`.
3. Все иконки интерфейса берутся из локального пакета `lucide-react` (`^0.546.0`), установленного в `package.json`, с атрибутом `aria-hidden="true"` при наличии текстовой подписи.

---

## 2. Реестр кулинарных иллюстраций блюд (`src/components/kb/RecipeArtwork.tsx`)

| Ключ `artworkKey` | ID рецепта (`Recipe.id`) | Название блюда в прототипе | Состав иллюстрации | Источник и лицензия | Статус реального фото блюда |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `eggs_avocado` | `kb-rec-eggs-avocado` | Яичница-глазунья на топлёном масле с половинкой спелого авокадо и зеленью | Светлая керамическая тарелка на льняной салфетке, два яйца глазуньи, дольки спелого авокадо и листики зелени | Авторская локальная SVG-графика проекта (`src/components/kb/RecipeArtwork.tsx`), Apache-2.0 / собственность репозитория | `[УТОЧНИТЬ: фото из архива марафона Ольги]` |
| `cottage_scramble` | `kb-rec-cottage-scramble` | Нежный творожный скрэмбл со сливочным маслом и зелёным луком | Пышный яично-творожный скрэмбл в тёплой миске с перьями зелёного лука | Авторская локальная SVG-графика проекта (`src/components/kb/RecipeArtwork.tsx`), собственность репозитория | `[УТОЧНИТЬ: фото из архива марафона Ольги]` |
| `baked_fish_herbs` | `kb-rec-baked-fish-herbs` | Запечённое филе белой или красной рыбы с лимоном и цветной капустой | Запечённое рыбное филе, соцветия цветной капусты и ломтики лимона | Авторская локальная SVG-графика проекта (`src/components/kb/RecipeArtwork.tsx`), собственность репозитория | `[УТОЧНИТЬ: фото из архива марафона Ольги]` |
| `chicken_thighs_greens` | `kb-rec-chicken-thighs-greens` | Румяные куриные бёдра на сковороде с салатом из свежих огурцов и редиса | Румяные куриные бёдра с золотистой корочкой и свежая листовая зелень с огурцом | Авторская локальная SVG-графика проекта (`src/components/kb/RecipeArtwork.tsx`), собственность репозитория | `[УТОЧНИТЬ: фото из архива марафона Ольги]` |
| `beef_patties_butter` | `kb-rec-beef-patties-butter` | Домашние рубленые бифштексы из говядины с томлёным кабачком и маслом | Два рубленых говяжьих бифштекса с кусочком сливочного масла и кружочками кабачка | Авторская локальная SVG-графика проекта (`src/components/kb/RecipeArtwork.tsx`), собственность репозитория | `[УТОЧНИТЬ: фото из архива марафона Ольги]` |
| `turkey_zucchini_skillet` | `kb-rec-turkey-zucchini-skillet` | Томлёное филе бедра индейки с кабачком и свежим укропом в сотейнике | Кусочки томлёной индейки с кабачком и зеленью укропа | Авторская локальная SVG-графика проекта (`src/components/kb/RecipeArtwork.tsx`), собственность репозитория | `[УТОЧНИТЬ: фото из архива марафона Ольги]` |
| `pork_roast_cabbage` | `kb-rec-pork-roast-cabbage` | Тушёная свиная шейка с молодой белокочанной капустой и тмином | Глубокая тарелка с тушёной капустой и кусочками румяной свинины | Авторская локальная SVG-графика проекта (`src/components/kb/RecipeArtwork.tsx`), собственность репозитория | `[УТОЧНИТЬ: фото из архива марафона Ольги]` |
| `carnivore_steak_eggs` | `kb-rec-carnivore-steak-eggs` | Говяжий антрекот на чугунной сковороде с двумя желтками (Карнивор) | Говяжий антрекот с яичным желтком без растительных гарниров | Авторская локальная SVG-графика проекта (`src/components/kb/RecipeArtwork.tsx`), собственность репозитория | `[УТОЧНИТЬ: фото из архива марафона Ольги]` |

---

## 3. Реестр системных иконок (`lucide-react`)

| Иконка | Экран / компонент | Назначение |
| :--- | :--- | :--- |
| `Calendar`, `UtensilsCrossed`, `ShoppingBag`, `BookOpen`, `MoreHorizontal` | `AppShell.tsx` | 5 разделов основной навигации (`Сегодня`, `Меню`, `Покупки`, `Дневник`, `Ещё`) |
| `ArrowLeft`, `ArrowRight` | `AppShell.tsx`, `StartAndSettingsScreens.tsx`, `DiarySupportMoreScreens.tsx` | Возврат по стеку экранов и переходы по шагам анкеты |
| `MessageCircle` | `AppShell.tsx`, `SupportScreen` | Переход к личной поддержке Ольги |
| `Clock`, `RefreshCw`, `SlidersHorizontal`, `AlertCircle` | `TodayAndMenuScreens.tsx` | Время готовки, замена блюда в меню, переход к фильтрам, пустое состояние при конфликте ограничений |
| `Copy`, `Check`, `AlertTriangle` | `RecipeAndShoppingScreens.tsx`, `SupportScreen` | Копирование списка покупок в буфер обмена, чекбоксы шагов, предупреждение об изменении меню и демо-режиме |
| `Plus`, `Pencil`, `Trash2`, `ShieldCheck`, `Sparkles`, `RotateCcw` | `DiarySupportMoreScreens.tsx` | Добавление/редактирование/удаление записи дневника, приватность, сброс локальных данных, уровни доступа |

---

## 4. Скриншоты верификации (`docs/design/screenshots/`)

Все скриншоты сняты автоматизированно из реального браузера Chromium (`playwright-cli`) с актуальной сборки прототипа:

- Мобильные (`390×844`):
  - `docs/design/screenshots/mobile-start.png`
  - `docs/design/screenshots/mobile-settings.png`
  - `docs/design/screenshots/mobile-today.png` (Направление A)
  - `docs/design/screenshots/mobile-today-b.png` (Альтернатива B)
  - `docs/design/screenshots/mobile-menu.png` (Направление A)
  - `docs/design/screenshots/mobile-menu-b.png` (Альтернатива B)
  - `docs/design/screenshots/mobile-recipe.png`
  - `docs/design/screenshots/mobile-shopping.png`
  - `docs/design/screenshots/mobile-diary.png`
  - `docs/design/screenshots/mobile-support.png`
  - `docs/design/screenshots/mobile-more.png`
  - `docs/design/screenshots/mobile-access.png`
- Полная браузерная версия (`1280×800`):
  - `docs/design/screenshots/desktop-today.png`
  - `docs/design/screenshots/desktop-menu.png`
  - `docs/design/screenshots/desktop-shopping.png`
