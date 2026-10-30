import type { GeneratedMenu, RecipeViewModel, ShoppingFixtureItem } from './contract';

// Keep source quantities separate: no conversion or unsupported aggregation.
export function rebuildShoppingFromMenu(
  menu: GeneratedMenu,
  recipes: Record<string, RecipeViewModel>,
  previous: ShoppingFixtureItem[],
): ShoppingFixtureItem[] {
  const result: ShoppingFixtureItem[] = [];
  const seen = new Set<string>();
  for (const day of menu.days) {
    for (const [slot, recipeId] of Object.entries(day.slots)) {
      const recipe = recipes[recipeId];
      if (!recipe || !recipe.portionsVariants?.[1]?.ingredients) throw new Error('Recipe ingredients unavailable');
      for (const [index, ingredient] of recipe.portionsVariants[1].ingredients.entries()) {
        if (!ingredient.name.trim() || !ingredient.amountLabel.trim()) throw new Error('Ingredient incomplete');
        const id = `menu-${day.dayIndex}-${slot}-${recipeId}-${index}`;
        if (seen.has(id)) throw new Error('Duplicate menu slot');
        seen.add(id);
        const old = previous.find(item => item.id === id && item.name === ingredient.name && item.amountLabel === ingredient.amountLabel);
        result.push({
          id,
          name: ingredient.name,
          amountLabel: ingredient.amountLabel,
          department: ingredient.department,
          linkedRecipeTitles: [recipe.title],
          alreadyHave: old?.alreadyHave ?? false,
          checkedInStore: old?.checkedInStore ?? false
        });
      }
    }
  }
  return [...result, ...previous.filter(item => item.id.startsWith('shop-custom-'))];
}
