import type { GeneratedMenu, Recipe } from '../domain/types';

export type PilotRestrictionToken =
  | 'exclude_eggs'
  | 'exclude_dairy'
  | 'exclude_fish'
  | 'exclude_nuts'
  | 'exclude_offal'
  | 'exclude_mushrooms'
  | 'exclude_pork'
  | 'no_eggs'
  | 'no_dairy'
  | 'no_fish'
  | 'no_nuts'
  | 'no_offal'
  | 'no_mushrooms'
  | 'no_pork';

export interface PilotPreferencesV1 {
  confirmed18Plus: boolean;
  approach: 'keto' | 'carnivore' | 'explore';
  restrictions: PilotRestrictionToken[];
  prepTimeMax: number;
  mealsPerDay: 2 | 3 | 4;
  planDays?: 1 | 3 | 7 | 28 | 29 | 30 | 31;
  preferenceNote: '' | 'simple_daily';
}

export interface PilotProfileV1 {
  settings: PilotPreferencesV1 | null;
  // Legacy fields accepted for existing authorized API tests, not collected by new UI.
  weight?: number | null;
  height?: number | null;
  age?: number | null;
  gender?: 'male' | 'female' | 'other' | null;
  goal?: string | null;
  contraindications?: string[];
}

export interface PilotStateV1 {
  schema_version: 1;
  menu: GeneratedMenu | null;
  selected_date: string | null;
  checked_ingredients: Record<string, boolean>;
  checked_steps: Record<string, boolean>;
  shopping_batches: 1 | 2 | 4;
  shopping_stale: boolean;
}

export interface PilotShoppingItemV1 {
  id: string;
  name: string;
  amountLabel: string;
  department: string;
  linkedRecipeTitles: string[];
  alreadyHave: boolean;
  checkedInStore: boolean;
}

export interface PilotUserReadV1 {
  schema_version: 1;
  user_id: number;
  revision: number;
  profile: PilotProfileV1 | null;
  state: PilotStateV1 | null;
}

export interface PilotUserWriteV1 {
  schema_version: 1;
  expected_revision: number;
  profile: PilotProfileV1 | null;
  state: PilotStateV1 | null;
}

export interface PilotShoppingReadV1 {
  schema_version: 1;
  user_id: number;
  revision: number;
  items: PilotShoppingItemV1[];
}

export interface PilotShoppingWriteV1 {
  schema_version: 1;
  expected_revision: number;
  items: PilotShoppingItemV1[];
}

export interface PilotSaveResultV1 {
  status: 'ok';
  user_id: number;
  revision: number;
}

export interface PilotCatalogV1 {
  schema_version: 1;
  catalog_id: string;
  test_only: boolean;
  released_ids: string[];
  recipes: Recipe[];
  nutrition_status: 'unverified';
}
