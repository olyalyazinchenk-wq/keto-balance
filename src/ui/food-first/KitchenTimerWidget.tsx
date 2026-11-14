/**
 * src/ui/food-first/KitchenTimerWidget.tsx
 * Floating kitchen timer widget visible across other screens during active cooking.
 */

import React from 'react';
import type { ActiveKitchenTimer } from './kitchenTimerState';
import { formatTimerMMSS } from './kitchenTimerState';
import { triggerHaptic } from '../../tma/telegram';
import './kitchen-timer-widget.css';

export interface KitchenTimerWidgetProps {
  timer: ActiveKitchenTimer;
  onOpenRecipe: (recipeId: string) => void;
  onPauseTimer: () => void;
  onResumeTimer: () => void;
  onStopTimer: () => void;
}

export const KitchenTimerWidget: React.FC<KitchenTimerWidgetProps> = ({
  timer,
  onOpenRecipe,
  onPauseTimer,
  onResumeTimer,
  onStopTimer,
}) => {
  const isCompleted = timer.isCompleted || timer.remainingSeconds <= 0;

  const handleTogglePause = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('selection');
    if (timer.isPaused) {
      onResumeTimer();
    } else {
      onPauseTimer();
    }
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('selection');
    onStopTimer();
  };

  const handleGoToRecipe = () => {
    triggerHaptic('selection');
    onOpenRecipe(timer.recipeId);
  };

  return (
    <aside
      className={`kb-floating-timer${isCompleted ? ' kb-floating-timer--completed' : ''}${timer.isPaused ? ' kb-floating-timer--paused' : ''}`}
      data-testid="floating-kitchen-timer"
      role="status"
      aria-live="polite"
      aria-label={`Кухонный таймер: ${typeof timer.recipeTitle === 'string' ? timer.recipeTitle : 'Рецепт'}, ${formatTimerMMSS(timer.remainingSeconds)}`}
    >
      <div className="kb-floating-timer__main" onClick={handleGoToRecipe} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleGoToRecipe(); }}>
        <div className="kb-floating-timer__indicator" aria-hidden="true">
          {isCompleted ? '✓' : timer.isPaused ? '⏸' : '⏱'}
        </div>
        <div className="kb-floating-timer__info">
          <div className="kb-floating-timer__title-row">
            <span className="kb-floating-timer__title" data-testid="floating-timer-title">
              {typeof timer.recipeTitle === 'string' ? timer.recipeTitle : 'Рецепт'}
            </span>
            <span className="kb-floating-timer__step">
              {typeof timer.label === 'string' ? timer.label : 'Таймер'}
            </span>
          </div>
          <div className="kb-floating-timer__status-row">
            <span
              className="kb-floating-timer__countdown"
              data-testid="floating-timer-countdown"
            >
              {isCompleted ? 'Готово!' : formatTimerMMSS(timer.remainingSeconds)}
            </span>
            {timer.isPaused && (
              <span className="kb-floating-timer__badge">Пауза</span>
            )}
            {isCompleted && (
              <span className="kb-floating-timer__badge kb-floating-timer__badge--done">Время вышло</span>
            )}
          </div>
        </div>
      </div>

      <div className="kb-floating-timer__controls">
        {!isCompleted && (
          <button
            type="button"
            className="kb-floating-timer__btn"
            data-testid="floating-timer-pause-btn"
            onClick={handleTogglePause}
            aria-label={timer.isPaused ? 'Продолжить отсчёт таймера' : 'Приостановить таймер'}
          >
            {timer.isPaused ? '▶️' : '⏸️'}
          </button>
        )}
        <button
          type="button"
          className="kb-floating-timer__btn kb-floating-timer__btn--goto"
          data-testid="floating-timer-goto-btn"
          onClick={handleGoToRecipe}
          aria-label="Перейти к рецепту"
        >
          В рецепт →
        </button>
        <button
          type="button"
          className="kb-floating-timer__btn kb-floating-timer__btn--close"
          data-testid="floating-timer-stop-btn"
          onClick={handleStop}
          aria-label="Сбросить таймер"
        >
          ✕
        </button>
      </div>

      <div className="kb-floating-timer__disclaimer" aria-hidden="true">
        Фоновый звук может зависеть от устройства. Держите экран открытым.
      </div>
    </aside>
  );
};
