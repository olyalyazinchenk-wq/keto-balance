/**
 * Доменные контракты и точки интеграции UI-пакета «Кето Баланс».
 * Сохраняет совместимость с базовыми типами основного проекта:
 * - Recipe.id: string
 * - DayMenu.slots: Record<string, string> (идентификаторы рецептов, не вложенные объекты)
 * - GeneratedMenu.created: number (Unix timestamp)
 */

export type ScreenId =
  | 'start'
  | 'settings'
  | 'today'
  | 'menu'
  | 'recipe'
  | 'shopping'
  | 'diary'
  | 'support'
  | 'more'
  | 'access';

export type DietApproach = 'keto' | 'carnivore' | 'explore';

export type RestrictionTag =
  | 'no_dairy'
  | 'no_eggs'
  | 'no_fish'
  | 'no_nuts'
  | 'no_pork';

export type PrepTimeLimit = 20 | 35 | 60;

export type VisualDirection = 'A' | 'B' | 'C';

export type SupportTransportState =
  | 'idle'
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'unknown';

/**
 * Базовый доменный контракт рецепта основного проекта (идентификатор — строка).
 */
export interface DomainRecipeRef {
  id: string;
  title: string;
}

/**
 * Доменный контракт дня меню: slots хранит Record<string, string> (slotKey -> Recipe.id).
 */
export interface DayMenu {
  dayIndex: number;
  label: string;
  slots: Record<string, string>;
}

/**
 * Доменный контракт сгенерированного меню (created — число).
 */
export interface GeneratedMenu {
  id: string;
  created: number;
  title: string;
  days: DayMenu[];
}

export interface PortionIngredientFixture {
  name: string;
  amountLabel: string;
  department: 'Мясо, птица и рыба' | 'Яйца и молочное' | 'Овощи и зелень' | 'Масла и бакалея';
}

export interface PortionVariantFixture {
  portions: 1 | 2;
  yieldNote: string;
  ingredients: PortionIngredientFixture[];
  nutritionStatus: '[УТОЧНИТЬ]';
}

/**
 * View Model рецепта для демонстрационного прототипа.
 * Не кодирует неизвестные БЖУ нулями — использует явный статус '[УТОЧНИТЬ]'.
 */
export interface RecipeViewModel extends DomainRecipeRef {
  subtitle: string;
  slotType: 'breakfast' | 'lunch' | 'dinner';
  slotLabel: 'Завтрак' | 'Обед' | 'Ужин';
  prepMinutes: number;
  suitableFor: ('keto' | 'carnivore')[];
  avoids: RestrictionTag[];
  artworkKey:
    | 'eggs_avocado'
    | 'baked_fish_herbs'
    | 'beef_patties_butter'
    | 'chicken_thighs_greens'
    | 'cottage_scramble'
    | 'pork_roast_cabbage'
    | 'carnivore_steak_eggs'
    | 'turkey_zucchini_skillet';
  artworkCaption: string;
  portionsVariants: {
    1: PortionVariantFixture;
    2: PortionVariantFixture;
  };
  steps: string[];
  substitutions: string[];
  storageRule: string;
  sourceStatus: 'Из базового демонстрационного набора (проверено для UI-прототипа)';
}

export interface ShoppingFixtureItem {
  id: string;
  name: string;
  amountLabel: string;
  department: 'Мясо, птица и рыба' | 'Яйца и молочное' | 'Овощи и зелень' | 'Масла и бакалея';
  alreadyHave: boolean;
  checkedInStore: boolean;
  linkedRecipeTitles: string[];
}

export interface ManualDiaryEntry {
  id: string;
  dateISO: string;
  mealLabel: 'Завтрак' | 'Обед' | 'Ужин' | 'Перекус / Другое';
  timeLabel: string;
  foodText: string;
  wellbeingNote: string;
}

export interface UserSettingsDraft {
  confirmed18Plus: boolean;
  approach: DietApproach;
  restrictions: RestrictionTag[];
  prepTimeMax: PrepTimeLimit;
  mealsPerDay: 2 | 3;
  preferenceNote: 'simple_daily' | 'cook_for_two_days';
  remindersOptIn: boolean;
  currentStep: 1 | 2 | 3;
  isSaved: boolean;
}

/**
 * Явные точки интеграции (integration seams) для подключения к основному проекту.
 * В дизайн-прототипе выполняются локально без скрытых сетевых вызовов.
 */
export interface KetoBalanceIntegrationCallbacks {
  onChooseMenu?: (menu: GeneratedMenu) => void;
  onReplaceRecipe?: (
    dayIndex: number,
    slotKey: string,
    nextRecipeId: string
  ) => void;
  onUpdateShopping?: (items: ShoppingFixtureItem[]) => void;
  onSaveDiaryEntry?: (entry: ManualDiaryEntry) => void;
  onOpenSupport?: (context: {
    fromScreen: ScreenId;
    draftSaved: boolean;
    topic?: string;
  }) => void;
  onRequestAccess?: (
    tier: 'free' | 'starter' | 'subscription' | 'personal_support'
  ) => void;
}
