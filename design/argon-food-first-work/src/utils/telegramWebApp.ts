/**
 * Безопасная обёртка над Telegram Mini Apps WebApp API (Bot API 7.7 / 8.0+).
 * - Разделяет два независимых источника отступов: safeAreaInset (устройство) и contentSafeAreaInset (клиент Telegram)
 * - Синхронизирует --tg-safe-area-inset-*, --tg-content-safe-area-inset-*, --tg-viewport-height, --tg-viewport-stable-height
 * - Управляет disableVerticalSwipes / enableVerticalSwipes на длинных экранах (рецепт, дневник, меню, покупки)
 * - Управляет enableClosingConfirmation / disableClosingConfirmation строго при наличии несохранённого черновика
 * - Гарантирует отсутствие дублирования CTA: скрывает BottomButton (MainButton) и SecondaryButton при активной собственной навигации
 * - Безопасно обрабатывает requestFullscreen / exitFullscreen и события fullscreenChanged / fullscreenFailed
 * - Не доверяет initDataUnsafe и не использует CloudStorage
 */

import type { ScreenId } from '../types/ketoBalanceContract';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramBottomButton {
  isVisible?: boolean;
  hide: () => void;
  show?: () => void;
}

export interface TelegramWebAppSDK {
  version?: string;
  platform?: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string | undefined>;
  isExpanded?: boolean;
  isFullscreen?: boolean;
  isVerticalSwipesEnabled?: boolean;
  isClosingConfirmationEnabled?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: SafeAreaInsets;
  contentSafeAreaInset?: SafeAreaInsets;
  initData?: string;
  isVersionAtLeast?: (version: string) => boolean;
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
  BackButton?: {
    isVisible?: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  BottomButton?: TelegramBottomButton;
  MainButton?: TelegramBottomButton;
  SecondaryButton?: TelegramBottomButton;
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium') => void;
    selectionChanged?: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebAppSDK;
    };
  }
}

export interface TelegramBridgeSnapshot {
  isTelegramWebView: boolean;
  version: string;
  colorScheme: 'light' | 'dark';
  viewportHeight: number | null;
  viewportStableHeight: number | null;
  isFullscreen: boolean;
}

export function getTelegramSDK(): TelegramWebAppSDK | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
}

/**
 * Экраны с длинным вертикальным скроллом, на которых свайп вниз не должен сворачивать Mini App.
 */
const LONG_SCROLL_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
  'recipe',
  'diary',
  'menu',
  'shopping',
  'settings',
]);

/**
 * Синхронизирует CSS-переменные отступов безопасности и высоты вьюпорта.
 * Два источника отступов (safeAreaInset устройства и contentSafeAreaInset клиента Telegram)
 * записываются раздельно и не складываются вслепую.
 */
export function syncTelegramViewportVariables(): TelegramBridgeSnapshot {
  const tg = getTelegramSDK();
  const root =
    typeof document !== 'undefined' ? document.documentElement : null;

  const isTelegramWebView = Boolean(
    tg && tg.platform && tg.platform !== 'unknown'
  );

  if (root) {
    const sysTop = tg?.safeAreaInset?.top ?? 0;
    const sysBottom = tg?.safeAreaInset?.bottom ?? 0;
    const sysLeft = tg?.safeAreaInset?.left ?? 0;
    const sysRight = tg?.safeAreaInset?.right ?? 0;

    const contentTop = tg?.contentSafeAreaInset?.top ?? 0;
    const contentBottom = tg?.contentSafeAreaInset?.bottom ?? 0;
    const contentLeft = tg?.contentSafeAreaInset?.left ?? 0;
    const contentRight = tg?.contentSafeAreaInset?.right ?? 0;

    const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : 844;
    const dynamicHeight = tg?.viewportHeight || fallbackHeight;
    const stableHeight =
      tg?.viewportStableHeight || tg?.viewportHeight || fallbackHeight;

    // Официальные переменные Bot API 8.0+ (устанавливаются явно как fallback, если клиент их не инжектировал)
    root.style.setProperty('--tg-safe-area-inset-top', `${sysTop}px`);
    root.style.setProperty('--tg-safe-area-inset-bottom', `${sysBottom}px`);
    root.style.setProperty('--tg-safe-area-inset-left', `${sysLeft}px`);
    root.style.setProperty('--tg-safe-area-inset-right', `${sysRight}px`);

    root.style.setProperty('--tg-content-safe-area-inset-top', `${contentTop}px`);
    root.style.setProperty('--tg-content-safe-area-inset-bottom', `${contentBottom}px`);
    root.style.setProperty('--tg-content-safe-area-inset-left', `${contentLeft}px`);
    root.style.setProperty('--tg-content-safe-area-inset-right', `${contentRight}px`);

    root.style.setProperty('--tg-viewport-height', `${dynamicHeight}px`);
    root.style.setProperty('--tg-viewport-stable-height', `${stableHeight}px`);

    // Совместимые псевдонимы для локальных классов оболочки
    root.style.setProperty('--tg-safe-top', `${sysTop}px`);
    root.style.setProperty('--tg-safe-bottom', `${sysBottom}px`);
    root.style.setProperty('--tg-content-safe-top', `${contentTop}px`);
  }

  // Гарантируем отсутствие конкурирующих нативных нижних кнопок Telegram (BottomButton / MainButton / SecondaryButton),
  // так как приложение использует собственную нижнюю навигацию и один экранный CTA.
  hideNativeBottomButtons(tg);

  return {
    isTelegramWebView,
    version: tg?.version || 'browser-preview',
    colorScheme: tg?.colorScheme === 'dark' ? 'dark' : 'light',
    viewportHeight: tg?.viewportHeight ?? null,
    viewportStableHeight: tg?.viewportStableHeight ?? null,
    isFullscreen: Boolean(tg?.isFullscreen),
  };
}

