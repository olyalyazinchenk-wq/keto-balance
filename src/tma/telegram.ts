export type Insets = { top?: number; bottom?: number; left?: number; right?: number };

export type HapticType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error'
  | 'impact_light'
  | 'impact_medium'
  | 'impact_heavy'
  | 'notification_success'
  | 'notification_warning'
  | 'notification_error';

export type MiniApp = {
  initData?: string;
  viewportStableHeight?: number;
  viewportHeight?: number;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string | undefined>;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  ready?: () => void;
  expand?: () => void;
  onEvent?: (event: string, fn: () => void) => void;
  offEvent?: (event: string, fn: () => void) => void;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  openInvoice?: (url: string, callback?: (status: string) => void) => void;
  BackButton?: {
    isVisible?: boolean;
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: MiniApp;
    };
  }
}

export function getMiniApp(): MiniApp | undefined {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

export function initTelegram(
  tg: MiniApp | undefined = getMiniApp(),
  root: any = typeof document !== 'undefined'
    ? document.documentElement
    : { style: { setProperty: () => {}, removeProperty: () => {} } }
): () => void {
  const update = () => {
    const height = tg?.viewportStableHeight || tg?.viewportHeight;
    if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
      root.style.setProperty('--kb-viewport-height', `${height}px`);
    } else {
      root.style.removeProperty('--kb-viewport-height');
    }
    for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
      const safe = Math.max(0, Number(tg?.safeAreaInset?.[edge]) || 0);
      const content = Math.max(0, Number(tg?.contentSafeAreaInset?.[edge]) || 0);
      root.style.setProperty(`--kb-safe-${edge}`, `${safe}px`);
      root.style.setProperty(`--kb-content-${edge}`, `${content}px`);
    }
  };

  const events = ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged'];
  update();
  for (const event of events) {
    tg?.onEvent?.(event, update);
  }

  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch {
    // Optional native bridge must not break a standalone preview.
  }

  return () => {
    for (const event of events) {
      tg?.offEvent?.(event, update);
    }
  };
}

export function syncNativeColors(
  tg: MiniApp | undefined = getMiniApp(),
  background: string = '#F4F8F5',
  card: string = '#FFFFFF'
): void {
  if (!tg) return;
  try {
    if (tg.isVersionAtLeast?.('7.0')) tg.setHeaderColor?.(background);
    if (tg.isVersionAtLeast?.('6.1')) tg.setBackgroundColor?.(background);
    if (tg.isVersionAtLeast?.('7.10')) tg.setBottomBarColor?.(card);
  } catch {
    // Older clients may reject optional native color operations.
  }
}

export function triggerHaptic(type: HapticType = 'selection'): void {
  if (typeof window === 'undefined') return;
  try {
    // Audit / verification hook for automated tests & inspection
    const win = window as any;
    win.__hapticLog = win.__hapticLog || [];
    win.__hapticLog.push({ type, timestamp: Date.now() });

    const tg = window.Telegram?.WebApp;
    const haptic = tg?.HapticFeedback;
    if (haptic) {
      if (tg.isVersionAtLeast && !tg.isVersionAtLeast('6.1')) {
        // Version too old
      } else {
        switch (type) {
          case 'light':
          case 'impact_light':
            haptic.impactOccurred?.('light');
            return;
          case 'medium':
          case 'impact_medium':
            haptic.impactOccurred?.('medium');
            return;
          case 'heavy':
          case 'impact_heavy':
            haptic.impactOccurred?.('heavy');
            return;
          case 'selection':
            haptic.selectionChanged?.();
            return;
          case 'success':
          case 'notification_success':
            haptic.notificationOccurred?.('success');
            return;
          case 'warning':
          case 'notification_warning':
            haptic.notificationOccurred?.('warning');
            return;
          case 'error':
          case 'notification_error':
            haptic.notificationOccurred?.('error');
            return;
        }
      }
    }

    // Safe browser fallback via Vibration API
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      if (type === 'error' || type === 'notification_error') {
        navigator.vibrate([30, 40, 30]);
      } else if (type === 'success' || type === 'notification_success') {
        navigator.vibrate([20, 30, 20]);
      } else if (type === 'warning' || type === 'notification_warning') {
        navigator.vibrate([25, 25]);
      } else if (type === 'heavy' || type === 'impact_heavy') {
        navigator.vibrate(25);
      } else if (type === 'medium' || type === 'impact_medium') {
        navigator.vibrate(15);
      } else {
        navigator.vibrate(8);
      }
    }
  } catch {
    // Suppress errors in environments without vibration support
  }
}

export function applyTelegramTheme(
  tg: MiniApp | undefined = getMiniApp(),
  root: any = typeof document !== 'undefined' ? document.documentElement : undefined
): 'light' | 'dark' {
  let scheme: 'light' | 'dark' = tg?.colorScheme === 'dark' ? 'dark' : 'light';
  if (!tg?.colorScheme && typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      scheme = 'dark';
    }
  }
  if (root && root.classList) {
    if (scheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-kb-theme', 'dark');
      if (root.style) root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-kb-theme', 'light');
      if (root.style) root.style.colorScheme = 'light';
    }
  }
  const bg = scheme === 'dark' ? '#0B1410' : '#F4F8F5';
  const card = scheme === 'dark' ? '#12201A' : '#FFFFFF';
  syncNativeColors(tg, bg, card);
  return scheme;
}

