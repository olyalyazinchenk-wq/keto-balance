import {
  Calendar,
  UtensilsCrossed,
  ShoppingBag,
  BookOpen,
  MoreHorizontal,
  ArrowLeft,
  MessageCircle,
  Sun,
  Moon,
} from './Icons';
import type {
  ScreenId,
  VisualDirection,
} from '../../types/ketoBalanceContract';

interface AppShellProps {
  activeScreen: ScreenId;
  canGoBack: boolean;
  onGoBack: () => void;
  onNavigate: (screen: ScreenId) => void;
  onOpenSupport: () => void;
  visualDirection: VisualDirection;
  onChangeVisualDirection: (dir: VisualDirection) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
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
  visualDirection,
  theme,
  onToggleTheme,
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
      <div className="ff-proof">
        <header className="ff-proof__header">
          <span className="ff-proof__brand">Кето Баланс</span>
          {canGoBack && activeScreen !== 'today' && <button type="button" onClick={onGoBack} className="ff-proof__help-btn" aria-label="Вернуться на предыдущий экран">← Назад</button>}
          <button
            type="button"
            className="ff-proof__help-btn"
            onClick={onOpenSupport}
          >
            Помощь
          </button>
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
                className="ff-proof__nav-btn"
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}{item.id === 'shopping' && shoppingNeedsRefresh ? ' •' : ''}
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div
      className="min-h-[var(--tg-viewport-stable-height,100dvh)] flex flex-col bg-[var(--kb-bg)] text-[var(--kb-text-1)] kb-safe-top"
      data-kb-dir={visualDirection}
      data-kb-theme={theme}
    >
      {/* Современная шапка приложения (3 зоны: Бренд — Навигация — Действие) */}
      <header className="sticky top-0 z-30 bg-[var(--kb-surface)]/95 backdrop-blur-md border-b border-[var(--kb-border)]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Зона 1: Бренд и кнопка Назад */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {canGoBack && (
              <button
                type="button"
                onClick={onGoBack}
                aria-label="Вернуться на предыдущий экран"
                className="min-h-[44px] min-w-[44px] -ml-1.5 px-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--kb-text-1)] hover:bg-[var(--kb-surface-muted)] kb-focus-ring shrink-0 kb-transition-day"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Назад</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('today')}
              className="min-h-[44px] text-left flex items-center gap-2.5 shrink-0 kb-focus-ring"
            >
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white font-bold text-[15px] flex items-center justify-center shadow-sm">
                КБ
              </span>
              <span className="kb-display text-[20px] sm:text-[23px] leading-none text-[var(--kb-text-1)] whitespace-nowrap">
                Кето Баланс
              </span>
            </button>
          </div>

          {/* Зона 2: Чистая однострочная навигация на Desktop */}
          <nav
            aria-label="Основная навигация"
            className="hidden md:flex items-center gap-1.5"
          >
            {PRIMARY_NAV.map((item) => {
              const active = isNavHighlighted(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`top-nav-${item.id}`}
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-[14px] inline-flex items-center gap-2 whitespace-nowrap shrink-0 kb-focus-ring kb-transition-day ${
                    active
                      ? 'bg-[var(--kb-day-active-bg)] text-[var(--kb-day-active-ink)] font-bold'
                      : 'text-[var(--kb-text-2)] hover:text-[var(--kb-text-1)] hover:bg-[var(--kb-surface-muted)] font-medium'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === 'shopping' && shoppingNeedsRefresh && (
                    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                      •
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Зона 3: Переключатель темы и связь с Ольгой */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              data-testid="theme-toggle-btn"
              aria-label={
                theme === 'light'
                  ? 'Включить тёмную тему'
                  : 'Включить светлую тему'
              }
              className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl bg-[var(--kb-bg)] border border-[var(--kb-border)] text-[var(--kb-text-1)] inline-flex items-center justify-center kb-focus-ring kb-transition-day"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Sun className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenSupport}
              className="min-h-[42px] px-3.5 py-2 rounded-xl text-[12px] sm:text-[13px] font-bold text-[var(--kb-day-active-ink)] bg-[var(--kb-day-active-bg)] border border-[var(--kb-day-active-border)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 kb-focus-ring kb-transition-day"
            >
              <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Вопрос Ольге</span>
            </button>
          </div>
        </div>
      </header>

      {/* Основная область экрана */}
      <main
        id="kb-main-content"
        className="flex-1 max-w-[1200px] w-full mx-auto px-3.5 sm:px-8 py-5 sm:py-7 kb-main-safe-bottom"
      >
        {children}
      </main>

      {/* Нижняя мобильная панель навигации */}
      <nav
        aria-label="Мобильная навигация"
        data-testid="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--kb-surface)]/95 backdrop-blur-md border-t border-[var(--kb-border)] kb-safe-bottom"
      >
        <div className="grid grid-cols-5 items-stretch min-h-[60px] px-1">
          {PRIMARY_NAV.map((item) => {
            const active = isNavHighlighted(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`bottom-nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[56px] my-1 rounded-xl py-1 px-0.5 flex flex-col items-center justify-center gap-0.5 kb-focus-ring kb-transition-day ${
                  active
                    ? 'text-[var(--kb-primary)] font-bold bg-[var(--kb-day-active-bg)]'
                    : 'text-[var(--kb-text-3)] hover:text-[var(--kb-text-1)] font-medium'
                }`}
              >
                <item.Icon
                  className={`w-5 h-5 shrink-0 ${
                    active ? 'text-[var(--kb-primary)]' : 'text-[var(--kb-text-3)]'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-[10.5px] leading-tight tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
