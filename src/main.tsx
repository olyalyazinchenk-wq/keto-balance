import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import PilotApp from './PilotApp'
import { setupTelegramApp, handleLateTelegramSDK } from './tma/telegram'
import './index.css'

// Telegram bridge initializes once per mounted app; the effect owns cleanup.
function RootApp() {
  useEffect(() => {
    const cleanup = setupTelegramApp();
    return cleanup;
  }, []);

  return <PilotApp />;
}

async function loadTelegramSDK() {
  if (window.Telegram?.WebApp) return;
  await new Promise<void>((resolve) => {
    const script = document.createElement('script');
    let timedOut = false;
    let fallbackTimer: number | null = window.setTimeout(() => {
      fallbackTimer = null;
      timedOut = true;
      resolve();
    }, 5000);

    const onScriptLoaded = () => {
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (timedOut) {
        handleLateTelegramSDK(window.Telegram?.WebApp);
      } else {
        resolve();
      }
    };

    const onScriptError = () => {
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (!timedOut) {
        resolve();
      }
    };

    script.async = true;
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.onload = onScriptLoaded;
    script.onerror = onScriptError;
    document.head.appendChild(script);
  });
}

void loadTelegramSDK().finally(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
));
