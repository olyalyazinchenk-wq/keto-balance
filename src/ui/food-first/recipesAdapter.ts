import { RECIPES } from '../../data/recipes';
import type { Recipe } from '../../domain/types';
import type { PortionIngredientFixture, RecipeViewModel, GeneratedMenu } from './contract';

function inferDepartment(name: string): PortionIngredientFixture['department'] {
  const n = name.toLowerCase();
  if (
    n.includes('мясо') || n.includes('фарш') || n.includes('бекон') ||
    n.includes('свинина') || n.includes('говядина') || n.includes('стейк') ||
    n.includes('куриц') || n.includes('индейк') || n.includes('утка') ||
    n.includes('рыба') || n.includes('лосос') || n.includes('тунец') ||
    n.includes('горбуш') || n.includes('скумбри') || n.includes('сёмг') ||
    n.includes('креветк') || n.includes('сердеч') || n.includes('печен')
  ) {
    return 'Мясо, птица и рыба';
  }
  if (
    n.includes('яйц') || n.includes('сыр') || n.includes('сливк') ||
    n.includes('сметан') || n.includes('творог') || n.includes('моцарелл') ||
    n.includes('молок')
  ) {
    return 'Яйца и молочное';
  }
  if (
    n.includes('капуст') || n.includes('броккол') || n.includes('кабачок') ||
    n.includes('огур') || n.includes('помидор') || n.includes('шампиньон') ||
    n.includes('гриб') || n.includes('авокадо') || n.includes('перец') ||
    n.includes('лук') || n.includes('шпинат') || n.includes('зелень') ||
    n.includes('укроп') || n.includes('петрушк')
  ) {
    return 'Овощи и зелень';
  }
  return 'Масла и бакалея';
}

function scaleAmount(amount: string, factor: number): string {
  const match = amount.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return amount;
  const num = parseFloat(match[1].replace(',', '.')) * factor;
  return `${num} ${match[2]}`.trim();
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

  const subtitle =
    recipe.cat === 'breakfast' ? 'Сытный и быстрый кето-завтрак' :
    recipe.cat === 'lunch' ? 'Питательный обед для кето-рациона' :
    'Сбалансированный кето-ужин';

  const rawServ = recipe.serv;
  const baseServ = typeof rawServ === 'number' && rawServ > 0 && Number.isFinite(rawServ) ? rawServ : 0;

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
    portionsVariants: {
      1: {
        portions: baseServ,
        yieldNote: baseServ > 0 ? formatPortionsLabel(baseServ) : '[УТОЧНИТЬ]',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: recipe.ing.map(([name, amount]) => ({
          name,
          amountLabel: amount,
          department: inferDepartment(name),
        })),
      },
      2: {
        portions: baseServ > 0 ? baseServ * 2 : 0,
        yieldNote: baseServ > 0 ? formatPortionsLabel(baseServ * 2) : '[УТОЧНИТЬ]',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: recipe.ing.map(([name, amount]) => ({
          name,
          amountLabel: scaleAmount(amount, 2),
          department: inferDepartment(name),
        })),
      },
    },
    steps: recipe.steps,
    substitutions: Object.entries(recipe.subs || {}).map(([k, v]) => `${k} → ${v}`),
    storageRule: recipe.store || 'Хранить в холодильнике',
    sourceStatus: 'КБЖУ уточняется автором',
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
