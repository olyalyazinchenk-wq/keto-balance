import type {
  DayMenu,
  RecipeViewModel,
  ShoppingFixtureItem,
  UserSettingsDraft,
} from './contract';
import { preferencesToUserProfile } from '../../adapters/pilotState';
import { isRecipeAllowed } from '../../domain/eligibility';
import { RECIPES } from '../../data/recipes';

export const RESTRICTION_LABELS: Record<string, string> = {
  exclude_dairy: 'Без молочных продуктов',
  exclude_eggs: 'Без яиц',
  exclude_fish: 'Без рыбы и морепродуктов',
  exclude_nuts: 'Без орехов и семечек',
  exclude_offal: 'Без субпродуктов',
  exclude_mushrooms: 'Без грибов',
  no_dairy: 'Без молочных продуктов',
  no_eggs: 'Без яиц',
  no_fish: 'Без рыбы и морепродуктов',
  no_nuts: 'Без орехов и семечек',
  no_pork: 'Без свинины',
};

export function extractStepTimerMinutes(stepText: string): number | null {
  const rangeMatch = stepText.match(/(\d+)\s*[–-]\s*(\d+)\s*мин/i);
  if (rangeMatch) {
    const upper = Number.parseInt(rangeMatch[2], 10);
    return Number.isFinite(upper) && upper > 0 ? upper : null;
  }
  const singleMatch = stepText.match(/(\d+)\s*мин/i);
  if (singleMatch) {
    const mins = Number.parseInt(singleMatch[1], 10);
    return Number.isFinite(mins) && mins > 0 ? mins : null;
  }
  return null;
}

export interface ShoppingItemLike {
  id?: string;
  name: string;
  amountLabel: string;
  department?: string;
  alreadyHave?: boolean;
  checkedInStore?: boolean;
}

export function calculateShoppingProgress(items: readonly ShoppingItemLike[]): {
  total: number;
  inStore: number;
  alreadyHome: number;
  completed: number;
  remaining: number;
  percent: number;
} {
  const total = items.length;
  if (total === 0) {
    return {
      total: 0,
      inStore: 0,
      alreadyHome: 0,
      completed: 0,
      remaining: 0,
      percent: 0,
    };
  }
  let inStore = 0;
  let alreadyHome = 0;
  for (const item of items) {
    if (item.checkedInStore) inStore++;
    if (item.alreadyHave) alreadyHome++;
  }
  const completed = items.filter((i) => i.checkedInStore || i.alreadyHave).length;
  const remaining = total - completed;
  const percent = Math.round((completed / total) * 100);
  return { total, inStore, alreadyHome, completed, remaining, percent };
}

export function formatShoppingListForClipboard(
  items: readonly ShoppingItemLike[],
  menuTitle: string,
  isStale: boolean
): string {
  const toBuy = items.filter((i) => !i.alreadyHave && !i.checkedInStore);
  const alreadyHave = items.filter((i) => i.alreadyHave || i.checkedInStore);

  const lines: string[] = [`Кето Баланс — Список покупок (${menuTitle})`];
  if (isStale) {
    lines.push(
      `Примечание: в меню были замены блюд — проверь актуальность позиций.`
    );
  }

  if (toBuy.length > 0) {
    lines.push(``, `Нужно купить (${toBuy.length}):`);
    for (const item of toBuy) {
      lines.push(`• ${item.name} — ${item.amountLabel} (${item.department})`);
    }
  } else {
    lines.push(
      ``,
      `Все продукты из списка уже отмечены как купленные или имеющиеся дома.`
    );
  }

  if (alreadyHave.length > 0) {
    lines.push(``, `Уже есть дома / куплено (${alreadyHave.length}):`);
    for (const item of alreadyHave) {
      lines.push(`✓ ${item.name} — ${item.amountLabel}`);
    }
  }

  return lines.join('\n');
}

export function createCustomShoppingItem(
  name: string,
  amountLabel: string,
  department: ShoppingFixtureItem['department'] = 'Масла и бакалея'
): ShoppingFixtureItem | null {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  const trimmedAmount = amountLabel.trim() || '1 шт.';
  return {
    id: `shop-custom-${Date.now()}`,
    name: trimmedName,
    department,
    amountLabel: trimmedAmount,
    linkedRecipeTitles: ['Личное добавление'],
    alreadyHave: false,
    checkedInStore: false,
  };
}

