import './recipe-shopping-food.css';
import './menu-food.css';
import { useEffect, useState } from 'react';
import {
  Check,
  BookOpen,
  Clock,
} from './Icons';
import type {
  RecipeViewModel,
} from './contract';
import {
  extractStepTimerMinutes,
} from './state';
import { RecipeArtwork } from './RecipeArtwork';
import { photoForRecipe } from './model';
import { triggerHaptic } from '../../tma/telegram';

export interface RecipeScreenProps {
  recipe: RecipeViewModel;
  checkedIngredients: Record<string, boolean>;
  onToggleIngredient: (key: string) => void;
  checkedSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
  onLogCookedMealToDiary?: (recipeTitle: string) => void;
  onGoBack?: () => void;
}

export function RecipeScreen({
  recipe,
  checkedIngredients,
  onToggleIngredient,
  checkedSteps,
  onToggleStep,
  onLogCookedMealToDiary,
  onGoBack,
}: RecipeScreenProps) {
  const [portions, setPortions] = useState<1 | 2 | 4>(1);
  const variant = recipe.portionsVariants[portions] || recipe.portionsVariants[1];

  // Встроенный кухонный таймер для шагов рецепта
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [timerLabel, setTimerLabel] = useState<string>('Таймер у плиты');

  useEffect(() => {
    if (!timerRunning || timerSecondsLeft <= 0) {
      if (timerSecondsLeft <= 0 && timerRunning) {
        setTimerRunning(false);
        triggerHaptic('notification_success');
      }
      return;
    }
    const id = window.setInterval(() => {
      setTimerSecondsLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, timerSecondsLeft]);

  const startStepTimer = (minutes: number, stepIndex?: number) => {
    triggerHaptic('selection');
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
    triggerHaptic(
      completedStepsCount + 1 >= recipe.steps.length
        ? 'notification_success'
        : 'impact_medium'
    );
    const firstUncheckedIdx = recipe.steps.findIndex(
      (_, idx) => !checkedSteps[`${recipe.id}:step:${idx}`]
    );
    const targetIdx = firstUncheckedIdx === -1 ? 0 : firstUncheckedIdx;
    onToggleStep(`${recipe.id}:step:${targetIdx}`);
  };

  return (
    <article className="food-recipe" data-testid="food-recipe-screen">
      {/* Секция 01: Обложечная шапка рецепта */}
      <header className="border-b border-[var(--kb-border)] pb-6 sm:pb-10 space-y-4 sm:space-y-6">
        {onGoBack && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('impact_light');
              onGoBack();
            }}
            data-testid="recipe-back-btn"
            className="mb-2 text-sm text-[var(--kb-text-2)] hover:text-[var(--kb-text-1)] flex items-center gap-1"
          >
            ← Назад к меню
          </button>
        )}
        <div className="food-grid items-start">
          <div className="col-span-3 md:col-span-5 space-y-3 sm:space-y-4 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="kb-eyebrow text-[var(--kb-text-4)]">Рецепт</div>
              {(recipe.sourceStatus === 'review' || (recipe as any).editorial_status === 'review') && (
                <span
                  className="fm-review-badge"
                  data-testid={`review-badge-${recipe.id}`}
                >
                  🔍 На проверке
                </span>
              )}
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
              <span className="text-[var(--kb-border)]" aria-hidden="true">|</span>
              <span>
                <span className="text-[var(--kb-text-3)]">Выход: </span>
                <strong className="font-semibold text-[var(--kb-text-1)] tabular-nums">
                  {variant.yieldNote}
                </strong>
              </span>
              <span className="text-[var(--kb-border)]" aria-hidden="true">|</span>
              <span
                className="text-[var(--kb-text-3)]"
                title={`Статус расчёта нутриентов: ${variant.nutritionStatus}`}
              >
                КБЖУ уточняется автором
              </span>
            </div>

            {/* Акцентный Start + масштаб порций */}
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
                {([1, 2, 4] as const).map((p) => {
                  const active = portions === p;
                  const pVariant = recipe.portionsVariants[p];
                  const label = pVariant ? pVariant.yieldNote : `${p}×`;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setPortions(p);
                      }}
                      data-testid={`recipe-portions-${p}x`}
                      aria-pressed={active}
                      className={`min-h-[38px] px-2.5 sm:px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] tabular-nums kb-focus-ring kb-transition-scale ${
                        active
                          ? 'bg-[var(--kb-day-active-bg)] text-[var(--kb-text-1)]'
                          : 'text-[var(--kb-text-3)] hover:text-[var(--kb-text-1)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="col-span-4 md:col-span-5">
            <RecipeArtwork
              key={recipe.id}
              imageUrl={photoForRecipe(recipe.id)}
              artworkKey={recipe.artworkKey}
              caption={recipe.artworkCaption || recipe.title}
              prepMinutes={recipe.prepMinutes}
              slotLabel={recipe.slotLabel}
              size="compact"
            />
          </div>
        </div>
      </header>

      {/* Основной разворот: Ингредиенты + Шаги с таймером */}
      <div className="food-grid items-start pt-6">
        <section
          aria-labelledby="recipe-ingredients-heading"
          className="col-span-4 md:col-span-5 bg-[var(--kb-surface)] border border-[var(--kb-border)] p-4 sm:p-6 space-y-4"
        >
          <div className="food-section-heading flex items-baseline justify-between gap-2 border-b border-[var(--kb-border)] pb-2.5">
            <h2
              id="recipe-ingredients-heading"
              className="kb-eyebrow text-[var(--kb-text-3)] tabular-nums"
            >
              ИНГРЕДИЕНТЫ · ВЫХОД: {variant.yieldNote.toUpperCase()}
            </h2>
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
                  onClick={() => {
                    triggerHaptic('selection');
                    onToggleIngredient(ingKey);
                  }}
                  aria-pressed={isChecked}
                  className={`w-full text-left kb-ingredient-row group kb-focus-ring ${
                    isChecked ? 'kb-ingredient-row-done' : ''
                  }`}
                >
                  <span className="text-[14px] sm:text-[15px] font-semibold tabular-nums">
                    <span className={isChecked ? 'line-through text-stone-400' : 'text-[var(--kb-text-1)]'}>
                      {item.amountLabel}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-3 min-w-0">
                    <span className={`text-[14px] sm:text-[15px] ${isChecked ? 'line-through text-stone-400' : 'text-[var(--kb-text-2)]'}`}>
                      {item.name}
                    </span>
                    <span className="text-[12px] text-[var(--kb-text-4)] shrink-0">
                      {isChecked ? '✓' : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Секция шагов приготовления */}
        <section
          aria-labelledby="recipe-steps-heading"
          className="col-span-5 md:col-span-7 bg-[var(--kb-surface)] border border-[var(--kb-border)] p-4 sm:p-6 space-y-6"
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-[var(--kb-border)] pb-2.5">
            <h2 id="recipe-steps-heading" className="kb-eyebrow text-[var(--kb-text-3)]">
              ШАГИ ПРИГОТОВЛЕНИЯ
            </h2>
            <span className="text-[11px] text-[var(--kb-text-4)] tabular-nums">
              {completedStepsCount}/{recipe.steps.length} готово
            </span>
          </div>

          {/* Плашка таймера, если он запущен */}
          {(timerRunning || timerSecondsLeft > 0) && (
            <div
              className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3"
              role="timer"
              aria-label="Кухонный таймер"
              data-testid="kitchen-timer-display"
            >
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                <Clock className="w-5 h-5 animate-pulse" aria-hidden="true" />
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider block">
                    {timerLabel}
                  </span>
                  <span className="text-2xl font-bold font-mono">
                    {formatTimerMMSS(timerSecondsLeft)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
                  onClick={() => {
                    triggerHaptic('selection');
                    setTimerRunning((prev) => !prev);
                  }}
                >
                  {timerRunning ? 'Пауза' : 'Продолжить'}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
                  onClick={() => {
                    triggerHaptic('impact_light');
                    setTimerRunning(false);
                    setTimerSecondsLeft(0);
                  }}
                >
                  Сброс
                </button>
              </div>
            </div>
          )}

          <ol className="space-y-4">
            {recipe.steps.map((step, idx) => {
              const stepKey = `${recipe.id}:step:${idx}`;
              const isChecked = Boolean(checkedSteps[stepKey]);
              const timerMins = extractStepTimerMinutes(step);
              return (
                <li
                  key={stepKey}
                  data-testid={`recipe-step-item-${idx}`}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isChecked
                      ? 'bg-stone-50 border-stone-200 opacity-60 dark:bg-stone-900/30 dark:border-stone-800'
                      : 'bg-[var(--kb-surface)] border-[var(--kb-border)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('impact_light');
                        onToggleStep(stepKey);
                      }}
                      aria-pressed={isChecked}
                      data-testid={`recipe-step-toggle-${idx}`}
                      aria-label={`Шаг ${idx + 1}: ${isChecked ? 'готово' : 'отметить готовым'}`}
                      className={`mt-0.5 w-11 h-11 rounded-md border flex items-center justify-center shrink-0 ${
                        isChecked
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-stone-300 bg-white dark:bg-stone-800 dark:border-stone-600'
                      }`}
                    >
                      {isChecked && <Check className="w-4 h-4" aria-hidden="true" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[15px] leading-relaxed ${isChecked ? 'line-through text-stone-400' : 'text-[var(--kb-text-1)]'}`}>
                        <strong className="mr-1.5">{idx + 1}.</strong>
                        {step}
                      </p>
                      {timerMins !== null && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('selection');
                            startStepTimer(timerMins, idx);
                          }}
                          data-testid={`start-step-timer-btn-${idx}`}
                          className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5 hover:underline"
                        >
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Запустить таймер: {timerMins} мин</span>
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Заметки, хранение и запись */}
          <div className="pt-4 border-t border-[var(--kb-border)] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="kb-panel space-y-1.5 p-3 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-surface-muted)]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--kb-text-3)]">
                  ДОПУСТИМЫЕ ЗАМЕНЫ
                </div>
                <ul className="text-xs text-[var(--kb-text-2)] space-y-1">
                  {recipe.substitutions.map((sub, i) => (
                    <li key={i}>— {sub}</li>
                  ))}
                </ul>
              </div>

              <div className="kb-panel space-y-1.5 p-3 rounded-xl border border-[var(--kb-border)] bg-[var(--kb-surface-muted)]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--kb-text-4)]">
                  ПРАВИЛО ХРАНЕНИЯ
                </div>
                <p className="text-xs text-[var(--kb-text-2)] leading-snug">
                  {recipe.storageRule}
                </p>
              </div>
            </div>

            {onLogCookedMealToDiary && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('notification_success');
                    onLogCookedMealToDiary(recipe.title);
                  }}
                  data-testid="recipe-log-to-diary-btn"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200 inline-flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                  <span>Записать в дневник</span>
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
