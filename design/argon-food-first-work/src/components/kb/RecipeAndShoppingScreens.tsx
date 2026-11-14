import './recipe-shopping-food.css';
import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  RefreshCw,
  BookOpen,
  AlertTriangle,
  Clock,
  Plus,
} from './Icons';
import type {
  RecipeViewModel,
  ShoppingFixtureItem,
  VisualDirection,
} from '../../types/ketoBalanceContract';
import {
  calculateShoppingProgress,
  createCustomShoppingItem,
  extractStepTimerMinutes,
  formatShoppingListForClipboard,
} from '../../utils/ketoBalanceState';
import { RecipeArtwork } from './RecipeArtwork';
import { copyShoppingText } from '../../utils/clipboard';

interface RecipeCookingScreenProps {
  visualDirection?: VisualDirection;
  recipe: RecipeViewModel;
  checkedIngredients: Record<string, boolean>;
  onToggleIngredient: (key: string) => void;
  checkedSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
  onLogCookedMealToDiary: (recipeTitle: string) => void;
}

export function RecipeCookingScreen({
  recipe,
  checkedIngredients,
  onToggleIngredient,
  checkedSteps,
  onToggleStep,
  onLogCookedMealToDiary,
}: RecipeCookingScreenProps) {
  const [portions, setPortions] = useState<1 | 2>(1);
  const variant = recipe.portionsVariants[portions];

  // Встроенный кухонный таймер для шагов рецепта
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [timerLabel, setTimerLabel] = useState<string>('Таймер у плиты');

  useEffect(() => {
    if (!timerRunning || timerSecondsLeft <= 0) {
      if (timerSecondsLeft <= 0 && timerRunning) {
        setTimerRunning(false);
      }
      return;
    }
    const id = window.setInterval(() => {
      setTimerSecondsLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, timerSecondsLeft]);

  const startStepTimer = (minutes: number, stepIndex?: number) => {
    setTimerSecondsLeft(minutes * 60);
    setTimerLabel(
      stepIndex !== undefined
        ? `Шаг ${stepIndex + 1} · ${minutes} мин`
        : `Таймер · ${minutes} мин`
    );
    setTimerRunning(true);
  };

  const formatTimerMMSS = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const completedStepsCount = recipe.steps.filter((_, idx) =>
    Boolean(checkedSteps[`${recipe.id}:step:${idx}`])
  ).length;

  const checkedIngredientsCount = variant.ingredients.filter((_, idx) =>
    Boolean(checkedIngredients[`${recipe.id}:ing:${idx}`])
  ).length;

  const handleStartOrAdvanceStep = () => {
    const firstUncheckedIdx = recipe.steps.findIndex(
      (_, idx) => !checkedSteps[`${recipe.id}:step:${idx}`]
    );
    const targetIdx = firstUncheckedIdx === -1 ? 0 : firstUncheckedIdx;
    onToggleStep(`${recipe.id}:step:${targetIdx}`);
  };

  return (
    <article className="food-recipe">
      {/* Секция 01: Обложечная шапка рецепта */}
      <header className="border-b border-[var(--kb-border)] pb-6 sm:pb-10 space-y-4 sm:space-y-6">
        <div className="food-grid items-start">

          <div className="col-span-3 md:col-span-5 space-y-3 sm:space-y-4 min-w-0">
            <div className="kb-eyebrow text-[var(--kb-text-4)]">
              Рецепт
            </div>
            <h1 className="food-title text-[26px] sm:text-[40px] lg:text-[46px] text-[var(--kb-text-1)]">
              {recipe.title}
            </h1>
            <p className="text-[15px] sm:text-[18px] leading-[1.42] text-[var(--kb-text-2)]">
              {recipe.subtitle}
            </p>

            <div className="border-y border-[var(--kb-border)] py-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] tabular-nums">
              <span>
                <span className="text-[var(--kb-text-3)]">Время: </span>
                <strong className="font-semibold text-[var(--kb-text-1)] tabular-nums">
                  {recipe.prepMinutes} мин
                </strong>
              </span>
              <span className="text-[var(--kb-border)]" aria-hidden="true">
                |
              </span>
              <span>
                <span className="text-[var(--kb-text-3)]">Выход: </span>
                <strong className="font-semibold text-[var(--kb-text-1)] tabular-nums">
                  {portions === 1 ? '1 порция' : '2 порции'}
                </strong>
              </span>
              <span className="text-[var(--kb-border)]" aria-hidden="true">
                |
              </span>
              <span
                className="text-[var(--kb-text-3)]"
                title={`Статус расчёта нутриентов: ${variant.nutritionStatus}`}
              >
                КБЖУ уточняется автором
              </span>
            </div>

            {/* Единственный акцентный элемент экрана (--kb-primary): тактильный Start + масштаб порций 1× / 2× */}
            <div className="pt-0.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStartOrAdvanceStep}
                data-testid="recipe-start-step-btn"
                className="min-h-[44px] px-4 sm:px-6 py-2.5 bg-[var(--kb-primary)] hover:bg-[var(--kb-primary-hover)] text-[var(--kb-on-primary)] text-[12px] font-semibold uppercase tracking-[0.12em] inline-flex items-center gap-2 tabular-nums kb-focus-ring kb-transition-card"
              >
                <span aria-hidden="true">▶</span>
                <span>
                  {completedStepsCount === 0
                    ? 'Начать'
                    : completedStepsCount === recipe.steps.length
                    ? 'Готово ✓'
                    : `Шаг ${completedStepsCount + 1}/${recipe.steps.length}`}
                </span>
              </button>

              <div
                role="group"
                aria-label="Выбор числа порций"
                className="inline-flex items-center border border-[var(--kb-border)] bg-[var(--kb-surface)] p-0.5"
              >
                {([1, 2] as const).map((p) => {
                  const active = portions === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPortions(p)}
                      aria-pressed={active}
                      className={`min-h-[38px] px-2.5 sm:px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] tabular-nums kb-focus-ring kb-transition-scale ${
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
            </div>
          </div>

          <div className="col-span-4 md:col-span-5">
            <RecipeArtwork
              artworkKey={recipe.artworkKey}
              caption={recipe.artworkCaption}
              prepMinutes={recipe.prepMinutes}
              slotLabel={recipe.slotLabel}
              size="compact"
            />
          </div>
        </div>
      </header>

      {/* Основной разворот кулинарной книги: Секция 02 (Ингредиенты) + Секции 03 и 04 (Шаги, Таймер и Хранение) */}
      <div className="food-grid items-start">
        <section
          aria-labelledby="recipe-ingredients-heading"
          className="col-span-4 md:col-span-5 bg-[var(--kb-surface)] border border-[var(--kb-border)] p-4 sm:p-6 space-y-4"
        >
          <div className="food-section-heading flex items-baseline justify-between gap-2 border-b border-[var(--kb-border)] pb-2.5">
            <div className="flex items-baseline gap-2.5">
              <h2
                id="recipe-ingredients-heading"
                className="kb-eyebrow text-[var(--kb-text-3)] tabular-nums"
              >
                ИНГРЕДИЕНТЫ · НА {portions}{' '}
                {portions === 1 ? 'ПОРЦИЮ' : 'ПОРЦИИ'}
              </h2>
            </div>
            <span className="text-[11px] text-[var(--kb-text-4)] tabular-nums shrink-0">
              {checkedIngredientsCount}/{variant.ingredients.length} поз.
            </span>
          </div>

          <div className="divide-y divide-[var(--kb-border)]">
            {variant.ingredients.map((item, idx) => {
              const ingKey = `${recipe.id}:ing:${idx}`;
              const isChecked = Boolean(checkedIngredients[ingKey]);
              return (
                <button
                  key={ingKey}
                  type="button"
                  data-testid={`recipe-ingredient-row-${idx}`}
                  onClick={() => onToggleIngredient(ingKey)}
                  aria-pressed={isChecked}
                  className={`w-full text-left kb-ingredient-row group kb-focus-ring ${
                    isChecked ? 'kb-ingredient-row-done' : ''
                  }`}
                >
                  <span className="text-[14px] sm:text-[15px] font-semibold tabular-nums">
                    <span
                      className={`kb-strike-draw ${
                        isChecked
                          ? 'kb-strike-draw-done'
                          : 'text-[var(--kb-text-1)]'
                      }`}
                    >
                      {item.amountLabel}
                    </span>
                  </span>

                  <span className="flex items-center justify-between gap-3 min-w-0">
                    <span className="text-[14px] sm:text-[15px] leading-snug min-w-0">
                      <span
                        className={`kb-strike-draw ${
                          isChecked
                            ? 'kb-strike-draw-done'
                            : 'text-[var(--kb-text-2)]'
                        }`}
                      >
                        {item.name}
                      </span>
                    </span>
                    <span
                      className={`kb-check-badge ${
                        isChecked ? 'kb-check-badge-done' : ''
                      }`}
                      aria-hidden="true"
                    >
                      <svg className="kb-check-glyph" viewBox="0 0 16 16">
                        <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
                      </svg>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[12px] text-[var(--kb-text-3)] pt-1 tabular-nums">
            Демо-количества для {portions}{' '}
            {portions === 1 ? 'порции' : 'порций'} · КБЖУ уточняется автором{' '}
            <span className="text-[var(--kb-text-4)]">
              {variant.nutritionStatus}
            </span>
          </p>
        </section>

        <section
          aria-labelledby="recipe-steps-heading"
          className="col-span-4 md:col-span-7 space-y-6"
        >
          <div className="food-section-heading flex items-baseline justify-between border-b border-[var(--kb-border)] pb-2.5">
            <div className="flex items-baseline gap-2.5">
              <h2
                id="recipe-steps-heading"
                className="kb-eyebrow text-[var(--kb-text-3)]"
              >
                ПОРЯДОК ПРИГОТОВЛЕНИЯ И ТАЙМЕР
              </h2>
            </div>
            <span className="text-[12px] text-[var(--kb-text-4)] tabular-nums">
              Отмечено {completedStepsCount} из {recipe.steps.length}
            </span>
          </div>

          {/* Компактный кухонный таймер у плиты */}
          <div
            data-testid="recipe-kitchen-timer"
            className="bg-[var(--kb-surface)] border border-[var(--kb-border)] p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-[var(--kb-text-3)] shrink-0" aria-hidden="true" />
              <div>
                <div className="kb-eyebrow text-[10px] text-[var(--kb-text-4)]">
                  {timerLabel}
                </div>
                <div
                  data-testid="recipe-timer-readout"
                  className="kb-display text-[24px] sm:text-[28px] leading-none text-[var(--kb-text-1)] tabular-nums mt-0.5"
                >
                  {formatTimerMMSS(timerSecondsLeft)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {timerSecondsLeft > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setTimerRunning((r) => !r)}
                    data-testid="recipe-timer-toggle"
                    className="min-h-[38px] px-3 py-1.5 bg-[var(--kb-day-active-bg)] border border-[var(--kb-rule-strong)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--kb-text-1)] tabular-nums kb-focus-ring"
                  >
                    {timerRunning ? 'Пауза' : 'Продолжить'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimerSecondsLeft((s) => s + 60)}
                    className="min-h-[38px] px-2.5 py-1.5 border border-[var(--kb-border)] bg-[var(--kb-bg)] text-[11px] font-semibold text-[var(--kb-text-2)] tabular-nums kb-focus-ring"
                  >
                    +1 мин
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimerRunning(false);
                      setTimerSecondsLeft(0);
                      setTimerLabel('Таймер у плиты');
                    }}
                    className="min-h-[38px] px-2.5 py-1.5 border border-[var(--kb-border)] text-[11px] font-medium text-[var(--kb-text-3)] kb-focus-ring"
                  >
                    Сброс
                  </button>
                </>
              ) : (
                ([3, 5, 10] as const).map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => startStepTimer(min)}
                    data-testid={`recipe-timer-preset-${min}`}
                    className="min-h-[38px] px-3 py-1.5 border border-[var(--kb-border)] bg-[var(--kb-bg)] hover:bg-[var(--kb-day-active-bg)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--kb-text-2)] tabular-nums kb-focus-ring kb-transition-day"
                  >
                    {min} мин
                  </button>
                ))
              )}
            </div>
          </div>

          <ol className="divide-y divide-[var(--kb-border)] border-b border-[var(--kb-border)]">
            {recipe.steps.map((stepText, idx) => {
              const stepKey = `${recipe.id}:step:${idx}`;
              const isDone = Boolean(checkedSteps[stepKey]);
              const stepMinutes = extractStepTimerMinutes(stepText);
              return (
                <li
                  key={stepKey}
                  id={`recipe-step-${idx}`}
                  className="py-5 first:pt-2 space-y-2.5"
                >
                  <button
                    type="button"
                    data-testid={`recipe-step-row-${idx}`}
                    onClick={() => onToggleStep(stepKey)}
                    aria-pressed={isDone}
                    className={`w-full text-left food-step-layout kb-step-row kb-focus-ring group ${
                      isDone ? 'kb-step-row-done' : ''
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`kb-display text-[30px] sm:text-[36px] leading-none tabular-nums block kb-transition-day ${
                            isDone
                              ? 'text-[var(--kb-text-4)]'
                              : 'text-[var(--kb-text-1)]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span
                          className={`kb-check-badge ${
                            isDone ? 'kb-check-badge-done' : ''
                          }`}
                          aria-hidden="true"
                        >
                          <svg className="kb-check-glyph" viewBox="0 0 16 16">
                            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
                          </svg>
                        </span>
                      </div>
                      <span
                        className={`kb-eyebrow text-[10px] block kb-transition-day ${
                          isDone
                            ? 'text-[var(--kb-primary)]'
                            : 'text-[var(--kb-text-4)]'
                        }`}
                      >
                        {isDone ? 'ГОТОВО ✓' : 'ШАГ'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[16px] sm:text-[18px] leading-[1.48] m-0">
                        <span
                          className={`kb-strike-draw ${
                            isDone
                              ? 'kb-strike-draw-done'
                              : 'text-[var(--kb-text-1)]'
                          }`}
                        >
                          {stepText}
                        </span>
                      </p>
                    </div>
                  </button>

                  {stepMinutes && (
                    <div className="pl-[68px] sm:pl-[86px]">
                      <button
                        type="button"
                        onClick={() => startStepTimer(stepMinutes, idx)}
                        className="min-h-[34px] px-3 py-1 border border-[var(--kb-border)] bg-[var(--kb-surface)] hover:bg-[var(--kb-day-active-bg)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--kb-text-2)] inline-flex items-center gap-1.5 tabular-nums kb-focus-ring kb-transition-day"
                      >
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Запустить таймер · {stepMinutes} мин</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Секция 04: Редакционные ремарки — замены, хранение и запись в дневник */}
          <div className="space-y-4 pt-2">
            <div className="food-section-heading flex items-baseline gap-2.5">
              <span className="kb-eyebrow text-[var(--kb-text-3)]">
                ЗАМЕНЫ, ХРАНЕНИЕ И ЗАПИСЬ В ДНЕВНИК
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="kb-panel space-y-2">
                <div className="kb-eyebrow text-[10px] text-[var(--kb-text-3)]">
                  ДОПУСТИМЫЕ ЗАМЕНЫ
                </div>
                <ul className="space-y-1.5 text-[14px] text-[var(--kb-text-2)] leading-snug">
                  {recipe.substitutions.map((sub, i) => (
                    <li key={i}>— {sub}</li>
                  ))}
                </ul>
              </div>

              <div className="kb-panel space-y-2">
                <div className="kb-eyebrow text-[10px] text-[var(--kb-text-4)]">
                  ПРАВИЛО ХРАНЕНИЯ
                </div>
                <p className="text-[14px] text-[var(--kb-text-2)] leading-snug">
                  {recipe.storageRule}
                </p>
              </div>
            </div>

            <div className="kb-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="kb-eyebrow text-[10px] text-[var(--kb-text-4)]">
                  ФИКСАЦИЯ ПРИЁМА ПИЩИ
                </div>
                <div className="text-[13px] text-[var(--kb-text-3)]">
                  {recipe.sourceStatus}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onLogCookedMealToDiary(recipe.title)}
                data-testid="recipe-log-to-diary-btn"
                className="kb-btn-tonal kb-focus-ring kb-transition-card"
              >
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                <span>Записать блюдо в дневник</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}

interface ShoppingScreenProps {
  items: ShoppingFixtureItem[];
  menuTitle: string;
  isStaleAfterMenuEdit: boolean;
  onRefreshShoppingFromMenu: () => void;
  onToggleCheckedInStore: (id: string) => void;
  onToggleAlreadyHave: (id: string) => void;
  onAddCustomItem?: (item: ShoppingFixtureItem) => void;
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
}: ShoppingScreenProps) {
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'remaining' | 'home'>(
    'all'
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customDept, setCustomDept] = useState<
    ShoppingFixtureItem['department']
  >('Овощи и зелень');

  const progress = calculateShoppingProgress(items);

  const handleCopyListOnly = async () => {
    const text = formatShoppingListForClipboard(
      items,
      menuTitle,
      isStaleAfterMenuEdit
    );
    setCopiedNotice(false);
    setCopyError(false);
    const success = await copyShoppingText(text, navigator.clipboard);
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
      return it.alreadyHave || it.checkedInStore;
    }
    return true;
  });

  return (
    <div className="food-shopping">
      <section
        aria-labelledby="shopping-screen-heading"
        className="border-b border-[var(--kb-border)] pb-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2.5">
            <div className="food-section-heading flex items-baseline gap-2.5">
              <span className="kb-eyebrow text-[var(--kb-text-3)]">
                Меню · {menuTitle}
              </span>
            </div>
            <h1
              id="shopping-screen-heading"
              className="food-title text-[28px] sm:text-[40px] lg:text-[46px] text-[var(--kb-text-1)]"
            >
              Список покупок
            </h1>
            <p className="text-[15px] text-[var(--kb-text-2)]">
              Отметьте «Уже есть», чтобы оставить в списке только то, что нужно
              взять в магазине.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyListOnly}
            data-testid="shopping-copy-btn"
            className="kb-btn-primary kb-focus-ring kb-transition-card"
          >
            {copiedNotice ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>Скопировано в буфер</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" aria-hidden="true" />
                <span>Скопировать список</span>
              </>
            )}
          </button>
          {copyError && <p role="alert">Не удалось скопировать список. Попробуйте ещё раз.</p>}
        </div>

        <div className="kb-panel space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] tabular-nums">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="kb-eyebrow text-[var(--kb-text-3)]">
                ГОТОВНОСТЬ КОРЗИНЫ:
              </span>
              <strong
                data-testid="shopping-progress-label"
                className="text-[14px] font-semibold text-[var(--kb-text-1)] tabular-nums"
              >
                {progress.completed} из {progress.total} поз. ({progress.percent}%)
              </strong>
              <span className="text-[var(--kb-text-4)]">·</span>
              <span className="text-[var(--kb-text-3)]">
                Осталось купить: <strong className="text-[var(--kb-text-1)]">{progress.remaining}</strong>
              </span>
            </div>

            {onAddCustomItem && (
              <button
                type="button"
                onClick={() => setShowAddForm((s) => !s)}
                data-testid="shopping-toggle-add-btn"
                className="kb-btn-outline kb-focus-ring"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showAddForm ? 'Скрыть форму' : 'Свой продукт'}</span>
              </button>
            )}
          </div>

          <div className="h-1.5 w-full bg-[var(--kb-bg)] border border-[var(--kb-border)] overflow-hidden">
            <div
              className="h-full bg-[var(--kb-text-1)] kb-transition-card"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {(
              [
                { id: 'all', label: `Все отделы (${items.length})` },
                { id: 'remaining', label: `Осталось купить (${progress.remaining})` },
                { id: 'home', label: `Отмечено (${progress.completed})` },
              ] as const
            ).map((tab) => {
              const active = filterMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  data-testid={`shopping-filter-${tab.id}`}
                  aria-pressed={active}
                  className={`min-h-[36px] px-3 py-1 border text-[11px] font-semibold uppercase tracking-[0.08em] tabular-nums kb-focus-ring kb-transition-day ${
                    active
                      ? 'bg-[var(--kb-day-active-bg)] border-[var(--kb-rule-strong)] text-[var(--kb-text-1)]'
                      : 'bg-[var(--kb-bg)] border-[var(--kb-border)] text-[var(--kb-text-3)] hover:text-[var(--kb-text-1)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {showAddForm && onAddCustomItem && (
            <form
              onSubmit={handleAddCustomSubmit}
              data-testid="shopping-custom-form"
              className="pt-3 border-t border-[var(--kb-border)] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
            >
              <div className="sm:col-span-5 space-y-1">
                <label
                  htmlFor="shopping-custom-name"
                  className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block"
                >
                  НАЗВАНИЕ ПРОДУКТА
                </label>
                <input
                  id="shopping-custom-name"
                  data-testid="shopping-custom-name"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Например: Морская соль или лимон"
                  className="w-full min-h-[40px] px-3 bg-[var(--kb-bg)] border border-[var(--kb-border)] text-[14px] text-[var(--kb-text-1)] kb-focus-ring"
                />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <label
                  htmlFor="shopping-custom-amount"
                  className="kb-eyebrow text-[10px] text-[var(--kb-text-3)] block"
                >
                  КОЛИЧЕСТВО
                </label>
                <input
                  id="shopping-custom-amount"
                  data-testid="shopping-custom-amount"
                  type="text"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="1 уп."
                  className="w-full min-h-[40px] px-3 bg-[var(--kb-bg)] border border-[var(--kb-border)] text-[14px] text-[var(--kb-text-1)] tabular-nums kb-focus-ring"
                />
              </div>
              <div className="sm:col-span-4 flex items-center gap-2">
                <select
                  aria-label="Отдел магазина"
                  value={customDept}
                  onChange={(e) =>
                    setCustomDept(
                      e.target.value as ShoppingFixtureItem['department']
                    )
                  }
                  className="min-h-[40px] px-2.5 bg-[var(--kb-bg)] border border-[var(--kb-border)] text-[12px] text-[var(--kb-text-2)] flex-1 kb-focus-ring"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  data-testid="shopping-custom-submit"
                  className="kb-btn-tonal kb-focus-ring"
                >
                  Добавить
                </button>
              </div>
            </form>
          )}
        </div>

        {isStaleAfterMenuEdit && (
          <div
            role="status"
            className="p-4 bg-[var(--kb-warn-bg)] border border-[var(--kb-warn-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 text-[14px] text-[var(--kb-warn-ink)]">
              <AlertTriangle
                className="w-5 h-5 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>
                <strong>В меню была замена блюда.</strong> Текущий список
                покупок сформирован до замены и требует пересборки.
              </span>
            </div>
            <button
              type="button"
              onClick={onRefreshShoppingFromMenu}
              className="kb-btn-outline kb-focus-ring"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Обновить список по меню</span>
            </button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {DEPARTMENTS.map((dept) => {
          const deptItems = visibleItems.filter((i) => i.department === dept);
          if (deptItems.length === 0) return null;

          return (
            <section
              key={dept}
              aria-label={`Отдел: ${dept}`}
              className="kb-panel space-y-3"
            >
              <div className="food-section-heading flex items-baseline justify-between border-b border-[var(--kb-border)] pb-2.5">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="kb-eyebrow text-[var(--kb-text-3)]">
                    {dept}
                  </h2>
                </div>
                <span className="text-[11px] text-[var(--kb-text-4)] tabular-nums">
                  {deptItems.length} поз.
                </span>
              </div>

              <div className="divide-y divide-[var(--kb-border)]">
                {deptItems.map((item) => {
                  const isDone = item.checkedInStore || item.alreadyHave;
                  return (
                    <div
                      key={item.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleCheckedInStore(item.id)}
                        aria-pressed={item.checkedInStore}
                        className="min-h-[44px] min-w-0 text-left flex items-baseline gap-3 flex-1 kb-focus-ring"
                      >
                        <span className={`kb-check-badge ${item.checkedInStore ? 'kb-check-badge-done' : ''}`} aria-hidden="true">
                          <svg className="kb-check-glyph" viewBox="0 0 16 16"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" /></svg>
                        </span>
                        <span className="w-20 shrink-0 text-[13px] font-semibold text-[var(--kb-text-1)] tabular-nums leading-snug">
                          {item.amountLabel}
                        </span>
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div
                            className={`text-[15px] font-medium w-fit max-w-full truncate kb-strike-draw ${
                              isDone
                                ? 'kb-strike-draw-done'
                                : 'text-[var(--kb-text-2)]'
                            }`}
                          >
                            {item.name}
                          </div>
                          <div className="text-[11px] text-[var(--kb-text-4)] truncate">
                            Для блюд: {item.linkedRecipeTitles.join('; ')}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleAlreadyHave(item.id)}
                        aria-pressed={item.alreadyHave}
                        className={`shrink-0 ${
                          item.alreadyHave
                            ? 'kb-btn-tonal kb-focus-ring'
                            : 'kb-btn-outline kb-focus-ring'
                        }`}
                      >
                        {item.alreadyHave ? 'Дома ✓' : 'Уже есть'}
                      </button>
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
