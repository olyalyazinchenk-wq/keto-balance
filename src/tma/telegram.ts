export type Insets = { top?: number; bottom?: number; left?: number; right?: number };
export type MiniApp = {
  initData?: string;
  viewportStableHeight?: number;
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
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
};

declare global {
  interface Window { Telegram?: { WebApp?: MiniApp } }
}

export function getMiniApp(): MiniApp | undefined {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

export function initTelegram(
  tg: MiniApp | undefined = getMiniApp(),
  root: any = typeof document !== 'undefined' ? document.documentElement : { style: { setProperty: () => {}, removeProperty: () => {} } }
): () => void {
  const update = () => {
    const height = tg?.viewportStableHeight;
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
  for (const event of events) tg?.onEvent?.(event, update);
  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch {
    // Optional native bridge must not break a standalone preview.
  }
  return () => {
    for (const event of events) tg?.offEvent?.(event, update);
  };
}

export function syncNativeColors(tg: MiniApp | undefined, background: string, card: string) {
  if (!tg) return;
  try {
    if (tg.isVersionAtLeast?.('7.0')) tg.setHeaderColor?.(background);
    if (tg.isVersionAtLeast?.('6.1')) tg.setBackgroundColor?.(background);
    if (tg.isVersionAtLeast?.('7.10')) tg.setBottomBarColor?.(card);
  } catch {
    // Older clients may reject optional native color operations.
  }
}

export function bindBackButton(tg: MiniApp | undefined, action: () => void): () => void {
  const button = tg?.BackButton;
  if (!button) return () => undefined;
  button.onClick(action);
  button.show();
  return () => { button.offClick(action); button.hide(); };
}