type LateListener = (tg: MiniApp, root: any) => void;
const lateListeners: Set<LateListener> = new Set();

export function onLateTelegramSDK(listener: LateListener): () => void {
  lateListeners.add(listener);
  return () => {
    lateListeners.delete(listener);
  };
}

export function handleLateTelegramSDK(
  tg: MiniApp | undefined = getMiniApp(),
  root: any = typeof document !== 'undefined'
    ? document.documentElement
    : { style: { setProperty: () => {}, removeProperty: () => {} } }
): void {
  const activeTg = tg || getMiniApp();
  if (!activeTg) return;

  applyTelegramTheme(activeTg, root);

  const height = activeTg.viewportStableHeight || activeTg.viewportHeight;
  if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
    root.style?.setProperty?.('--kb-viewport-height', `${height}px`);
  }
  for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
    const safe = Math.max(0, Number(activeTg.safeAreaInset?.[edge]) || 0);
    const content = Math.max(0, Number(activeTg.contentSafeAreaInset?.[edge]) || 0);
    root.style?.setProperty?.(`--kb-safe-${edge}`, `${safe}px`);
    root.style?.setProperty?.(`--kb-content-${edge}`, `${content}px`);
  }

  if (lateListeners.size > 0) {
    for (const listener of Array.from(lateListeners)) {
      try {
        listener(activeTg, root);
      } catch {
        // Ignore listener error
      }
    }
  } else {
    // If no setupTelegramApp was mounted, still invoke ready and expand
    try {
      activeTg.ready?.();
      activeTg.expand?.();
    } catch {
      // Ignore
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('telegram:sdk_ready', { detail: { tg: activeTg } }));
    } catch {
      // Ignore
    }
  }
}

export function setupTelegramApp(
  tg: MiniApp | undefined = getMiniApp(),
  root: any = typeof document !== 'undefined'
    ? document.documentElement
    : { style: { setProperty: () => {}, removeProperty: () => {} } }
): () => void {
  let activeTg = tg || getMiniApp();
  let cleanupInit: (() => void) | null = null;
  let handleTheme: (() => void) | null = null;
  let handleViewport: (() => void) | null = null;

  const bindTg = (instance: MiniApp) => {
    activeTg = instance;
    cleanupInit = initTelegram(activeTg, root);
    applyTelegramTheme(activeTg, root);

    handleTheme = () => {
      applyTelegramTheme(activeTg, root);
    };

    handleViewport = () => {
      const scheme: 'light' | 'dark' = activeTg?.colorScheme === 'dark' ? 'dark' : 'light';
      const bg = scheme === 'dark' ? '#0B1410' : '#F4F8F5';
      const card = scheme === 'dark' ? '#12201A' : '#FFFFFF';
      syncNativeColors(activeTg, bg, card);
    };

    activeTg.onEvent?.('themeChanged', handleTheme);
    activeTg.onEvent?.('viewportChanged', handleViewport);
    activeTg.onEvent?.('safeAreaChanged', handleViewport);
    activeTg.onEvent?.('contentSafeAreaChanged', handleViewport);
  };

  if (activeTg) {
    bindTg(activeTg);
  }

  const unsubscribeLate = onLateTelegramSDK((lateInstance) => {
    if (!activeTg) {
      bindTg(lateInstance);
    }
  });

  return () => {
    unsubscribeLate();
    if (cleanupInit) cleanupInit();
    if (activeTg && handleTheme && handleViewport) {
      activeTg.offEvent?.('themeChanged', handleTheme);
      activeTg.offEvent?.('viewportChanged', handleViewport);
      activeTg.offEvent?.('safeAreaChanged', handleViewport);
      activeTg.offEvent?.('contentSafeAreaChanged', handleViewport);
    }
  };
}

export function bindBackButton(
  tgOrAction?: MiniApp | (() => void),
  action?: () => void
): () => void {
  let tg: MiniApp | undefined;
  let act: (() => void) | undefined;

  if (typeof tgOrAction === 'function') {
    act = tgOrAction;
    tg = getMiniApp();
  } else {
    tg = tgOrAction ?? getMiniApp();
    act = action;
  }

  const button = tg?.BackButton;
  if (!button || !act) return () => undefined;
  button.onClick(act);
  button.show();
  return () => {
    button.offClick(act!);
    button.hide();
  };
}

export function showBackButton(
  action: () => void,
  tg: MiniApp | undefined = getMiniApp()
): () => void {
  return bindBackButton(tg, action);
}

export function hideBackButton(tg: MiniApp | undefined = getMiniApp()): void {
  try {
    tg?.BackButton?.hide?.();
  } catch {
    // Ignore in browsers / older clients
  }
}

export function setNativeBackButton(
  visible: boolean,
  onBack?: () => void,
  tg: MiniApp | undefined = getMiniApp()
): () => void {
  if (visible && onBack) {
    return bindBackButton(tg, onBack);
  }
  hideBackButton(tg);
  return () => {};
}
