import type { PilotPreferencesV1, PilotRestrictionToken } from '../api/pilotTypes';
import type { GeneratedMenu, Recipe, UserProfile } from '../domain/types';
import { isRecipeAllowed } from '../domain/eligibility';
import { PREVIEW_RECIPE_IDS } from '../data/releasedRecipeIds';

export const RESTRICTION_MAP: Record<
  PilotRestrictionToken,
  { field: 'allergies' | 'disliked'; value: string; label: string }
> = {
  exclude_eggs: { field: 'allergies', value: 'яйца', label: 'Исключить яйца' },
  exclude_dairy: { field: 'allergies', value: 'молочные продукты', label: 'Исключить молочные продукты' },
  exclude_fish: { field: 'allergies', value: 'рыба', label: 'Исключить рыбу' },
  exclude_nuts: { field: 'allergies', value: 'орехи', label: 'Исключить орехи' },
  exclude_offal: { field: 'disliked', value: 'субпродукты', label: 'Не использовать субпродукты' },
  exclude_mushrooms: { field: 'disliked', value: 'грибы', label: 'Не использовать грибы' },
};

export function preferencesToUserProfile(prefs: PilotPreferencesV1 | null): UserProfile {
  if (!prefs) {
    return {
      confirmed: false,
      allergies: [],
      disliked: [],
      allergyNote: '',
      cookTime: 0,
    };
  }

  if (typeof prefs.confirmed18Plus !== 'boolean') {
    throw new TypeError('confirmed18Plus must be a boolean');
  }

  if (typeof prefs.prepTimeMax !== 'number' || isNaN(prefs.prepTimeMax) || prefs.prepTimeMax < 0 || prefs.prepTimeMax > 240) {
    throw new RangeError('prepTimeMax must be an integer between 0 and 240');
  }

  const allergies: string[] = [];
  const disliked: string[] = [];

  for (const token of prefs.restrictions) {
    const entry = RESTRICTION_MAP[token];
    if (!entry) {
      throw new Error(`Unknown restriction token: ${token}`);
    }
    if (entry.field === 'allergies') {
      if (!allergies.includes(entry.value)) allergies.push(entry.value);
    } else {
      if (!disliked.includes(entry.value)) disliked.push(entry.value);
    }
  }

  return {
    confirmed: prefs.confirmed18Plus,
    mode: prefs.approach,
    meals: prefs.mealsPerDay,
    cookTime: prefs.prepTimeMax,
    allergies,
    disliked,
    allergyNote: '',
  };
}

export function approachToMode(approach: string): 'keto' | 'carnivore' {
  if (approach === 'carnivore') return 'carnivore';
  if (approach === 'keto') return 'keto';
  throw new Error('Режим «Знакомство» носит ознакомительный характер. Для расчёта персонального меню выберите «Кето» или «Карнивор».');
}

export function isMenuCompatibleWithProfile(
  menu: GeneratedMenu | null,
  profile: UserProfile | null,
  catalog: readonly Recipe[],
  releasedIds?: readonly string[],
  isPreview?: boolean
): boolean {
  if (!menu || !menu.days || menu.days.length === 0) return true;
  if (!profile) return true;
  if (profile.mode === 'explore') return false;

  const effectiveIds = releasedIds !== undefined
    ? releasedIds
    : (isPreview ? PREVIEW_RECIPE_IDS : catalog.map((r) => r.id));

  if (effectiveIds.length === 0) {
    return false; // Empty admitted pool: no recipes admitted
  }

  const recipeMap = new Map<string, Recipe>();
  for (const r of catalog) {
    recipeMap.set(r.id, r);
  }

  for (const day of menu.days) {
    const daySlotIds = Object.values(day.slots).filter(Boolean);
    const uniqueIds = new Set(daySlotIds);
    if (uniqueIds.size !== daySlotIds.length) {
      return false; // Duplicate recipe ID within the same day is forbidden
    }

    for (const slotKey of Object.keys(day.slots)) {
      const recipeId = day.slots[slotKey];
      const recipe = recipeMap.get(recipeId);
      if (!recipe) {
        return false; // Отозванный или неизвестный рецепт
      }
      if (!effectiveIds.includes(recipe.id)) {
        return false; // Не входит в допущенные
      }
      if (profile.mode && recipe.mode !== profile.mode) {
        return false; // Не совпадает режим (кето vs карнивор)
      }
      if (!isRecipeAllowed(recipe, profile)) {
        return false; // Рецепт нарушает ограничения или лимит времени
      }
    }
  }

  return true;
}


export class SerializedSaveQueue {
  private queue: Promise<any> = Promise.resolve();
  private pendingCount = 0;

  get isPending(): boolean {
    return this.pendingCount > 0;
  }

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.pendingCount++;
    const execution = this.queue.then(() => task());
    this.queue = execution.catch(() => {}).finally(() => {
      this.pendingCount--;
    });
    return execution;
  }
}

export function getUserCacheKey(userId: number, key: string): string {
  return `kb_pilot_v1:${userId}:${key}`;
}

export function readUserCache<T>(userId: number, key: string): T | null {
  try {
    const raw = localStorage.getItem(getUserCacheKey(userId, key));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeUserCache<T>(userId: number, key: string, value: T): void {
  try {
    localStorage.setItem(getUserCacheKey(userId, key), JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearUserCache(userId: number): void {
  try {
    const prefix = `kb_pilot_v1:${userId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
