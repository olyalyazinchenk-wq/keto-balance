import React, { useEffect } from 'react';
import { Calendar, BookOpen, ShoppingBag, MoreHorizontal, ArrowLeft } from './Icons';
import type { ScreenId, VisualDirection } from './contract';
import { setupTelegramApp, bindBackButton, hideBackButton, triggerHaptic } from '../../tma/telegram';
import './today.css';
import './editorial.css';
import './mobbin-premium.css';
export interface AppShellProps {
  activeScreen: ScreenId; canGoBack: boolean; onGoBack: () => void;
  onNavigate: (screen: ScreenId) => void; onOpenSupport?: () => void;
  visualDirection?: VisualDirection; onChangeVisualDirection?: (dir: VisualDirection) => void;
  theme?: 'light' | 'dark'; onToggleTheme?: () => void; shoppingNeedsRefresh: boolean;
  selectedDayIndex?: number; selectedDayLabel?: string; children: React.ReactNode;
  hasFloatingTimer?: boolean;
}
const PRIMARY_NAV = [
  { id: 'today', label: 'Главная', Icon: Calendar },
  { id: 'catalog', label: 'Рецепты', Icon: BookOpen },
  { id: 'menu', label: 'Меню', Icon: Calendar },
  { id: 'more', label: 'Ещё', Icon: MoreHorizontal },
] as const;
export function AppShell({ activeScreen, canGoBack, onGoBack, onNavigate, onOpenSupport, shoppingNeedsRefresh, hasFloatingTimer, children }: AppShellProps) {
  useEffect(() => setupTelegramApp(), []);
  useEffect(() => {
    if (canGoBack) return bindBackButton(onGoBack);
    hideBackButton();
  }, [canGoBack, onGoBack]);
  const isNavHighlighted = (id: ScreenId) => activeScreen === id ||
    (id === 'catalog' && activeScreen === 'recipe') ||
    (id === 'today' && activeScreen === 'compass') ||
    (id === 'menu' && activeScreen === 'shopping') ||
    (id === 'more' && ['settings', 'start', 'access', 'support', 'diary', 'rules', 'education', 'guides'].includes(activeScreen));
  return <div className={`ff-proof${hasFloatingTimer ? ' ff-proof--with-timer' : ''}`} data-testid="food-app-shell">
    <header className="ff-proof__header">
      <span className="ff-proof__brand">Кето Баланс</span>
      <div className="ff-header-actions">
        {canGoBack && <button type="button" className="ff-proof__help-btn" data-testid="app-back-button" onClick={onGoBack} aria-label="Вернуться на предыдущий экран"><ArrowLeft aria-hidden="true" /> Назад</button>}
        <button type="button" aria-label="Список покупок" data-testid="bottom-nav-shopping"
          className="ff-proof__help-btn editorial-shopping" onClick={() => onNavigate('shopping')}>
          <ShoppingBag aria-hidden="true" />
          {shoppingNeedsRefresh && <span className="ff-nav-status" aria-label="Список нужно обновить" />}
        </button>
        {onOpenSupport && <button type="button" className="ff-proof__help-btn" onClick={onOpenSupport}>Помощь</button>}
      </div>
    </header>
    <main id="main-content">{children}</main>
    <nav className="ff-proof__nav" aria-label="Основная навигация">
      {PRIMARY_NAV.map(({ id, label, Icon }) => <button key={id} type="button"
        data-testid={`bottom-nav-${id}`} className="ff-proof__nav-btn"
        aria-current={isNavHighlighted(id) ? 'page' : undefined}
        onClick={() => { triggerHaptic('selection'); onNavigate(id); }}>
        <Icon aria-hidden="true" /><span>{label}</span>
      </button>)}
    </nav>
  </div>;
}
