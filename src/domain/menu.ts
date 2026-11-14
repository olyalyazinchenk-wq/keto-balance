import type { Recipe, UserProfile } from "./types";
import { isRecipeAllowed } from "./eligibility";

export interface GenerateMenuOptions {
  mode: "keto" | "carnivore" | string;
  numDays: number;
  meals: number;
  profile?: UserProfile | null;
  catalogId?: string;
  today?: Date;
  startDate?: Date;
  month?: string;
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
  catalog_id?: string;
  month?: string;
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

export function resolveSelectedDate(
  menu: { days: { date: string }[] },
  preferredDate?: string | null,
  now: Date = new Date()
): string | null {
  if (!menu.days || menu.days.length === 0) return null;
  const availableDates = new Set(menu.days.map((d) => d.date));
  if (preferredDate && availableDates.has(preferredDate)) {
    return preferredDate;
  }
  const todayStr = formatLocalDateISO(now);
  if (availableDates.has(todayStr)) {
    return todayStr;
  }
  return menu.days[0].date;
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

  if (!Number.isInteger(numDays) || ![1, 3, 7, 28, 29, 30, 31].includes(numDays)) {
    throw new Error(`Недопустимое количество дней: ${numDays}. Поддерживается: 1, 3, 7 или календарный месяц (28–31 день).`);
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

  let startYear: number;
  let startMonthIdx: number;
  let startDayNum: number;
  let targetDays = numDays;

  if (opts.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(opts.month)) {
    const [yStr, mStr] = opts.month.split('-');
    startYear = parseInt(yStr, 10);
    startMonthIdx = parseInt(mStr, 10) - 1;
    startDayNum = 1;
    const daysInMonth = new Date(startYear, startMonthIdx + 1, 0).getDate();
    targetDays = daysInMonth;
  } else if (opts.startDate) {
    startYear = opts.startDate.getFullYear();
    startMonthIdx = opts.startDate.getMonth();
    startDayNum = opts.startDate.getDate();
    targetDays = numDays;
  } else if (numDays >= 28) {
    const ref = opts.today || new Date();
    startYear = ref.getFullYear();
    startMonthIdx = ref.getMonth();
    startDayNum = 1;
    targetDays = numDays;
  } else {
    const ref = opts.today || new Date();
    startYear = ref.getFullYear();
    startMonthIdx = ref.getMonth();
    startDayNum = ref.getDate();
    targetDays = numDays;
  }

  const days: DayMenu[] = [];
  const recentDaysHistory: string[] = [];

  for (let dayIdx = 0; dayIdx < targetDays; dayIdx++) {
    const dayDate = new Date(startYear, startMonthIdx, startDayNum + dayIdx);
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

      // Приоритет блюдам, которые не использовались в последние 1-2 дня
      const recentSet = new Set(recentDaysHistory.slice(-Math.min(recentDaysHistory.length, meals * 2)));
      const freshCandidates = candidates.filter(r => !recentSet.has(r.id));
      const finalCandidates = freshCandidates.length > 0 ? freshCandidates : candidates;

      // Детерминированный выбор по переданному random
      const idx = Math.floor(rand() * finalCandidates.length);
      const chosen = finalCandidates[Math.min(idx, finalCandidates.length - 1)];
      
      slots[slotKey] = chosen.id;
      usedTodayIds.add(chosen.id);
      recentDaysHistory.push(chosen.id);
    }

    days.push({ date: dateStr, slots });
  }

  const computedMonth = `${startYear}-${String(startMonthIdx + 1).padStart(2, "0")}`;
  return {
    mode,
    numDays: targetDays,
    meals,
    portion: 1,
    saved: false,
    created: today ? today.getTime() : Date.now(),
    catalog_id: opts.catalogId || "released-catalog-202611-v1",
    month: computedMonth,
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
