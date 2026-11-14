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
 * Pure helper: extracts a timer duration in minutes from a Russian recipe step string
 * (e.g. "накрой крышкой на 3–4 минуты" -> 4, "запекай 25 минут" -> 25).
 * Returns null if no duration in minutes is mentioned.
 */
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

/**
 * Pure helper: computes shopping list completion statistics for the store progress bar.
 */
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
  let completed = 0;
  for (const item of items) {
    if (item.checkedInStore) inStore += 1;
    if (item.alreadyHave) alreadyHome += 1;
    if (item.checkedInStore || item.alreadyHave) completed += 1;
  }
  const remaining = Math.max(0, total - completed);
  const percent = Math.round((completed / total) * 100);
  return { total, inStore, alreadyHome, completed, remaining, percent };
}

/**
 * Pure helper: creates a custom user-added shopping item.
 */
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

export type TransformationGoalId = 'waist' | 'dress' | 'energy';

export interface SilhouetteForecast {
  stageIndex: 0 | 1 | 2 | 3;
  daysLabel: string;
  stageBadge: string;
  waistDeltaCm: string;
  waistScale: number;
  hipScale: number;
  energyPercent: number;
  headline: string;
  feelingSummary: string;
  milestones: string[];
}

/**
 * Pure helper: computes visual body transformation and waistline forecast for the interactive silhouette studio.
 */
export function calculateSilhouetteForecast(
  stageIndex: 0 | 1 | 2 | 3,
  goalId: TransformationGoalId = 'waist'
): SilhouetteForecast {
  const goalHeadlineSuffix =
    goalId === 'dress'
      ? 'любимое платье садится свободно'
      : goalId === 'energy'
      ? 'ровная бодрость с утра до вечера'
      : 'уходит объём в талии и внизу живота';

  const stages: Record<0 | 1 | 2 | 3, SilhouetteForecast> = {
    0: {
      stageIndex: 0,
      daysLabel: 'День 1',
      stageBadge: 'Точка старта',
      waistDeltaCm: 'Старт',
      waistScale: 1.0,
      hipScale: 1.0,
      energyPercent: 48,
      headline: `Мягкий вход без голода: ${goalHeadlineSuffix}`,
      feelingSummary:
        'Убираем скрытый сахар и частые перекусы — организм переключается на сжигание запасов.',
      milestones: [
        'Сытные тарелки из обычных продуктов без взвешивания каждого грамма',
        'Спокойный вечер без острой тяги к конфетам и выпечке',
        'Понятный план: завтрак, обед и ужин уже собраны за тебя',
      ],
    },
    1: {
      stageIndex: 1,
      daysLabel: '7 дней',
      stageBadge: 'Уходят отёки',
      waistDeltaCm: '−2,5 см',
      waistScale: 0.86,
      hipScale: 0.95,
      energyPercent: 74,
      headline: `Первая неделя: уходит лишняя вода и утренняя отёчность`,
      feelingSummary:
        'За счёт снижения инсулина ткани отдают задержанную жидкость — живот становится заметно мягче и площе.',
      milestones: [
        'Лицо по утрам свежее, кольца и пояс сидят свободнее',
        'Уходит тяжесть и вздутие после обеда и ужина',
        'Стабильная сытость по 4–5 часов между приёмами пищи',
      ],
    },
    2: {
      stageIndex: 2,
      daysLabel: '14 дней',
      stageBadge: 'Плоский живот',
      waistDeltaCm: '−4,5 см',
      waistScale: 0.74,
      hipScale: 0.9,
      energyPercent: 88,
      headline: `Две недели: чёткая линия талии и лёгкость в теле`,
      feelingSummary:
        'Тело уверенно использует жиры как чистое топливо — уходит объём с боков и нижней части живота.',
      milestones: [
        'Заметный визуальный силуэт в зеркале без втягивания живота',
        'Ясная голова и бодрость после обеда без сонливости',
        'Привычка вкусно готовить ужин за 15–20 минут',
      ],
    },
    3: {
      stageIndex: 3,
      daysLabel: '30 дней',
      stageBadge: 'Минус 1–2 размера',
      waistDeltaCm: '−7,5 см',
      waistScale: 0.62,
      hipScale: 0.84,
      energyPercent: 96,
      headline: `Месяц в «Кето Баланс»: стройный силуэт, ${goalHeadlineSuffix}`,
      feelingSummary:
        'Устойчивый результат без срывов: одежда сидит свободно, кожа чище, а питание стало приятным ритуалом.',
      milestones: [
        'Минус 1–2 размера в талии и бёдрах с сохранением тонуса',
        'Полная свобода от подсчёта калорий и чувства вины за еду',
        'Свой проверенный набор любимых быстрых блюд на каждый день',
      ],
    },
  };

  return stages[stageIndex] || stages[2];
}

/**
 * Pure helper: calculates dopamine reward points, level percentage, and unlocked badge from daily micro-wins.
 */
export function calculateDopamineMomentum(
  completedHabitIds: string[],
  cookedMealsCount: number
): {
  points: number;
  percent: number;
  streakDays: number;
  badgeTitle: string;
  nextRewardText: string;
} {
  const habitPoints = completedHabitIds.length * 60;
  const mealPoints = cookedMealsCount * 80;
  const basePoints = 120;
  const points = basePoints + habitPoints + mealPoints;
  const maxPoints = 120 + 4 * 60 + 3 * 80; // 600
  const percent = Math.min(100, Math.round((points / maxPoints) * 100));
  const streakDays = 3 + (completedHabitIds.length >= 2 || cookedMealsCount >= 1 ? 1 : 0);

  let badgeTitle = 'Старт лёгкости';
  let nextRewardText = 'Отметь ещё 1 привычку или блюдо, чтобы ускорить метаболический импульс';

  if (percent >= 85) {
    badgeTitle = 'Сияющий силуэт · Максимум дня';
    nextRewardText = 'Все ключевые шаги стройности на сегодня выполнены!';
  } else if (percent >= 55) {
    badgeTitle = 'Активное жиросжигание 🔥';
    nextRewardText = 'Отличный темп! До золотого статуса дня остался 1 шаг';
  } else if (percent >= 35) {
    badgeTitle = 'Утро без отёков ✨';
    nextRewardText = 'Так держать! Каждая отметка приближает к тонкой талии';
  }

  return {
    points,
    percent,
    streakDays,
    badgeTitle,
    nextRewardText,
  };
}

