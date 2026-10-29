import type {
  DayMenu,
  RecipeViewModel,
  RestrictionTag,
  ScreenId,
  ShoppingFixtureItem,
  UserSettingsDraft,
} from '../types/ketoBalanceContract';

export const RESTRICTION_LABELS: Record<RestrictionTag, string> = {
  no_dairy: 'Без молочных продуктов',
  no_eggs: 'Без яиц',
  no_fish: 'Без рыбы и морепродуктов',
  no_nuts: 'Без орехов и семечек',
  no_pork: 'Без свинины',
};

/**
 * Pure helper: pushes a screen onto the local navigation history stack without duplicate consecutive entries.
 */
export function pushNavigationStack(
  stack: ScreenId[],
  nextScreen: ScreenId
): ScreenId[] {
  if (stack[stack.length - 1] === nextScreen) {
    return stack;
  }
  return [...stack, nextScreen];
}

/**
 * Pure helper: pops the current screen from the navigation stack and returns the previous screen,
 * preserving at least one root screen so Back never empties the stack.
 */
export function popNavigationStack(stack: ScreenId[]): {
  nextStack: ScreenId[];
  targetScreen: ScreenId;
} {
  if (stack.length <= 1) {
    const fallback = stack[0] || 'today';
    return { nextStack: [fallback], targetScreen: fallback };
  }
  const nextStack = stack.slice(0, -1);
  const targetScreen = nextStack[nextStack.length - 1];
  return { nextStack, targetScreen };
}

/**
 * Pure helper: filters available recipes strictly according to the user's selected approach,
 * restrictions, and prep time limit.
 * Never silently removes an allergy/restriction filter when 0 recipes match.
 */
export function filterRecipesBySettings(
  recipes: RecipeViewModel[],
  settings: Pick<
    UserSettingsDraft,
    'approach' | 'restrictions' | 'prepTimeMax'
  >
): RecipeViewModel[] {
  return recipes.filter((recipe) => {
    if (
      settings.approach === 'carnivore' &&
      !recipe.suitableFor.includes('carnivore')
    ) {
      return false;
    }
    if (recipe.prepMinutes > settings.prepTimeMax) {
      return false;
    }
    for (const r of settings.restrictions) {
      if (!recipe.avoids.includes(r)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Pure helper: builds a human-readable summary of applied filter conditions.
 */
export function formatAppliedConditionsSummary(
  settings: Pick<
    UserSettingsDraft,
    'approach' | 'restrictions' | 'prepTimeMax' | 'mealsPerDay'
  >
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
      RESTRICTION_LABELS[r].toLowerCase()
    );
    parts.push(`исключено: ${labels.join(', ')}`);
  } else {
    parts.push('без дополнительных исключений');
  }

  return parts.join(' · ');
}

/**
 * Pure helper: resolves a DayMenu's slot IDs (`Record<string, string>`) into RecipeViewModel items
 * for the requested number of meals per day (2 or 3).
 */
export function resolveDayMenuSlots(
  dayMenu: DayMenu,
  recipesById: Record<string, RecipeViewModel>,
  mealsPerDay: 2 | 3
): { slotKey: string; slotLabel: string; recipe: RecipeViewModel | null }[] {
  const slotOrder: { key: string; label: string }[] =
    mealsPerDay === 2
      ? [
          { key: 'breakfast', label: 'Первый приём (завтрак / бранч)' },
          { key: 'dinner', label: 'Второй приём (ужин)' },
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

/**
 * Pure helper: formats the shopping checklist for clipboard copy ONLY (no network side-effects).
 */
export function formatShoppingListForClipboard(
  items: ShoppingFixtureItem[],
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
    lines.push(``, `Все продукты из списка уже отмечены как купленные или имеющиеся дома.`);
  }

  if (alreadyHave.length > 0) {
    lines.push(``, `Уже есть дома / куплено (${alreadyHave.length}):`);
    for (const item of alreadyHave) {
      lines.push(`✓ ${item.name} — ${item.amountLabel}`);
    }
  }

  return lines.join('\n');
}
