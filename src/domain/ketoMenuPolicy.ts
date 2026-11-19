import type { Recipe } from './types';

const excludedIngredient = /(?:^|[^\p{L}\p{N}])(?:молок(?:о|а|е|ом|у)|milk|мальтит[а-яё]*|maltitol|e[ -]?965|е[ -]?965)(?=$|[^\p{L}\p{N}])/iu;

export function meetsStandardKetoIngredients(recipe: Pick<Recipe, 'ing'>): boolean {
  return recipe.ing.every(([ingredient]) => !excludedIngredient.test(ingredient));
}
