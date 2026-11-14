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
} from 'lucide-react';
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
  onChangeVisualDirection,
  theme,
  onToggleTheme,
  shoppingNeedsRefresh,
  children,
}: AppShellProps) {
  const supportsABComparison =
    activeScreen === 'today' || activeScreen === 'menu';

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

  return (
    <div
      className="min-h-[var(--tg-viewport-stable-height,100dvh)] flex flex-col bg-[var(--kb-bg)] text-[var(--kb-ink)] kb-safe-top"
      data-kb-theme={theme}
    >
      {/* Постоянная ненавязчивая отметка демонстрационного прототипа */}
      <div
        role="region"
        aria-label="Статус демонстрационного прототипа"
        className="bg-[var(--kb-sage)] border-b border-[var(--kb-border)] px-3 sm:px-6 py-1.5 text-[13px] text-[var(--kb-ink)]"
      >
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Демо-прототип «Кето Баланс»</span>
            <span aria-hidden="true">·</span>
            <span className="text-[var(--kb-muted)]">
              Синтетические данные · сообщения и оплата отключены
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {supportsABComparison && (
              <div
                role="group"
                aria-label="Сравнение композиции A и B"
                className="inline-flex items-center rounded-lg bg-[var(--kb-surface)] border border-[var(--kb-border)] p-0.5 text-[12px]"
              >
                <button
                  type="button"
                  onClick={() => onChangeVisualDirection('A')}
                  aria-pressed={visualDirection === 'A'}
                  className={`min-h-[32px] px-2.5 py-1 rounded-md font-medium transition-colors kb-focus-ring ${
                    visualDirection === 'A'
                      ? 'bg-[var(--kb-primary)] text-white'
                      : 'text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
                  }`}
                >
                  A: Спокойная кухня
                </button>
                <button
                  type="button"
                  onClick={() => onChangeVisualDirection('B')}
                  aria-pressed={visualDirection === 'B'}
                  className={`min-h-[32px] px-2.5 py-1 rounded-md font-medium transition-colors kb-focus-ring ${
                    visualDirection === 'B'
                      ? 'bg-[var(--kb-primary)] text-white'
                      : 'text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
                  }`}
                >
                  B: Кулинарный журнал
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                theme === 'light'
                  ? 'Включить резервную тёмную тему Telegram'
                  : 'Включить основную светлую тему'
              }
              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--kb-surface)] border border-[var(--kb-border)] text-[12px] font-medium text-[var(--kb-ink)] inline-flex items-center gap-1.5 kb-focus-ring"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Тёмная тема</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Светлая тема</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Верхняя шапка (Mobile + Desktop) */}
      <header className="sticky top-0 z-30 bg-[var(--kb-surface)]/95 backdrop-blur-xs border-b border-[var(--kb-border)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {canGoBack && (
              <button
                type="button"
                onClick={onGoBack}
                aria-label="Вернуться на предыдущий экран"
                className="min-h-[44px] min-w-[44px] -ml-1 px-2 rounded-xl inline-flex items-center justify-center gap-1 text-sm font-medium text-[var(--kb-ink)] hover:bg-[var(--kb-sage)] transition-colors kb-focus-ring shrink-0"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                <span className="hidden sm:inline">Назад</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('today')}
              className="min-h-[44px] px-1 text-left font-bold text-base sm:text-lg tracking-tight text-[var(--kb-ink)] truncate kb-focus-ring rounded-lg"
            >
              Кето Баланс
            </button>
          </div>

          {/* Навигация для Desktop (единая информационная архитектура) */}
          <nav
            aria-label="Основная навигация"
            className="hidden md:flex items-center gap-1"
          >
            {PRIMARY_NAV.map((item) => {
              const active = isNavHighlighted(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2 kb-focus-ring ${
                    active
                      ? 'bg-[var(--kb-sage)] text-[var(--kb-ink)] font-semibold'
                      : 'text-[var(--kb-muted)] hover:text-[var(--kb-ink)] hover:bg-[var(--kb-bg)]'
                  }`}
                >
                  <item.Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.id === 'shopping' && shoppingNeedsRefresh && (
                    <span className="text-[11px] font-semibold text-[var(--kb-warn-ink)] bg-[var(--kb-warn-bg)] px-1.5 py-0.5 rounded">
                      обновить
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Кнопка связи с Ольгой видна всегда, в том числе до завершения анкеты */}
          <button
            type="button"
            onClick={onOpenSupport}
            className="min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-[var(--kb-ink)] bg-[var(--kb-sage)] hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 shrink-0 kb-focus-ring"
          >
            <MessageCircle className="w-4 h-4 text-[var(--kb-primary)] shrink-0" aria-hidden="true" />
            <span>Поддержка Ольги</span>
          </button>
        </div>
      </header>

      {/* Основная область экрана */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-5 pb-24 md:pb-12">
        {children}
      </main>

      {/* Нижняя мобильная навигация: Сегодня / Меню / Покупки / Дневник / Ещё */}
      <nav
        aria-label="Мобильная навигация"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--kb-surface)] border-t border-[var(--kb-border)] kb-safe-bottom"
      >
        <div className="grid grid-cols-5 items-stretch">
          {PRIMARY_NAV.map((item) => {
            const active = isNavHighlighted(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[52px] py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 transition-colors kb-focus-ring ${
                  active
                    ? 'text-[var(--kb-primary)] font-semibold'
                    : 'text-[var(--kb-muted)] hover:text-[var(--kb-ink)]'
                }`}
              >
                <item.Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="text-[11px] leading-tight truncate max-w-full">
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
