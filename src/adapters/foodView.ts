import type { GeneratedMenu, Recipe } from '../domain/types';
import { getSlotKeys } from '../domain/menu';

export interface FoodRecipe {
  id: string;
  title: string;
  minutes: number;
  sourceYield: number;
  ingredients: { name: string; amount: string }[];
  steps: string[];
  nutritionStatus: '[УТОЧНИТЬ]';
}

export interface FoodDay {
  date: string;
  slots: { key: string; recipe: FoodRecipe }[];
}

export function toFoodRecipe(recipe: Recipe): FoodRecipe {
  return {
    id: recipe.id,
    title: recipe.title,
    minutes: recipe.time,
    sourceYield: recipe.serv,
    ingredients: recipe.ing.map(([name, amount]) => ({ name, amount })),
    steps: [...recipe.steps],
    nutritionStatus: '[УТОЧНИТЬ]',
  };
}

export function projectFoodDay(
  menu: GeneratedMenu,
  selectedDate: string,
  recipes: readonly Recipe[]
): FoodDay {
  const day = menu.days.find((item) => item.date === selectedDate);
  if (!day) throw new Error('Выбранный день отсутствует в текущем меню.');
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const slots = getSlotKeys(menu.meals).map((key) => {
    const id = day.slots[key];
    const recipe = byId.get(id);
    if (!recipe) throw new Error(`Не найден рецепт для слота ${key}.`);
    return { key, recipe: toFoodRecipe(recipe) };
  });
  return { date: day.date, slots };
}
