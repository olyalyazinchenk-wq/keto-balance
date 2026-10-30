import type {
  DayMenu,
  RecipeViewModel,
  ShoppingFixtureItem,
  UserSettingsDraft,
} from './contract';

export const RESTRICTION_LABELS: Record<string, string> = {
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

export function calculateShoppingProgress(items: ShoppingFixtureItem[]): {
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
  settings: Pick<UserSettingsDraft, 'approach' | 'restrictions' | 'prepTimeMax'>
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
