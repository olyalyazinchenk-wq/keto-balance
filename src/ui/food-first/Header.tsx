import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface HeaderProps {
  isPremium?: boolean;
  onOpenPaywall?: () => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  onOpenSupport?: () => void;
  title?: string;
  usePortalIfAvailable?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isPremium = false,
  onOpenPaywall,
  canGoBack = false,
  onGoBack,
  onOpenSupport,
  title = 'Кето Баланс',
  usePortalIfAvailable = true,
}) => {
  const [portalTarget, setPortalTarget] = useState<Element | null>(() => {
    if (usePortalIfAvailable && typeof document !== 'undefined') {
      return document.querySelector('.ff-proof__header');
    }
    return null;
  });

  useEffect(() => {
    if (!usePortalIfAvailable || typeof document === 'undefined') {
      setPortalTarget(null);
      return;
    }
    const target = document.querySelector('.ff-proof__header');
    setPortalTarget(target);
  }, [usePortalIfAvailable]);

  const premiumElement = isPremium ? (
    <span
      data-testid="header-premium-badge"
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm select-none"
    >
      👑 Premium
    </span>
  ) : (
    <div data-testid="paywall-trigger-btn" className="inline-flex">
      <button
        type="button"
        data-testid="header-premium-btn"
        onClick={onOpenPaywall}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm hover:from-amber-600 hover:to-amber-700 active:scale-95 transition-all cursor-pointer"
        aria-label="Получить Premium доступ"
      >
        ⭐ Получить Premium
      </button>
    </div>
  );

  // If inside AppShell and .ff-proof__header is available, portal the premium element into the header
  if (portalTarget) {
    return createPortal(
      <div
        className="flex items-center gap-2 header-premium-portal"
        data-testid="header-premium-portal"
      >
        {premiumElement}
      </div>,
      portalTarget
    );
  }

  // Standalone header rendering
  return (
    <header className="ff-proof__header" data-testid="app-header">
      <div className="flex items-center gap-2">
        <span className="ff-proof__brand">{title}</span>
        {premiumElement}
      </div>
      <div className="flex items-center gap-2">
        {canGoBack && onGoBack && (
          <button
            type="button"
            onClick={onGoBack}
            className="ff-proof__help-btn"
            aria-label="Вернуться на предыдущий экран"
          >
            ← Назад
          </button>
        )}
        {onOpenSupport && (
          <button
            type="button"
            className="ff-proof__help-btn"
            onClick={onOpenSupport}
          >
            Помощь
          </button>
        )}
      </div>
    </header>
  );
};
