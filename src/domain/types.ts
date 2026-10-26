export type Mode = "keto" | "carnivore" | "explore";

export interface Recipe {
  id: string;
  title: string;
  mode: "keto" | "carnivore";
  cat: string;
  emoji: string;
  g: [string, string];
  time: number;
  serv: number;
  diff: string;
  kcal: number;
  p: number;
  f: number;
  nc: number;
  cost: number;
  make: boolean;
  freeze: boolean;
  fam: boolean;
  batch: boolean;
  tags: string[];
  ing: [string, string][];
  steps: string[];
  subs: Record<string, string>;
  store: string;
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

export interface UserProfile {
  name?: string;
  age?: string | number;
  sex?: string;
  height?: string | number;
  weight?: string | number;
  goal?: string;
  activity?: string;
  meals?: number;
  disliked?: string[];
  allergies?: string[];
  allergyNote?: string;
  budget?: string;
  cookTime?: number;
  prep?: any;
  mode?: Mode | string;
  exp?: string;
  meds?: any;
  diseases?: any;
  [key: string]: any;
}
