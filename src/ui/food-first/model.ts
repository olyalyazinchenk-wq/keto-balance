import type { Recipe } from '../../domain/types';

export interface FoodCard {
  id: string;
  title: string;
  minutes: number | null;
  servings: number | null;
  photo: string | null;
}

type Source = {
  id: string;
  title: string;
  time?: number;
  minutes?: number;
  serv?: number;
  sourceYield?: number;
};

export function photoForRecipe(recipeId: string): string | null {
  if (recipeId === 'kb-rec-eggs-avocado' || recipeId === 'k1') {
    return '/media/food-first/hero.webp';
  }
  return null;
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
  const mins = source.minutes ?? source.time;
  const servs = source.sourceYield ?? source.serv;
  return {
    id: source.id,
    title: source.title,
    minutes: Number.isFinite(mins) && (mins as number) > 0 ? (mins as number) : null,
    servings: Number.isFinite(servs) && (servs as number) > 0 ? (servs as number) : null,
    photo,
  };
}