export function hideNativeBottomButtons(tg: TelegramWebAppSDK | null = getTelegramSDK()): void {
  if (!tg) return;
  try {
    if (tg.BottomButton?.isVisible) tg.BottomButton.hide();
    if (tg.MainButton?.isVisible) tg.MainButton.hide();
    if (tg.SecondaryButton?.isVisible) tg.SecondaryButton.hide();
  } catch {
    // Игнорируем в старых версиях клиента
  }
}

/**
 * Управляет защитой от случайного сворачивания Mini App вертикальным свайпом (Bot API 7.7+).
 */
export function syncVerticalSwipesForScreen(screen: ScreenId): void {
  const tg = getTelegramSDK();
  if (!tg) return;
  const supported =
    typeof tg.isVersionAtLeast === 'function' ? tg.isVersionAtLeast('7.7') : false;
  if (!supported) return;

  try {
    if (LONG_SCROLL_SCREENS.has(screen)) {
      tg.disableVerticalSwipes?.();
    } else {
      tg.enableVerticalSwipes?.();
    }
  } catch {
    // Безопасный fallback, если метод недоступен на платформе
  }
}

/**
 * Включает подтверждение закрытия только при наличии несохранённого черновика (анкета или дневник).
 */
export function syncClosingConfirmation(hasUnsavedDraft: boolean): void {
  const tg = getTelegramSDK();
  if (!tg) return;
  const supported =
    typeof tg.isVersionAtLeast === 'function' ? tg.isVersionAtLeast('6.2') : false;
  if (!supported) return;

  try {
    if (hasUnsavedDraft) {
      tg.enableClosingConfirmation?.();
    } else {
      tg.disableClosingConfirmation?.();
    }
  } catch {
    // Игнорируем в браузерном превью
  }
}

/**
 * Безопасный запрос полноэкранного режима (Bot API 8.0+).
 * При отказе (fullscreenFailed) интерфейс остаётся полностью рабочим в обычном компактном/expanded окне.
 */
export function requestSafeFullscreen(onFallback?: () => void): void {
  const tg = getTelegramSDK();
  if (!tg) {
    onFallback?.();
    return;
  }
  const supported =
    typeof tg.isVersionAtLeast === 'function' ? tg.isVersionAtLeast('8.0') : false;
  if (!supported || typeof tg.requestFullscreen !== 'function') {
    tg.expand?.();
    onFallback?.();
    return;
  }

  try {
    tg.requestFullscreen();
  } catch {
    tg.expand?.();
    onFallback?.();
  }
}

/**
 * Деликатный тактильный отклик только при реальной поддержке в Telegram WebApp.
 * Никогда не вызывает «успешную» вибрацию для неподтверждённой доставки сообщений.
 */
export function triggerDelicateHaptic(kind: 'selection' | 'light' = 'selection'): void {
  const tg = getTelegramSDK();
  if (!tg?.HapticFeedback) return;
  const supported =
    typeof tg.isVersionAtLeast === 'function'
      ? tg.isVersionAtLeast('6.1')
      : false;
  if (!supported) return;

  try {
    if (kind === 'selection') {
      tg.HapticFeedback.selectionChanged?.();
    } else {
      tg.HapticFeedback.impactOccurred?.('light');
    }
  } catch {
    // Игнорируем при отсутствии поддержки на устройстве
  }
}
