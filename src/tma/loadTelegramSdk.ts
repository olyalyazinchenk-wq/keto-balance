import { handleLateTelegramSDK } from './telegram';

export async function loadTelegramSDK(
  doc?: any,
  win?: any
): Promise<void> {
  const currentWin = win ?? (typeof window !== 'undefined' ? window : undefined);
  if (currentWin?.Telegram?.WebApp) return;

  const currentDoc = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!currentDoc || !currentWin) return;

  await new Promise<void>((resolve) => {
    const script = currentDoc.createElement('script');
    let timedOut = false;
    let fallbackTimer: any = currentWin.setTimeout(() => {
      fallbackTimer = null;
      timedOut = true;
      resolve();
    }, 5000);

    const onScriptLoaded = () => {
      if (fallbackTimer !== null) {
        currentWin.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (timedOut) {
        handleLateTelegramSDK(currentWin.Telegram?.WebApp);
      } else {
        resolve();
      }
    };

    const onScriptError = () => {
      // If local load failed, try official CDN before falling back
      if (!script.src.includes('telegram.org')) {
        script.src = 'https://telegram.org/js/telegram-web-app.js';
        return;
      }
      if (fallbackTimer !== null) {
        currentWin.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (!timedOut) {
        resolve();
      }
    };

    script.async = true;
    script.src = '/telegram-web-app.js';
    script.onload = onScriptLoaded;
    script.onerror = onScriptError;
    currentDoc.head.appendChild(script);
  });
}
