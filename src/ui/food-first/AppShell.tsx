import React from 'react';
import {
  Calendar,
  UtensilsCrossed,
  ShoppingBag,
  BookOpen,
  MoreHorizontal,
  ArrowLeft,
} from './Icons';
import type {
  ScreenId,
  VisualDirection,
} from './contract';

export interface AppShellProps {
  activeScreen: ScreenId;
  canGoBack: boolean;
  onGoBack: () => void;
  onNavigate: (screen: ScreenId) => void;
  onOpenSupport?: () => void;
  visualDirection?: VisualDirection;
  onChangeVisualDirection?: (dir: VisualDirection) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  shoppingNeedsRefresh: boolean;
  selectedDayIndex?: number;
  selectedDayLabel?: string;
  children: React.ReactNode;
}

const PRIMARY_NAV: {
  id: ScreenId;
  label: string;
  Icon: typeof Calendar;
}[] = [
  { id: 'today', label: 'Сегодня', Icon: Calendar },
  { id: 'menu', label: 'Меню', Icon: UtensilsCrossed },
  { id: 'shopping', label: 'Покупки', Icon: ShoppingBag },
  { id: 'diary', label: 'Дневник', Icon: BookOpen },
  { id: 'more', label: 'Ещё', Icon: MoreHorizontal },
];

export function AppShell({
  activeScreen,
  canGoBack,
  onGoBack,
  onNavigate,
  onOpenSupport,
  shoppingNeedsRefresh,
  children,
}: AppShellProps) {
  const isNavHighlighted = (tabId: ScreenId): boolean => {
    if (activeScreen === tabId) return true;
    if (tabId === 'menu' && activeScreen === 'recipe') return true;
    if (
      tabId === 'more' &&
      (activeScreen === 'settings' ||
        activeScreen === 'start' ||
        activeScreen === 'access' ||
        activeScreen === 'support')
    ) {
      return true;
    }
    return false;
  };

  if (['today', 'menu', 'recipe', 'shopping'].includes(activeScreen)) {
    return (
      <div className="ff-proof" data-testid="food-app-shell">
        <header className="ff-proof__header">
          <span className="ff-proof__brand">Кето Баланс</span>
          {canGoBack && activeScreen !== 'today' && (
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
        </header>
        <aside className="ff-proof__notice">
          Визуальный макет · синтетические данные · без отправки сообщений
        </aside>
        {children}
        <nav className="ff-proof__nav" aria-label="Визуальный пример навигации">
          {PRIMARY_NAV.map((item) => {
            const active = isNavHighlighted(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`bottom-nav-${item.id}`}
                className={`ff-proof__nav-btn ${active ? 'ff-proof__nav-btn--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
                {item.id === 'shopping' && shoppingNeedsRefresh ? ' •' : ''}
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      <header className="p-4 border-b flex items-center justify-between">
        <span className="font-bold">Кето Баланс</span>
        {canGoBack && (
          <button type="button" onClick={onGoBack} className="text-sm">
            Назад
          </button>
        )}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
