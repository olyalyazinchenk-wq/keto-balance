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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
)
