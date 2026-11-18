import './recipe-shopping-food.css';
import './menu-food.css';
import { useEffect, useState, useRef } from 'react';
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
import { RecipePlate } from './RecipePlate';
import { photoForRecipe } from './model';
import { triggerHaptic } from '../../tma/telegram';
import { timerDeadline, remainingTimerSeconds } from './kitchenTimer';

import type { ActiveKitchenTimer } from './kitchenTimerState';

export interface RecipeScreenProps {
  recipe: RecipeViewModel;
  selectedPortions?: 1 | 2 | 4;
  onSelectPortions?: (value: 1 | 2 | 4) => void;
  checkedIngredients: Record<string, boolean>;
  onToggleIngredient: (key: string) => void;
  checkedSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
  onLogCookedMealToDiary?: (recipeTitle: string) => void;
  onGoBack?: () => void;
  activeTimer?: ActiveKitchenTimer | null;
  onStartTimer?: (recipeId: string, recipeTitle: string, minutes: number, stepIndex?: number) => void;
  onPauseTimer?: () => void;
  onResumeTimer?: () => void;
  onStopTimer?: () => void;
}

export function RecipeScreen({
  recipe,
  selectedPortions,
  onSelectPortions,
  checkedIngredients,
  onToggleIngredient,
  checkedSteps,
  onToggleStep,
  onLogCookedMealToDiary,
  onGoBack,
  activeTimer,
  onStartTimer,
  onPauseTimer,
  onResumeTimer,
  onStopTimer,
}: RecipeScreenProps) {
  const [localPortions, setLocalPortions] = useState<1 | 2 | 4>(1);
  const portions = selectedPortions ?? localPortions;
  const [section, setSection] = useState<'ingredients' | 'steps'>(() =>
    activeTimer?.recipeId === recipe.id ? 'steps' : 'ingredients'
  );
  const variant = recipe.portionsVariants[portions] || recipe.portionsVariants[1];

  // Local fallback timer when no lifted timer is passed
  const [localTimerSecondsLeft, setLocalTimerSecondsLeft] = useState<number>(0);
  const [localTimerRunning, setLocalTimerRunning] = useState<boolean>(false);
  const [localTimerLabel, setLocalTimerLabel] = useState<string>('Таймер у плиты');
  const [localTimerCompleted, setLocalTimerCompleted] = useState(false);
  const deadlineRef = useRef<number | null>(null);

  const hasLiftedTimer = Boolean(onStartTimer);
  const isCurrentTimer = Boolean(activeTimer && activeTimer.recipeId === recipe.id);

  const timerLabel = hasLiftedTimer
    ? (isCurrentTimer ? activeTimer!.label : 'Таймер у плиты')
    : localTimerLabel;
  const timerSecondsLeft = hasLiftedTimer
    ? (isCurrentTimer ? activeTimer!.remainingSeconds : 0)
    : localTimerSecondsLeft;
  const timerRunning = hasLiftedTimer
    ? (isCurrentTimer ? (!activeTimer!.isPaused && !activeTimer!.isCompleted && activeTimer!.remainingSeconds > 0) : false)
    : localTimerRunning;
  const timerCompleted = hasLiftedTimer
    ? (isCurrentTimer ? Boolean(activeTimer!.isCompleted || activeTimer!.remainingSeconds <= 0) : false)
    : localTimerCompleted;
  const timerVisible = hasLiftedTimer
    ? (isCurrentTimer && (activeTimer!.remainingSeconds > 0 || activeTimer!.isCompleted || activeTimer!.isPaused))
    : (localTimerRunning || localTimerSecondsLeft > 0 || localTimerCompleted);

  useEffect(() => {
    if (hasLiftedTimer) return;
    deadlineRef.current = null;
    setLocalTimerSecondsLeft(0);
    setLocalTimerRunning(false);
    setLocalTimerCompleted(false);
    setLocalTimerLabel('Таймер у плиты');
  }, [recipe.id, hasLiftedTimer]);

  useEffect(() => {
    if (hasLiftedTimer || !localTimerRunning) return;
    const refresh = () => {
      if (deadlineRef.current === null) return;
      const remaining = remainingTimerSeconds(deadlineRef.current);
      setLocalTimerSecondsLeft(remaining);
      if (remaining <= 0) {
        deadlineRef.current = null;
        setLocalTimerRunning(false);
        setLocalTimerCompleted(true);
        triggerHaptic('notification_success');
      }
    };
    refresh();
    const id = window.setInterval(refresh, 1000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [localTimerRunning, hasLiftedTimer]);

  const startStepTimer = (minutes: number, stepIndex?: number) => {
    if (hasLiftedTimer && onStartTimer) {
      onStartTimer(recipe.id, recipe.title, minutes, stepIndex);
      return;
    }
    triggerHaptic('selection');
    setLocalTimerSecondsLeft(minutes * 60);
    deadlineRef.current = timerDeadline(minutes * 60);
    setLocalTimerCompleted(false);
    setLocalTimerLabel(
      stepIndex !== undefined
        ? `Шаг ${stepIndex + 1} · ${minutes} мин`
        : `Таймер · ${minutes} мин`
    );
    setLocalTimerRunning(true);
  };

  const toggleTimer = () => {
    if (hasLiftedTimer) {
      if (timerRunning) {
        onPauseTimer?.();
      } else {
        onResumeTimer?.();
      }
      return;
    }
    triggerHaptic('selection');
    if (localTimerRunning) {
      const remaining = remainingTimerSeconds(deadlineRef.current);
      deadlineRef.current = null;
      setLocalTimerSecondsLeft(remaining);
      setLocalTimerRunning(false);
      if (remaining === 0) setLocalTimerCompleted(true);
    } else if (localTimerSecondsLeft > 0) {
      deadlineRef.current = timerDeadline(localTimerSecondsLeft);
      setLocalTimerRunning(true);
    }
  };

  const handleResetTimer = () => {
    if (hasLiftedTimer) {
      onStopTimer?.();
      return;
    }
    triggerHaptic('impact_light');
    setLocalTimerRunning(false);
    deadlineRef.current = null;
    setLocalTimerCompleted(false);
    setLocalTimerSecondsLeft(0);
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
    setSection('steps');
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

  const editorialPhoto = photoForRecipe(recipe.id);
  return (
    <article className="food-recipe editorial-detail" data-testid="food-recipe-screen">
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
            ← Назад
          </button>
        )}
        {editorialPhoto && <img className="editorial-detail-photo" src={editorialPhoto} alt={recipe.title} width="640" height="440" />}
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
                title={variant.nutrition?.status === 'reviewed' ? 'Расчёт по подтверждённому составу' : 'Пищевая ценность пока не подтверждена'}
              >
                {variant.nutrition?.status === 'reviewed' ? 'КБЖУ по подтверждённому составу' : 'КБЖУ уточняется автором'}
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

            </div>
          </div>

        </div>
      </header>

      <div className="editorial-recipe-sections" role="group" aria-label="Разделы рецепта">
        <button type="button" aria-pressed={section === 'ingredients'} aria-controls="editorial-ingredients" onClick={() => setSection('ingredients')}>
          Ингредиенты
        </button>
        <button type="button" aria-pressed={section === 'steps'} aria-controls="editorial-steps" onClick={() => setSection('steps')}>
          Приготовление
        </button>
      </div>
      <div className="editorial-recipe-body">
        <section
          id="editorial-ingredients"
          hidden={section !== 'ingredients'}
          aria-labelledby="recipe-ingredients-heading"
          className="col-span-4 md:col-span-5 bg-[var(--kb-surface)] border border-[var(--kb-border)] p-4 sm:p-6 space-y-4"
        >
            <RecipePlate
              key={recipe.id}
              recipe={recipe}
              variant={variant}
              checkedIngredients={checkedIngredients}
              onToggleIngredient={onToggleIngredient}
              selectedPortions={portions}
              onSelectPortions={(p) => { triggerHaptic('selection'); (onSelectPortions ?? setLocalPortions)(p); }}
            />
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
          id="editorial-steps"
          hidden={section !== 'steps'}
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
          {timerVisible && (
            <div
              className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3"
              role="timer"
              aria-label="Кухонный таймер"
              data-testid="kitchen-timer-display"
            >
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                <Clock className="w-5 h-5" aria-hidden="true" />
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider block">
                    {timerLabel}
                  </span>
                  <span className="text-2xl font-bold font-mono">
                    {formatTimerMMSS(timerSecondsLeft)}
                  </span>
                  {timerCompleted && <span role="status" className="block text-sm font-semibold">Время вышло — проверьте блюдо</span>}
                  <p className="text-xs mt-1">Таймер сохраняется при переходе на другие экраны. Фоновый звук может зависеть от устройства: держите экран открытым во время готовки.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!timerCompleted && <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
                  onClick={toggleTimer}
                >
                  {timerRunning ? 'Пауза' : 'Продолжить'}
                </button>}
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
                  onClick={handleResetTimer}
                >
                  Сброс
                </button>
              </div>
            </div>
          )}

          {(() => {
            const hasAnyStepTimer = recipe.steps.some((s) => extractStepTimerMinutes(s) !== null);
            return (
              <ol className="space-y-4">
                {recipe.steps.map((step, idx) => {
                  const stepKey = `${recipe.id}:step:${idx}`;
                  const isChecked = Boolean(checkedSteps[stepKey]);
                  const timerMins = extractStepTimerMinutes(step) ?? (!hasAnyStepTimer && idx === 0 ? (recipe.prepMinutes || 5) : null);
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
            );
          })()}

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
