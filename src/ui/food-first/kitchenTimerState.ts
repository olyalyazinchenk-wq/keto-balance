/**
 * src/ui/food-first/kitchenTimerState.ts
 * Isolated user-scoped persistent kitchen timer state across navigation and reloads.
 */

import { timerDeadline, remainingTimerSeconds } from './kitchenTimer';

export interface ActiveKitchenTimer {
  userId: string;
  recipeId: string;
  recipeTitle: string;
  stepIndex?: number;
  label: string;
  totalDurationSeconds: number;
  deadline: number | null; // null when paused or completed
  remainingSeconds: number;
  isPaused: boolean;
  isCompleted: boolean;
  startedAt: number;
}

export function getTimerStorageKey(userId?: string | number | null): string {
  const normalized = userId !== undefined && userId !== null && String(userId).trim() !== ''
    ? String(userId).trim()
    : 'anonymous';
  return `kb:timer:${normalized}`;
}

export function saveActiveTimer(timer: ActiveKitchenTimer): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = getTimerStorageKey(timer.userId);
    window.localStorage.setItem(key, JSON.stringify(timer));
  } catch (e) {
    console.warn('[KitchenTimer] Failed to persist timer to localStorage:', e);
  }
}

export function loadActiveTimer(
  userId?: string | number | null,
  now: number = Date.now()
): ActiveKitchenTimer | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const key = getTimerStorageKey(userId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.recipeId !== 'string' ||
      typeof parsed.remainingSeconds !== 'number'
    ) {
      // Safe fallback on corrupted record
      window.localStorage.removeItem(key);
      return null;
    }

    const expectedUser = userId !== undefined && userId !== null && String(userId).trim() !== ''
      ? String(userId).trim()
      : 'anonymous';

    if (parsed.userId && parsed.userId !== expectedUser) {
      // Strict user isolation: do not expose another user's timer
      return null;
    }

    const timer: ActiveKitchenTimer = {
      userId: expectedUser,
      recipeId: parsed.recipeId,
      recipeTitle: parsed.recipeTitle || 'Рецепт',
      stepIndex: typeof parsed.stepIndex === 'number' ? parsed.stepIndex : undefined,
      label: parsed.label || 'Таймер у плиты',
      totalDurationSeconds: Number(parsed.totalDurationSeconds) || parsed.remainingSeconds,
      deadline: parsed.deadline !== null && Number.isFinite(parsed.deadline) ? parsed.deadline : null,
      remainingSeconds: Math.max(0, Math.floor(parsed.remainingSeconds)),
      isPaused: Boolean(parsed.isPaused),
      isCompleted: Boolean(parsed.isCompleted),
      startedAt: Number(parsed.startedAt) || now,
    };

    if (!timer.isPaused && timer.deadline !== null) {
      const remaining = remainingTimerSeconds(timer.deadline, now);
      timer.remainingSeconds = remaining;
      if (remaining <= 0) {
        timer.remainingSeconds = 0;
        timer.isCompleted = true;
        timer.deadline = null;
      }
    }

    return timer;
  } catch {
    // Corrupted record safely ignored
    try {
      const key = getTimerStorageKey(userId);
      window.localStorage.removeItem(key);
    } catch {}
    return null;
  }
}

export function clearActiveTimer(userId?: string | number | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return null as any;
  try {
    const key = getTimerStorageKey(userId);
    window.localStorage.removeItem(key);
  } catch (e) {
    console.warn('[KitchenTimer] Failed to clear timer from localStorage:', e);
  }
}

export function formatTimerMMSS(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
