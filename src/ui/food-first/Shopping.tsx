import './recipe-shopping-food.css';
import { useState } from 'react';
import {
  Check,
  Copy,
  RefreshCw,
  Plus,
} from './Icons';
import type {
  ShoppingFixtureItem,
} from './contract';
import {
  calculateShoppingProgress,
  createCustomShoppingItem,
  formatShoppingListForClipboard,
} from './state';
import { copyShoppingText } from './clipboard';

export interface ShoppingScreenProps {
  items: ShoppingFixtureItem[];
  menuTitle: string;
  isStaleAfterMenuEdit: boolean;
  onRefreshShoppingFromMenu: () => void;
  onToggleCheckedInStore: (id: string) => void;
  onToggleAlreadyHave: (id: string) => void;
  onAddCustomItem?: (item: ShoppingFixtureItem) => void;
  portionsMultiplier?: 1 | 2;
  onChangePortionsMultiplier?: (multiplier: 1 | 2) => void;
}

const DEPARTMENTS: ShoppingFixtureItem['department'][] = [
  'Мясо, птица и рыба',
  'Яйца и молочное',
  'Овощи и зелень',
  'Масла и бакалея',
];

export function ShoppingScreen({
  items,
  menuTitle,
  isStaleAfterMenuEdit,
  onRefreshShoppingFromMenu,
  onToggleCheckedInStore,
  onToggleAlreadyHave,
  onAddCustomItem,
  portionsMultiplier = 1,
  onChangePortionsMultiplier,
}: ShoppingScreenProps) {
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'remaining' | 'home'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customDept, setCustomDept] = useState<ShoppingFixtureItem['department']>('Овощи и зелень');

  const progress = calculateShoppingProgress(items);

  const handleCopyListOnly = async () => {
    const text = formatShoppingListForClipboard(
      items,
      menuTitle,
      isStaleAfterMenuEdit
    );
    setCopiedNotice(false);
    setCopyError(false);
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    const success = await copyShoppingText(text, clipboard);
    setCopiedNotice(success);
    setCopyError(!success);
    if (success) setTimeout(() => setCopiedNotice(false), 2500);
  };

  const handleAddCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const created = createCustomShoppingItem(
      customName,
      customAmount,
      customDept
    );
    if (!created || !onAddCustomItem) return;
    onAddCustomItem(created);
    setCustomName('');
    setCustomAmount('');
    setShowAddForm(false);
  };

  const visibleItems = items.filter((it) => {
    if (filterMode === 'remaining') {
      return !it.checkedInStore && !it.alreadyHave;
    }
    if (filterMode === 'home') {
      return it.alreadyHave;
    }
    return true;
  });

  return (
    <div className="food-shopping" data-testid="food-shopping-screen">
      {/* Шапка корзины */}
      <header className="border-b border-[var(--kb-border)] pb-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="kb-eyebrow text-[var(--kb-text-4)]">Корзина</div>
            <h1 className="food-title text-2xl sm:text-3xl text-[var(--kb-text-1)]">
              Список покупок
            </h1>
            <p className="text-sm text-[var(--kb-text-2)]">{menuTitle}</p>
            {onChangePortionsMultiplier && (
              <div
                role="group"
                aria-label="Выбор числа порций для списка покупок"
                className="mt-2.5 inline-flex items-center border border-[var(--kb-border)] bg-[var(--kb-surface)] p-0.5 rounded-lg"
              >
                {([1, 2] as const).map((p) => {
                  const active = portionsMultiplier === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onChangePortionsMultiplier(p)}
                      data-testid={`shopping-portions-${p}x`}
                      aria-pressed={active}
                      className={`min-h-[30px] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] tabular-nums rounded-md kb-focus-ring kb-transition-scale ${
                        active
                          ? 'bg-[var(--kb-day-active-bg)] text-[var(--kb-text-1)]'
                          : 'text-[var(--kb-text-3)] hover:text-[var(--kb-text-1)]'
                      }`}
                    >
                      {p}× {p === 1 ? 'порция' : 'порции'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyListOnly}
              data-testid="shopping-copy-btn"
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-100 inline-flex items-center gap-2"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              <span>{copiedNotice ? 'Скопировано ✓' : copyError ? 'Ошибка копирования' : 'Скопировать список'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((p) => !p)}
              data-testid="shopping-add-custom-toggle-btn"
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-[var(--kb-border)] inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Добавить свой продукт</span>
            </button>
          </div>
        </div>

        {/* Прогресс */}
        <div className="food-shopping-progress">
          <div className="food-shopping-progress__labels">
            <span>Собрано: <strong>{progress.completed} из {progress.total}</strong> ({progress.percent}%)</span>
            <span>Осталось купить: <strong>{progress.remaining}</strong></span>
          </div>
          <div className="food-shopping-progress__track" role="progressbar" aria-label="Собрано продуктов" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
            <div className="food-shopping-progress__fill" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        {/* Баннер stale, если меню менялось */}
        {isStaleAfterMenuEdit && (
          <div
            className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl flex items-center justify-between gap-3 text-amber-900 dark:text-amber-200 text-xs"
            role="alert"
            data-testid="shopping-stale-banner"
          >
            <span>В меню были изменения блюд. Обнови список, чтобы не забыть нужные ингредиенты.</span>
            <button
              type="button"
              onClick={onRefreshShoppingFromMenu}
              data-testid="shopping-refresh-btn"
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold inline-flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Обновить корзину</span>
            </button>
          </div>
        )}

        {/* Форма добавления кастомного продукта */}
        {showAddForm && (
          <form
            onSubmit={handleAddCustomSubmit}
            className="p-4 bg-[var(--kb-surface-muted)] border border-[var(--kb-border)] rounded-xl space-y-3"
            data-testid="shopping-custom-item-form"
          >
            <div className="font-semibold text-xs uppercase tracking-wider text-[var(--kb-text-3)]">
              Добавить свой продукт в список
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Название (например, Кокосовые сливки)"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--kb-border)] bg-white dark:bg-stone-900"
                required
              />
              <input
                type="text"
                placeholder="Количество (например, 200 мл)"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--kb-border)] bg-white dark:bg-stone-900"
              />
              <select
                value={customDept}
                onChange={(e) => setCustomDept(e.target.value as any)}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--kb-border)] bg-white dark:bg-stone-900"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs rounded-lg border"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
              >
                Сохранить в список
              </button>
            </div>
          </form>
        )}

        {/* Фильтры */}
        <div className="flex gap-2">
          {(['all', 'remaining', 'home'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 text-xs rounded-lg font-semibold ${
                filterMode === mode
                  ? 'bg-emerald-700 text-white'
                  : 'bg-stone-100 dark:bg-stone-800 text-[var(--kb-text-2)]'
              }`}
            >
              {mode === 'all' ? 'Все' : mode === 'remaining' ? 'Нужно купить' : 'Есть дома'}
            </button>
          ))}
        </div>
      </header>

      {/* Список позиций по отделам */}
      <div className="space-y-6 pt-6">
        {DEPARTMENTS.map((dept) => {
          const deptItems = visibleItems.filter((i) => i.department === dept);
          if (deptItems.length === 0) return null;
          return (
            <section key={dept} className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--kb-text-3)]">
                {dept} ({deptItems.length})
              </h2>
              <div className="bg-[var(--kb-surface)] border border-[var(--kb-border)] rounded-xl divide-y divide-[var(--kb-border)]">
                {deptItems.map((item) => {
                  const isDone = Boolean(item.checkedInStore);
                  const isHome = Boolean(item.alreadyHave);
                  return (
                    <div
                      key={item.id}
                      data-testid={`shopping-item-row-${item.id}`}
                      className={`p-3 flex items-center justify-between gap-3 text-sm ${
                        isDone || isHome ? 'opacity-50 line-through' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => onToggleCheckedInStore(item.id)}
                          aria-pressed={isDone}
                          data-testid={`toggle-in-store-${item.id}`}
                          className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                            isDone
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-stone-300 dark:border-stone-600'
                          }`}
                        >
                          {isDone && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                        </button>
                        <div className="min-w-0">
                          <span className="font-semibold block">{item.name}</span>
                          <span className="text-xs text-[var(--kb-text-3)]">{item.amountLabel}</span>
                          {item.linkedRecipeTitles && item.linkedRecipeTitles.length > 0 && (
                            <span className="text-[11px] text-[var(--kb-text-4)] block truncate">
                              Для: {item.linkedRecipeTitles.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleAlreadyHave(item.id)}
                          aria-pressed={isHome}
                          data-testid={`toggle-already-have-${item.id}`}
                          className={`px-2.5 py-1 text-xs rounded-lg border ${
                            isHome
                              ? 'bg-stone-200 dark:bg-stone-700 font-semibold'
                              : 'border-stone-200 dark:border-stone-700 text-[var(--kb-text-3)]'
                          }`}
                        >
                          {isHome ? 'Дома ✓' : 'Есть дома'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
