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

/**
 * Safely accesses window.localStorage without throwing SecurityError in restricted environments.
 */
export function getSafeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage || null;
  } catch {
    return null;
  }
}

export function getTimerStorageKey(userId?: string | number | null): string {
  const normalized = userId !== undefined && userId !== null && String(userId).trim() !== ''
    ? String(userId).trim()
    : 'anonymous';
  return `kb:timer:${normalized}`;
}

/**
 * Strict validator for timer records loaded from storage.
 * Ensures all types are primitive and values are within valid bounds.
 */
export function validateTimerRecord(parsed: any, expectedUser: string): ActiveKitchenTimer | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  // recipeId: must be non-empty string
  if (typeof parsed.recipeId !== 'string' || !parsed.recipeId.trim() || parsed.recipeId.length > 128) {
    return null;
  }

  // recipeTitle: must be string, cannot be an object or number
  if (typeof parsed.recipeTitle !== 'string' || !parsed.recipeTitle.trim() || parsed.recipeTitle.length > 256) {
    return null;
  }

  // label: must be string
  if (typeof parsed.label !== 'string' || !parsed.label.trim() || parsed.label.length > 256) {
    return null;
  }

  // userId check: strict user isolation
  const recordUser = typeof parsed.userId === 'string' ? parsed.userId.trim() : 'anonymous';
  if (recordUser !== expectedUser) {
    return null;
  }

  // remainingSeconds: finite number >= 0 and <= 86400 (24h)
  if (typeof parsed.remainingSeconds !== 'number' || !Number.isFinite(parsed.remainingSeconds) || parsed.remainingSeconds < 0 || parsed.remainingSeconds > 86400) {
    return null;
  }

  // totalDurationSeconds: finite number > 0 and <= 86400
  const totalDuration = typeof parsed.totalDurationSeconds === 'number' && Number.isFinite(parsed.totalDurationSeconds)
    ? parsed.totalDurationSeconds
    : parsed.remainingSeconds;
  if (totalDuration <= 0 || totalDuration > 86400) {
    return null;
  }

  // isPaused and isCompleted: must be booleans
  if (typeof parsed.isPaused !== 'boolean' || typeof parsed.isCompleted !== 'boolean') {
    return null;
  }

  // deadline: must be null or finite number > 0
  let deadline: number | null = null;
  if (parsed.deadline !== null && parsed.deadline !== undefined) {
    if (typeof parsed.deadline !== 'number' || !Number.isFinite(parsed.deadline) || parsed.deadline <= 0) {
      return null;
    }
    deadline = parsed.deadline;
  }

  // Invariant: if running (not paused, not completed, remaining > 0), deadline must be present
  if (!parsed.isPaused && !parsed.isCompleted && parsed.remainingSeconds > 0 && deadline === null) {
    return null;
  }

  // stepIndex: optional integer >= 0
  let stepIndex: number | undefined = undefined;
  if (parsed.stepIndex !== undefined && parsed.stepIndex !== null) {
    if (typeof parsed.stepIndex !== 'number' || !Number.isInteger(parsed.stepIndex) || parsed.stepIndex < 0 || parsed.stepIndex > 200) {
      return null;
    }
    stepIndex = parsed.stepIndex;
  }

  // startedAt: must be finite number > 0
  const startedAt = typeof parsed.startedAt === 'number' && Number.isFinite(parsed.startedAt) && parsed.startedAt > 0
    ? parsed.startedAt
    : Date.now();

  return {
    userId: expectedUser,
    recipeId: parsed.recipeId.trim(),
    recipeTitle: parsed.recipeTitle.trim(),
    stepIndex,
    label: parsed.label.trim(),
    totalDurationSeconds: Math.floor(totalDuration),
    deadline,
    remainingSeconds: Math.floor(parsed.remainingSeconds),
    isPaused: parsed.isPaused,
    isCompleted: parsed.isCompleted,
    startedAt,
  };
}

export function saveActiveTimer(timer: ActiveKitchenTimer): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    const key = getTimerStorageKey(timer.userId);
    storage.setItem(key, JSON.stringify(timer));
  } catch (e) {
    console.warn('[KitchenTimer] Failed to persist timer to localStorage:', e);
  }
}

export function loadActiveTimer(
  userId?: string | number | null,
  now: number = Date.now()
): ActiveKitchenTimer | null {
  const storage = getSafeStorage();
  if (!storage) return null;
  const key = getTimerStorageKey(userId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupted JSON -> remove key and fail safe
      try { storage.removeItem(key); } catch {}
      return null;
    }

    const expectedUser = userId !== undefined && userId !== null && String(userId).trim() !== ''
      ? String(userId).trim()
      : 'anonymous';

    const timer = validateTimerRecord(parsed, expectedUser);
    if (!timer) {
      // Corrupted or invalid fields -> clean up and return null
      try { storage.removeItem(key); } catch {}
      return null;
    }

    // If running, recompute remainingSeconds based on current time vs absolute deadline
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
    // Top-level safety: never crash the caller on storage issues
    try { storage.removeItem(key); } catch {}
    return null;
  }
}

export function clearActiveTimer(userId?: string | number | null): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    const key = getTimerStorageKey(userId);
    storage.removeItem(key);
  } catch (e) {
    console.warn('[KitchenTimer] Failed to clear timer from localStorage:', e);
  }
}

export function formatTimerMMSS(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
