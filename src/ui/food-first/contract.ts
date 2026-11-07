/**
 * UI contract types for Food-First screens.
 */

export type ScreenId =
  | 'today'
  | 'menu'
  | 'recipe'
  | 'shopping'
  | 'settings'
  | 'start'
  | 'diary'
  | 'support'
  | 'more'
  | 'access';

export type DietApproach = 'keto' | 'carnivore' | 'explore';
export type VisualDirection = 'A' | 'B' | 'C';

export interface PortionIngredientFixture {
  name: string;
  amountLabel: string;
  department: 'Мясо, птица и рыба' | 'Яйца и молочное' | 'Овощи и зелень' | 'Масла и бакалея';
}

export interface PortionVariantFixture {
  portions: number;
  yieldNote: string;
  ingredients: PortionIngredientFixture[];
  nutritionStatus: '[УТОЧНИТЬ]';
}

export interface RecipeViewModel {
  id: string;
  title: string;
  subtitle: string;
  slotType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  slotLabel: string;
  prepMinutes: number;
  suitableFor: ('keto' | 'carnivore')[];
  avoids: string[];
  artworkKey?: string;
  artworkCaption?: string;
  basePortions?: number;
  portionsVariants: Record<number, PortionVariantFixture>;
  steps: string[];
  substitutions: string[];
  storageRule: string;
  sourceStatus: string;
  editorial_status?: 'approved' | 'review' | 'candidate' | string;
}

export interface DayMenu {
  dayIndex: number;
  date?: string;
  label: string;
  slots: Record<string, string>;
}

export interface GeneratedMenu {
  id?: string;
  created: number;
  title: string;
  month?: string;
  numDays?: number;
  mode?: string;
  days: DayMenu[];
}

export interface ShoppingFixtureItem {
  id: string;
  name: string;
  amountLabel: string;
  department: 'Мясо, птица и рыба' | 'Яйца и молочное' | 'Овощи и зелень' | 'Масла и бакалея';
  linkedRecipeTitles?: string[];
  alreadyHave?: boolean;
  checkedInStore?: boolean;
}

export interface UserSettingsDraft {
  confirmed18Plus: boolean;
  approach: DietApproach;
  restrictions: string[];
  prepTimeMax: number;
  mealsPerDay: number;
  preferenceNote: string;
  remindersOptIn: boolean;
  currentStep: number;
  isSaved: boolean;
}
