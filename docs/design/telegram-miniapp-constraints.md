# Telegram Mini App — обязательные ограничения для UI «Кето Баланс»

Источник: официальная документация `core.telegram.org/bots/webapps` (актуальна на 29.10.2026,
включая Bot API 9.x). Здесь только то, что напрямую влияет на вёрстку и архитектуру переноса.

## 1. Безопасные зоны — два независимых источника

- `WebApp.safeAreaInset` — отступы устройства (вырез, home-indicator).
- `WebApp.contentSafeAreaInset` — отступы, которые добавляет сам клиент Telegram (шапка, нижняя панель).
- CSS-переменные: `--tg-safe-area-inset-top/right/bottom/left` и
  `--tg-content-safe-area-inset-top/right/bottom/left`.
- События изменения: `safeAreaChanged`, `contentSafeAreaChanged`.

**Правило:** это два разных источника, их нельзя слепо складывать и нельзя ограничиваться
одним `env(safe-area-inset-bottom)` (в webview он может быть нулевым). Итоговый отступ снизу —
`max(своя навигация, safeAreaInset.bottom + contentSafeAreaInset.bottom)`.

## 2. Высота вьюпорта и полноэкранный режим

- `viewportHeight` — текущая высота (меняется при открытии клавиатуры).
- `viewportStableHeight` — высота в последнем стабильном состоянии;
  CSS-переменные `--tg-viewport-height` и `--tg-viewport-stable-height`.
- `expand()` + `isExpanded` — развернуть на максимум.
- `requestFullscreen()` / `exitFullscreen()`, события `fullscreenChanged`, `fullscreenFailed`.
- `disableVerticalSwipes()` / `isVerticalSwipesEnabled` — иначе вертикальный свайп сворачивает
  Mini App и пользователь теряет контекст посреди дневника.

**Правило:** фиксированные панели привязывать к `viewportStableHeight`, а не к `100vh`; при
`fullscreenFailed` (устройство не поддерживает) интерфейс обязан остаться работоспособным.

## 3. Тема

- `themeParams` + CSS-переменные `--tg-theme-*` (bg, secondary_bg, text, hint, link, button,
  button_text, header_bg, accent_text, section_bg, section_separator, subtitle_text,
  destructive_text, bottom_bar_bg), плюс `colorScheme` и событие `themeChanged`.
- `headerColor`, `backgroundColor`, `bottomBarColor` + сеттеры `setHeaderColor`,
  `setBackgroundColor`, `setBottomBarColor`.

**Правило:** бренд «Кето Баланс» сохраняется, но светлая и тёмная темы — это два вручную
выверенных набора токенов, а не инверсия. Смена темы на лету не должна ломать читаемость
(проверять контраст в обеих).

## 4. Кнопки и навигация

- `BackButton`: `show/hide`, `onClick/offClick`. Возврат идёт по **реальному локальному стеку**
  экранов и не теряет черновик анкеты.
- `BottomButton` (бывший `MainButton`): `setText`, `show/hide`, `onClick/offClick`, `disable/enable`,
  `showProgress/hideProgress`.
- `SecondaryButton` — второе действие.
- `SettingsButton`, `HapticFeedback` — по версии.

**Правило:** один CTA на экран. Собственная нижняя навигация + `BottomButton` одновременно —
запрещено: они перекрывают друг друга.

## 5. Закрытие и черновики

`enableClosingConfirmation()` / `disableClosingConfirmation()` — включать, когда есть
несохранённый черновик анкеты или записи дневника; выключать, когда всё сохранено.
Не злоупотреблять: подтверждение на каждом экране раздражает.

## 6. Данные и идентичность

- `initData` **проверяется только на сервере** HMAC-SHA256 с токеном бота и сроком жизни.
  `initDataUnsafe` — не доверять ни для авторизации, ни для ownership записей.
- `CloudStorage` в проекте **не используется** (решение по приватности): дневник и профиль
  живут на нашем сервере. `DeviceStorage`/`SecureStorage` (Bot API 9.0) не нужны.
- Никаких «verified: true» при отсутствии токена — проверка либо есть, либо запрос отклонён.

## 7. Производительность и вёрстка

- Webview мобильный: без внешних CDN-шрифтов, без motion-библиотек, итоговый JS ≤ 400 КБ.
- Минимальная ширина 320 px, проверка 320 / 390 / 430 / 768 / 1280.
- Тач-цели ≥ 44×44 px (требование продукта), контраст обычного текста ≥ 4.5:1.
- `prefers-reduced-motion` обязателен; анимации — только осмысленные переходы на CSS.
- Изображения блюд — локальные файлы с известным происхождением; при отсутствии — честная
  иллюстрация и пометка `[УТОЧНИТЬ]`, а не стоковое фото.

## 8. Чек-лист приёмки переноса (Telegram-специфика)

- [ ] Нижняя навигация не перекрыта `BottomButton`/`contentSafeAreaInset` ни на одной ширине.
- [ ] Клавиатура не закрывает поле ввода и кнопку отправки в дневнике и в поддержке.
- [ ] `BackButton` возвращает по стеку и сохраняет черновик; обработчики снимаются при уходе с экрана.
- [ ] Смена темы Telegram на лету не ломает контраст и не «перекрашивает» бренд в чужой стиль.
- [ ] `disableVerticalSwipes` включён на экранах с длинной прокруткой (рецепт, дневник).
- [ ] Полноэкранный режим: при `fullscreenFailed` интерфейс остаётся рабочим.
- [ ] `initData` проверяется на сервере; ни один экран не показывает «отправлено» без подтверждения.
- [ ] Реальный запуск проверен в Telegram Android и iOS, а не только в браузере (браузерный
      скриншот нельзя подписывать как «проверено в Telegram»).
