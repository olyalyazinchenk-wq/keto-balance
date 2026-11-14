import { RECIPES } from '../../data/recipes';
import type { Recipe } from '../../domain/types';
import { calculateReviewedRecipeNutrition } from '../../core/keto-engine/recipeNutrition';
import type { PortionIngredientFixture, RecipeViewModel, GeneratedMenu } from './contract';

function inferDepartment(name: string): PortionIngredientFixture['department'] {
  const n = name.toLowerCase();
  if (
    n.includes('мясо') || n.includes('фарш') || n.includes('бекон') ||
    n.includes('свинина') || n.includes('говядина') || n.includes('стейк') ||
    n.includes('кури') || n.includes('индей') || n.includes('птиц') || n.includes('филе') || n.includes('утка') ||
    n.includes('рыба') || n.includes('лосос') || n.includes('тунец') ||
    n.includes('горбуш') || n.includes('скумбри') || n.includes('сёмг') ||
    n.includes('треск') || n.includes('минтай') || n.includes('судак') ||
    n.includes('креветк') || n.includes('сердеч') || n.includes('печен')
  ) {
    return 'Мясо, птица и рыба';
  }
  if (
    !n.includes('кокос') && !n.includes('миндаль') && !n.includes('растительн') && (
      n.includes('яйц') || n.includes('сыр') || n.includes('сливк') ||
      n.includes('сметан') || n.includes('творог') || n.includes('моцарелл') ||
      n.includes('молок')
    )
  ) {
    return 'Яйца и молочное';
  }
  if (
    n.includes('капуст') || n.includes('броккол') || n.includes('кабачок') ||
    n.includes('огур') || n.includes('помидор') || n.includes('шампиньон') ||
    n.includes('гриб') || n.includes('авокадо') || n.includes('перец') ||
    n.includes('лук') || n.includes('шпинат') || n.includes('зелень') ||
    n.includes('чеснок') || n.includes('лимон') || n.includes('лайм') ||
    n.includes('укроп') || n.includes('петрушк') || n.includes('руккол') ||
    n.includes('салат') || n.includes('малин') || n.includes('ягод')
  ) {
    return 'Овощи и зелень';
  }
  return 'Масла и бакалея';
}

export function scaleAmount(amount: string, factor: number): string {
  const trimmed = amount.trim();
  if (factor === 1) return trimmed;

  const frac = trimmed.match(/^(\d+)\/(\d+)\s*(.*)$/);
  if (frac) {
    const val = (parseInt(frac[1], 10) / parseInt(frac[2], 10)) * factor;
    const rounded = Math.round(val * 100) / 100;
    const strVal = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return `${strVal} ${frac[3]}`.trim();
  }

  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return amount;

  const rawNum = parseFloat(match[1].replace(',', '.'));
  const val = rawNum * factor;
  const rounded = Math.round(val * 100) / 100;
  const strVal = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${strVal} ${match[2]}`.trim();
}

function formatPortionsLabel(count: number): string {
  if (!count || count <= 0 || !Number.isFinite(count)) return '[УТОЧНИТЬ]';
  if (count % 10 === 1 && count % 100 !== 11) return `${count} порция`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return `${count} порции`;
  return `${count} порций`;
}

export function toRecipeViewModel(recipe: Recipe): RecipeViewModel {
  const slotType = (
    recipe.cat === 'breakfast' || recipe.cat === 'lunch' ||
    recipe.cat === 'dinner' || recipe.cat === 'snack'
  ) ? recipe.cat : 'dinner';

  const slotLabel =
    recipe.cat === 'breakfast' ? 'Завтрак' :
    recipe.cat === 'lunch' ? 'Обед' :
    recipe.cat === 'snack' ? 'Перекус' : 'Ужин';

  const subtitle = recipe.mode === 'carnivore' ? 'Блюдо для карнивор-рациона' :
    recipe.cat === 'breakfast' ? 'Сытный и быстрый кето-завтрак' :
    recipe.cat === 'lunch' ? 'Питательный обед для кето-рациона' :
    'Сбалансированный кето-ужин';

  const rawServ = recipe.serv;
  const baseServ = typeof rawServ === 'number' && rawServ > 0 && Number.isFinite(rawServ) ? rawServ : 0;

  const buildPortionVariant = (targetPortions: 1 | 2 | 4) => {
    if (baseServ <= 0) {
      return {
        portions: 0,
        yieldNote: '[УТОЧНИТЬ]',
        nutritionStatus: '[УТОЧНИТЬ]' as const,
        ingredients: recipe.ing.map(([name, amount]) => ({
          name,
          amountLabel: amount,
          department: inferDepartment(name),
        })),
      };
    }
    const factor = targetPortions / baseServ;
    return {
      portions: targetPortions,
      yieldNote: formatPortionsLabel(targetPortions),
      nutritionStatus: '[УТОЧНИТЬ]' as const,
      nutrition: calculateReviewedRecipeNutrition(recipe, targetPortions),
      ingredients: recipe.ing.map(([name, amount]) => ({
        name,
        amountLabel: scaleAmount(amount, factor),
        department: inferDepartment(name),
      })),
    };
  };

  return {
    id: recipe.id,
    title: recipe.title,
    subtitle,
    slotType,
    slotLabel,
    prepMinutes: recipe.time,
    suitableFor: [recipe.mode],
    avoids: recipe.tags || [],
    artworkKey: recipe.id === 'k1' ? 'eggs_avocado' : undefined,
    artworkCaption: recipe.title,
    basePortions: baseServ > 0 ? baseServ : undefined,
    portionsVariants: {
      1: buildPortionVariant(1),
      2: buildPortionVariant(2),
      4: buildPortionVariant(4),
    },
    steps: recipe.steps,
    substitutions: Object.entries(recipe.subs || {}).map(([k, v]) => `${k} → ${v}`),
    storageRule: recipe.store || 'Хранить в холодильнике',
    sourceStatus: (recipe as any).editorial_status ?? (recipe as any).sourceStatus ?? (recipe.mode === 'carnivore' ? 'review' : 'approved'),
    editorial_status: (recipe as any).editorial_status ?? (recipe as any).sourceStatus ?? (recipe.mode === 'carnivore' ? 'review' : 'approved'),
  };
}

export const UI_RECIPES: RecipeViewModel[] = RECIPES.map(toRecipeViewModel);

export const UI_RECIPES_BY_ID: Record<string, RecipeViewModel> = Object.fromEntries(
  UI_RECIPES.map((r) => [r.id, r])
);

export const DEFAULT_FOOD_MENU: GeneratedMenu = {
  id: 'menu-default',
  created: 1730300000000,
  title: 'Кето-рацион · Простые домашние блюда',
  days: [
    {
      dayIndex: 0,
      label: 'День 1',
      date: '2026-10-30',
      slots: { breakfast: 'k1', lunch: 'k7', dinner: 'k12' },
    },
    {
      dayIndex: 1,
      label: 'День 2',
      date: '2026-10-31',
      slots: { breakfast: 'k2', lunch: 'k9', dinner: 'k13' },
    },
    {
      dayIndex: 2,
      label: 'День 3',
      date: '2026-11-01',
      slots: { breakfast: 'k4', lunch: 'k10', dinner: 'k14' },
    },
  ],
};
