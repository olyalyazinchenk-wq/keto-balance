export interface RecipeIngredient {
  name: string;
  amount: string;
  dept?: string;
}

export interface Recipe {
  id: string;
  title: string;
  time: number;
  serv: number;
  cat?: 'breakfast' | 'lunch' | 'dinner' | string;
  tags?: string[];
  ing?: RecipeIngredient[];
  steps?: string[];
  yieldNote?: string;
}

export interface DayMenu {
  date: string;
  slots: Record<string, string>;
}

export interface GeneratedMenuDomain {
  id: string;
  created: number;
  days: DayMenu[];
}