export function resolveDayMenuSlots(
  dayMenu: DayMenu,
  recipesById: Record<string, RecipeViewModel>,
  mealsPerDay: number
): { slotKey: string; slotLabel: string; recipe: RecipeViewModel | null }[] {
  const slotOrder: { key: string; label: string }[] =
    mealsPerDay === 2
      ? [
          { key: 'breakfast', label: 'Первый приём (завтрак / бранч)' },
          { key: 'dinner', label: 'Второй приём (ужин)' },
        ]
      : mealsPerDay === 4
      ? [
          { key: 'breakfast', label: 'Завтрак' },
          { key: 'lunch', label: 'Обед' },
          { key: 'dinner', label: 'Ужин' },
          { key: 'snack', label: 'Перекус' },
        ]
      : [
          { key: 'breakfast', label: 'Завтрак' },
          { key: 'lunch', label: 'Обед' },
          { key: 'dinner', label: 'Ужин' },
        ];

  return slotOrder.map(({ key, label }) => {
    const recipeId = dayMenu.slots[key];
    return {
      slotKey: key,
      slotLabel: label,
      recipe: recipeId ? recipesById[recipeId] || null : null,
    };
  });
}

export function filterRecipesBySettings(
  recipes: RecipeViewModel[],
  settings: Pick<UserSettingsDraft, 'approach' | 'restrictions' | 'prepTimeMax'>,
  catalogRecipes?: any[],
  admittedRecipeIds?: readonly string[]
): RecipeViewModel[] {
  const canonProfile = preferencesToUserProfile({
    confirmed18Plus: true,
    approach: (settings.approach as any) || 'keto',
    restrictions: (settings.restrictions || []) as any,
    prepTimeMax: settings.prepTimeMax || 0,
    mealsPerDay: 3,
    preferenceNote: '',
  });

  const recipeMap = new Map<string, any>();
  // An explicitly empty server catalog must never fall back to bundled recipes.
  const sourceList = catalogRecipes ?? RECIPES;
  for (const r of sourceList) {
    recipeMap.set(r.id, r);
  }

  const admittedIds = admittedRecipeIds === undefined ? null : new Set(admittedRecipeIds);
  return recipes.filter((vm) => {
    if (admittedIds && !admittedIds.has(vm.id)) return false;
    const r = recipeMap.get(vm.id);
    if (!r) return false;
    if (r.mode !== canonProfile.mode) return false;
    return isRecipeAllowed(r, canonProfile);
  });
}

/**
 * Warning only: this is catalog coverage, not a clinical assessment of a menu.
 * A broad total pool can hide too few recipes for daily breakfast slots.
 */
export function evaluateSevenDayDiversity(
  recipes: readonly Pick<RecipeViewModel, 'slotType'>[],
  dayCount: number
): { totalCount: number; breakfastCount: number; warn: boolean } {
  const totalCount = recipes.length;
  const breakfastCount = recipes.filter((recipe) => recipe.slotType === 'breakfast').length;
  return {
    totalCount,
    breakfastCount,
    warn: dayCount >= 7 && totalCount > 0 && (
      totalCount < dayCount || breakfastCount < dayCount
    ),
  };
}

export function formatAppliedConditionsSummary(
  settings: Pick<UserSettingsDraft, 'approach' | 'restrictions' | 'prepTimeMax' | 'mealsPerDay'>
): string {
  const approachLabel =
    settings.approach === 'carnivore'
      ? 'Карнивор'
      : settings.approach === 'explore'
      ? 'Ознакомление (пример)'
      : 'Кето';

  const parts: string[] = [
    `Режим: ${approachLabel}`,
    `до ${settings.prepTimeMax} мин`,
    `${settings.mealsPerDay} приёма пищи`,
  ];

  if (settings.restrictions.length > 0) {
    const labels = settings.restrictions.map((r) =>
      (RESTRICTION_LABELS[r] || r).toLowerCase()
    );
    parts.push(`исключено: ${labels.join(', ')}`);
  } else {
    parts.push('без дополнительных исключений');
  }

  return parts.join(' · ');
}
