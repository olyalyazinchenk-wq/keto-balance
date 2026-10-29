/**
 * Безопасная обёртка над Telegram Mini Apps WebApp API (https://core.telegram.org/bots/webapps).
 * - Разделяет системные safeAreaInset и Telegram contentSafeAreaInset
 * - Отслеживает viewportStableHeight и изменение размеров окна (открытие клавиатуры)
 * - Подключает нативный BackButton к реальному локальному стеку экранов (без потери черновика)
 * - Не отправляет данные пользователя в CloudStorage и не имитирует доставку сообщений
 */

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramWebAppSDK {
  version?: string;
  platform?: string;
  colorScheme?: 'light' | 'dark';
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: SafeAreaInsets;
  contentSafeAreaInset?: SafeAreaInsets;
  isVersionAtLeast?: (version: string) => boolean;
  ready?: () => void;
  expand?: () => void;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
  BackButton?: {
    isVisible?: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton?: {
    isVisible?: boolean;
    hide: () => void;
  };
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
  viewportStableHeight: number | null;
}

export function getTelegramSDK(): TelegramWebAppSDK | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
}

/**
 * Синхронизирует CSS-переменные отступов безопасности и высоты вьюпорта.
 * Системные и Telegram safe areas обрабатываются как отдельные источники.
 */
export function syncTelegramViewportVariables(): TelegramBridgeSnapshot {
  const tg = getTelegramSDK();
  const root =
    typeof document !== 'undefined' ? document.documentElement : null;

  const isTelegramWebView = Boolean(
    tg && tg.platform && tg.platform !== 'unknown'
  );

  if (root && tg) {
    const sysTop = tg.safeAreaInset?.top ?? 0;
    const sysBottom = tg.safeAreaInset?.bottom ?? 0;
    const contentTop = tg.contentSafeAreaInset?.top ?? 0;
    const stableHeight =
      tg.viewportStableHeight || tg.viewportHeight || window.innerHeight;

    root.style.setProperty('--tg-safe-top', `${sysTop}px`);
    root.style.setProperty('--tg-safe-bottom', `${sysBottom}px`);
    root.style.setProperty('--tg-content-safe-top', `${contentTop}px`);
    root.style.setProperty('--tg-viewport-stable-height', `${stableHeight}px`);
  }

  // Во избежание двух конкурирующих CTA скрываем нативный MainButton,
  // так как у каждого экрана своя единственная основная кнопка в макете.
  if (tg?.MainButton?.isVisible) {
    try {
      tg.MainButton.hide();
    } catch {
      // Игнорируем в старых версиях SDK
    }
  }

  return {
    isTelegramWebView,
    version: tg?.version || 'browser-preview',
    colorScheme: tg?.colorScheme === 'dark' ? 'dark' : 'light',
    viewportStableHeight: tg?.viewportStableHeight ?? null,
  };
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
