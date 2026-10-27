# Исходные визуальные свидетельства и параметры запуска (Before Release)

## Точки входа и параметры интерфейса

1. **Telegram Mini App (WebApp):**
   - Локальный URL: `http://localhost:3000/`
   - Режим сборки: Vite Production Build (`dist/`)
   - Загружаемые хэшированные ассеты (из `dist/index.html`):
     - JS: `/assets/index-DDJiayWj.js`
     - CSS: `/assets/index-NVK0USt6.css`
   - Viewport: `width=device-width, initial-scale=1.0`
   - Telegram WebApp SDK: `https://telegram.org/js/telegram-web-app.js`
   - Визуальный эталон (снимок экрана): `docs/audit/evidence/mobile-home.png`

2. **Telegram Bot Chat:**
   - Бот: `@keto_balance_userbot`
   - Тип интерфейса: Reply-клавиатура (9 кнопок) и Inline-кнопка перехода в Mini App `WebAppInfo(url=WEBAPP_URL)`
   - Важное разграничение: чат бота и Mini App — разные поверхности. Чат бота предоставляет текстовые карточки и меню, Mini App — интерактивное SPA в WebView.

3. **Цветовая палитра эталона:**
   - Фон приложения: `#F7F2E9` (мягкий тёплый кремовый)
   - Карточки: `#FFFFFF` (светлые со скруглёнными углами)
   - Основной текст: `#2B2620` (тёмно-коричневый/графит)
   - Акцент основной: `#5F7161` (натуральный шалфейный)
   - Акцент вторичный: `#8FA183`
   - Мягкий акцент: `#EDF1E6`
   - Герой-блок: зелёный мягкий градиент

4. **Диагностика отличий:**
   - Telegram WebApp на клиенте инициализируется без принудительной перекраски системных цветов.
   - Внешний Google Fonts (`Playfair Display`, `Inter` через CDN) подлежит замене на локальный Inter Variable согласно задаче B01.
