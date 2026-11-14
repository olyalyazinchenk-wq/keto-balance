# Пакет Argon (Gemini 4 Argon, AI Studio Build) — импорт и проверка

Источник: приложение **«КетоПульс — Кето-питание в Telegram»** в Google AI Studio,
версия «Argon — контекст и задание» от 28.10.2026 04:13.

Способ выгрузки: **AI Studio → «Версии» → «Download version»** (ZIP). GitHub-синхронизация
в этой сессии не авторизована (требует OAuth + 2FA владельца), поэтому ZIP — штатный путь.

## Что проверено на этом ПК (не по отчёту Argon)

| Проверка | Команда | Результат |
|---|---|---|
| Модульные тесты логики | `node --test` (Node 26, только добавлены `.ts` в относительные импорты) | **5 pass, 0 fail** |
| Типы | `npx tsc --noEmit` | **exit 0** |
| Продакшен-сборка | `npm run build` (vite 8.3.5) | **ok, 1669 модулей, css 25 КБ / js 365 КБ (gzip 99 КБ)** |
| Аудит A1/A2 | `grep` по `server.ts` | маршрутов `/api/telegram/*`, `verified: true`, `send-report`, `webhook` **нет** |
| Аудит A6 | `grep` по `src/utils/telegramWebApp.ts` | обращений к `CloudStorage` **нет** |
| Скриншоты | `docs/design/screenshots/` | 15 PNG, просмотрены выборочно — реальный интерфейс |

## Установка (важные детали)

```bash
cd design/argon-2026-10-28
npm install --legacy-peer-deps      # vite@^8 конфликтует с пирами @tailwindcss/vite и @vitejs/plugin-react
npm run build
```

`postcss.config.js` в этой папке **обязателен и пустой**: иначе Vite подхватывает
`postcss.config.js` основного проекта (Tailwind 3 + autoprefixer) и сборка падает,
потому что пакет использует `@tailwindcss/vite` (Tailwind 4) через плагин Vite.

## Переносимость в основной проект (React 18 / Vite 5 / Tailwind 3)

- **React 19-only API не используются** (`use()`, `useOptimistic`, `useActionState` — нет). Компоненты совместимы с React 18.
- **Стили — на CSS-переменных** `--kb-*` (33 переменные) в произвольных классах вида `bg-[var(--kb-bg)]`; Tailwind 4-специфичных утилит (`size-*`, `bg-linear-*`, `inset-ring-*`) нет → переносится в Tailwind 3 как есть.
- **Единственная внешняя зависимость UI** — `lucide-react` (29 иконок в 9 файлах). `motion` в компонентах не импортируется (числится в `package.json` зря).
- Объём: ~4 470 строк (`components/kb/*`, `types`, `utils`, `data/fixtures`).

## Что сделать при переносе

1. `src/index.css` → перенести блок `:root { --kb-* }` и `[data-kb-theme="dark"]` в `src/index.css` основного проекта.
2. `lucide-react` — либо добавить зависимость, либо заменить 29 иконок на инлайновые SVG (в основном проекте сейчас зависимостей, кроме react, нет).
3. Компоненты `components/kb/*` + `types/ketoBalanceContract.ts` + `utils/ketoBalanceState.ts` + `utils/telegramWebApp.ts` — скопировать без изменений путей (импорты относительные).
4. `data/ketoBalanceFixtures.ts` — только для превью. В основном проекте данные берутся из `src/domain/*` и `src/data/recipes.ts` через адаптер, фикстуры в прод не идут.
5. `server.ts` песочницы **не переносить** — в основном проекте свой backend (FastAPI/бот).
6. Точки интеграции — `KetoBalanceIntegrationCallbacks` (см. `docs/design/integration.md`): `onChooseMenu`, `onReplaceRecipe`, `onUpdateShopping`, `onSaveDiaryEntry`, `onOpenSupport`, `onRequestAccess`.

## Ветка

`design/argon-ui-import` — только импорт пакета и эта записка. Продуктовый код основного
приложения (`src/*`, `bot/*`) не менялся; `master` не тронут.
