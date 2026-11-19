export const KETO_DAILY_CARB_LIMIT = 50;

// nc is already expressed as net carbohydrates per personal serving.
// Shopping batch multipliers do not change the amount eaten by one person.
export function dailyMenuCarbs(recipes: ReadonlyArray<{ nc: number }>): number {
  if (recipes.some(({ nc }) => !Number.isFinite(nc) || nc < 0)) return Infinity;
  return recipes.reduce((total, { nc }) => total + nc, 0);
}
