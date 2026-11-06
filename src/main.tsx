import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import PilotApp from './PilotApp'
import { setupTelegramApp } from './tma/telegram'
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
    const timer = window.setTimeout(done, 5000);
    function done() { window.clearTimeout(timer); resolve(); }
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.onload = done;
    script.onerror = done;
    document.head.appendChild(script);
  });
}

void loadTelegramSDK().finally(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
));
