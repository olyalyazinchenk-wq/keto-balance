import type { Recipe, UserProfile } from "./types";
import { isRecipeAllowed } from "./eligibility";

export interface GenerateMenuOptions {
  mode: "keto" | "carnivore" | string;
  numDays: number;
  meals: number;
  profile?: UserProfile | null;
  today?: Date;
  random?: () => number;
}

export interface DayMenu {
  date: string;
  slots: Record<string, string>;
}

export interface GeneratedMenu {
  mode: string;
  numDays: number;
  meals: number;
  portion: number;
  saved: boolean;
  created: number;
  days: DayMenu[];
}

export function getSlotKeys(meals: number): string[] {
  if (meals === 2) return ["breakfast", "dinner"];
  if (meals === 3) return ["breakfast", "lunch", "dinner"];
  if (meals === 4) return ["breakfast", "lunch", "dinner", "snack"];
  throw new Error(`Недопустимое количество приёмов пищи: ${meals}. Поддерживается: 2, 3, 4.`);
}

export function formatLocalDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function generateMenu(
  recipes: Recipe[],
  opts: GenerateMenuOptions
): GeneratedMenu {
  const { mode, numDays, meals, profile } = opts;
  const today = opts.today || new Date();
  const rand = opts.random || Math.random;

  if (mode !== "keto" && mode !== "carnivore") {
    throw new Error(`Недопустимый режим питания для формирования меню: ${mode}.`);
  }

  if (![1, 3, 7].includes(numDays)) {
    throw new Error(`Недопустимое количество дней: ${numDays}. Поддерживается: 1, 3, 7.`);
  }

  if (profile) {
    if (
      (profile.allergies !== undefined && profile.allergies !== null && !Array.isArray(profile.allergies)) ||
      (profile.disliked !== undefined && profile.disliked !== null && !Array.isArray(profile.disliked))
    ) {
      throw new Error("Повреждённые ограничения в профиле пользователя.");
    }
  }

  const slotKeys = getSlotKeys(meals);

  // 1. Отбираем рецепты нужного режима, удовлетворяющие всем ограничениям профиля
  const eligible = recipes.filter(r => r.mode === mode && isRecipeAllowed(r, profile));

  if (eligible.length < slotKeys.length) {
    throw new Error(
      `Недостаточно подходящих рецептов с учётом ограничений: найдено ${eligible.length}, требуется минимум ${slotKeys.length} на день.`
    );
  }

  const days: DayMenu[] = [];

  for (let dayIdx = 0; dayIdx < numDays; dayIdx++) {
    const dayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayIdx);
    const dateStr = formatLocalDateISO(dayDate);
    const usedTodayIds = new Set<string>();
    const slots: Record<string, string> = {};

    for (const slotKey of slotKeys) {
      // Доступные рецепты на сегодня (не повторять внутри одного дня)
      const available = eligible.filter(r => !usedTodayIds.has(r.id));
      if (available.length === 0) {
        throw new Error(`Не удалось подобрать уникальные блюда на день ${dateStr}.`);
      }

      // Ищем предпочтительную категорию
      let candidates = available.filter(r => {
        if (slotKey === "snack") return r.cat === "snack" || r.cat === "dessert" || r.cat === "prep";
        return r.cat === slotKey;
      });

      // Если в категории нет вариантов — берём из любого доступного eligible
      if (candidates.length === 0) {
        candidates = available;
      }

      // Детерминированный выбор по переданному random
      const idx = Math.floor(rand() * candidates.length);
      const chosen = candidates[Math.min(idx, candidates.length - 1)];
      
      slots[slotKey] = chosen.id;
      usedTodayIds.add(chosen.id);
    }

    days.push({ date: dateStr, slots });
  }

  return {
    mode,
    numDays,
    meals,
    portion: 1,
    saved: false,
    created: today ? today.getTime() : Date.now(),
    days,
  };
}

export function replacementCandidates(
  currentRecipeId: string,
  currentDayRecipeIds: string[],
  recipes: Recipe[],
  profile?: UserProfile | null,
  preferredCat?: string,
  targetMode?: "keto" | "carnivore" | string
): Recipe[] {
  const currentRecipe = recipes.find(r => r.id === currentRecipeId);
  const mode = targetMode || currentRecipe?.mode;
  return recipes.filter(r => {
    if (mode && r.mode !== mode) return false;
    if (r.id === currentRecipeId) return false;
    if (currentDayRecipeIds.includes(r.id)) return false;
    if (!isRecipeAllowed(r, profile)) return false;
    return true;
  }).sort((a, b) => {
    if (preferredCat) {
      const aPref = a.cat === preferredCat ? 1 : 0;
      const bPref = b.cat === preferredCat ? 1 : 0;
      if (aPref !== bPref) return bPref - aPref;
    }
    return a.title.localeCompare(b.title, "ru");
  });
}
