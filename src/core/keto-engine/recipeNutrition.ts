import { calculateMacroProfile } from './calculations';
import type { FullMacroProfileResult } from './types';

export interface NutritionSource {
  title: string;
  url: string;
  recordId: string;
  accessedAt: string;
}

/** Values refer to 100 g edible product in the stated condition, never to an unspecified piece. */
export interface IngredientNutritionBasis {
  index: number;
  name: string;
  amount: string;
  edibleGrams: number;
  foodState: string;
  source: NutritionSource;
  per100g: {
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
    carbohydrateBasis: 'total_including_fiber' | 'available_excluding_fiber';
  };
}

export interface RecipeNutritionEvidence {
  schemaVersion: 1;
  status: 'candidate' | 'reviewed';
  method: 'keto-engine-default-v1';
  recipeId: string;
  basePortions: number;
  revision: string;
  reviewedBy?: string;
  reviewedAt?: string;
  ingredients: IngredientNutritionBasis[];
}

export type ReviewedRecipeNutrition =
  | { status: 'unverified'; issues: string[]; profile?: undefined }
  | { status: 'reviewed'; issues: []; portions: number; revision: string; sources: NutritionSource[]; profile: FullMacroProfileResult };

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Admission is fail-closed. Existing engine formulas are used unchanged after checking complete evidence. */
export function calculateReviewedRecipeNutrition(
  recipe: { id: string; serv: number; ing: [string, string][]; nutrition?: RecipeNutritionEvidence },
  portions: number,
): ReviewedRecipeNutrition {
  const evidence = recipe.nutrition;
  const issues: string[] = [];
  if (!evidence || evidence.status !== 'reviewed') return { status: 'unverified', issues: ['Расчёт ещё не прошёл редакторскую проверку.'] };
  if (!Array.isArray(evidence.ingredients) || evidence.ingredients.some(i => !i || typeof i !== 'object')) return { status: 'unverified', issues: ['Повреждено основание расчёта.'] };
  if (evidence.schemaVersion !== 1 || evidence.method !== 'keto-engine-default-v1') issues.push('Неизвестная версия расчёта.');
  if (evidence.recipeId !== recipe.id || evidence.basePortions !== recipe.serv || !positive(recipe.serv) || !positive(portions)) issues.push('Изменился рецепт или исходный выход.');
  if (!nonempty(evidence.revision) || !nonempty(evidence.reviewedBy) || !/^\d{4}-\d{2}-\d{2}/.test(evidence.reviewedAt || '')) issues.push('Не зафиксирован редакторский допуск.');
  if (!Array.isArray(evidence.ingredients) || evidence.ingredients.length !== recipe.ing.length) issues.push('Не весь состав подтверждён.');
  const seen = new Set<number>();
  for (const ingredient of evidence.ingredients || []) {
    const raw = recipe.ing[ingredient.index];
    if (!Number.isInteger(ingredient.index) || seen.has(ingredient.index) || !raw || raw[0] !== ingredient.name || raw[1] !== ingredient.amount) issues.push('Основание не совпадает с составом рецепта.');
    seen.add(ingredient.index);
    if (!positive(ingredient.edibleGrams) || !nonempty(ingredient.foodState)) issues.push('Уточните съедобную массу и состояние продукта.');
    const source = ingredient.source;
    if (!source || !nonempty(source.title) || !/^https:\/\//.test(source.url || '') || !nonempty(source.recordId) || !/^\d{4}-\d{2}-\d{2}/.test(source.accessedAt || '')) issues.push('Нет проверяемой записи источника.');
    const values = ingredient.per100g;
    if (!values || ![values.protein, values.fat, values.carbs, values.fiber].every(v => nonnegative(v) && v <= 100)) {
      issues.push('Пищевая ценность продукта не подтверждена полностью.');
    } else if (!['total_including_fiber', 'available_excluding_fiber'].includes(values.carbohydrateBasis) ||
      (values.carbohydrateBasis === 'total_including_fiber' && values.fiber > values.carbs)) issues.push('Не согласован учёт клетчатки.');
  }
  if (issues.length) return { status: 'unverified', issues: [...new Set(issues)] };
  const totals = evidence.ingredients.reduce((sum, ingredient) => {
    const factor = ingredient.edibleGrams / 100;
    const v = ingredient.per100g;
    sum.protein += v.protein * factor;
    sum.fat += v.fat * factor;
    sum.carbs += (v.carbohydrateBasis === 'available_excluding_fiber' ? v.carbs + v.fiber : v.carbs) * factor;
    sum.fiber += v.fiber * factor;
    return sum;
  }, { protein: 0, fat: 0, carbs: 0, fiber: 0 });
  if (!Object.values(totals).every(Number.isFinite) || !Object.values(totals).every(v => Number.isFinite(v * portions / recipe.serv))) return { status: 'unverified', issues: ['Проверьте масштаб и единицы исходных количеств.'] };
  const profile = calculateMacroProfile({ protein: totals.protein * portions / recipe.serv, fat: totals.fat * portions / recipe.serv, carbs: totals.carbs * portions / recipe.serv, fiber: totals.fiber * portions / recipe.serv });
  if (!profile.validation.isValid || ![profile.calculatedCalories, profile.netCarbs].every(Number.isFinite)) return { status: 'unverified', issues: ['Расчёт не прошёл проверку значений.'] };
  return { status: 'reviewed', issues: [], portions, revision: evidence.revision, sources: evidence.ingredients.map(i => i.source), profile };
}
