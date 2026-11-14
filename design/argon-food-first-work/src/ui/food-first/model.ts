import type { Recipe } from '../../domain/types';

export interface FoodCard {
  id: string;
  title: string;
  minutes: number | null;
  servings: number | null;
  photo: string | null;
}

type Source = Pick<Recipe, 'id' | 'title' | 'time' | 'serv'>;

export function photoForRecipe(recipeId: string): string | null {
  return recipeId === 'kb-rec-eggs-avocado' ? '/media/food-first/hero.webp' : null;
}

export function toFoodCard(source: Source, photo: string | null = null): FoodCard {
  if (typeof source.id !== 'string' || !source.id.length) {
    throw new Error('Recipe ID must be an existing non-empty string');
  }
  if (typeof source.title !== 'string' || !source.title.trim()) {
    throw new Error('Recipe title is required');
  }
  if (photo !== null &&
      (!photo.startsWith('/media/food-first/') || photo.includes('..') || photo.includes('?'))) {
    throw new Error('Use an explicit, reviewed local food image');
  }
  return {
    id: source.id,
    title: source.title,
    minutes: Number.isFinite(source.time) && source.time > 0 ? source.time : null,
    servings: Number.isFinite(source.serv) && source.serv > 0 ? source.serv : null,
    photo,
  };
}
