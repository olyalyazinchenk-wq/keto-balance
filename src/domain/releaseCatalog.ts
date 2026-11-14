import type { Recipe } from './types';

export function selectReleasedRecipes(
  recipes: readonly Recipe[],
  releasedIds: readonly string[]
): Recipe[] {
  if (
    !Array.isArray(releasedIds) || releasedIds.length === 0 ||
    releasedIds.some((id) => typeof id !== 'string' || id.length === 0) ||
    new Set(releasedIds).size !== releasedIds.length
  ) {
    throw new Error('Набор допущенных рецептов не утверждён или повреждён.');
  }
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  if (byId.size !== recipes.length) {
    throw new Error('В исходном каталоге повторяются идентификаторы.');
  }
  return releasedIds.map((id) => {
    const recipe = byId.get(id);
    if (!recipe) throw new Error(`Допущенный рецепт ${id} отсутствует в каталоге.`);
    return recipe;
  });
}
