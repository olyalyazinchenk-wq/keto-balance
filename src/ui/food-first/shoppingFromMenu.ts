import type { PortionIngredientFixture, RecipeViewModel, ShoppingFixtureItem } from './contract';
import type { PilotShoppingItemV1 } from '../../api/pilotTypes';

interface ParsedAmount {
  value: number;
  baseUnit: string;
  unitType: 'weight' | 'volume' | 'count' | 'tbsp' | 'can' | 'steak' | 'leg' | 'custom' | 'text';
  isText: boolean;
  textLabel?: string;
}

function normalizeUnit(rawUnit: string): { baseUnit: string; unitType: ParsedAmount['unitType']; scale: number } {
  const u = rawUnit.toLowerCase().replace(/\.$/, '').trim();
  if (u === 'г' || u === 'гр') return { baseUnit: 'г', unitType: 'weight', scale: 1 };
  if (u === 'кг') return { baseUnit: 'г', unitType: 'weight', scale: 1000 };
  if (u === 'мл') return { baseUnit: 'мл', unitType: 'volume', scale: 1 };
  if (u === 'л') return { baseUnit: 'мл', unitType: 'volume', scale: 1000 };
  if (u === 'шт' || u === 'штук' || u === 'штуки') return { baseUnit: 'шт.', unitType: 'count', scale: 1 };
  if (u.includes('ст') && u.includes('л')) return { baseUnit: 'ст. л.', unitType: 'tbsp', scale: 1 };
  if (u.startsWith('банк')) return { baseUnit: 'банка', unitType: 'can', scale: 1 };
  if (u.startsWith('стейк')) return { baseUnit: 'стейка', unitType: 'steak', scale: 1 };
  if (u.startsWith('нож')) return { baseUnit: 'ножки', unitType: 'leg', scale: 1 };
  return { baseUnit: u || 'ед', unitType: u ? 'custom' : 'text', scale: 1 };
}

export function parseAmount(raw: string): ParsedAmount {
  const s = raw.trim();
  const frac = s.match(/^(\d+)\/(\d+)\s*(.*)$/);
  if (frac) {
    const val = parseInt(frac[1], 10) / parseInt(frac[2], 10);
    const u = normalizeUnit(frac[3]);
    return { value: val * u.scale, baseUnit: u.baseUnit, unitType: u.unitType, isText: false };
  }
  const dec = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (dec) {
    const val = parseFloat(dec[1].replace(',', '.'));
    const u = normalizeUnit(dec[2]);
    return { value: val * u.scale, baseUnit: u.baseUnit, unitType: u.unitType, isText: false };
  }
  return { value: 0, baseUnit: s, unitType: 'text', isText: true, textLabel: s };
}

export function formatAmount(
  total: number,
  baseUnit: string,
  unitType: ParsedAmount['unitType'],
  textLabel?: string,
): string {
  if (unitType === 'text') {
    return textLabel || 'по вкусу';
  }
  const rounded = Math.round(total * 10) / 10;
  if (unitType === 'weight') {
    if (rounded >= 1000 && rounded % 1000 === 0) return `${rounded / 1000} кг`;
    return `${rounded} г`;
  }
  if (unitType === 'volume') {
    if (rounded >= 1000 && rounded % 1000 === 0) return `${rounded / 1000} л`;
    return `${rounded} мл`;
  }
  if (unitType === 'count') {
    const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.0', '');
    return `${formatted} шт.`;
  }
  return `${rounded} ${baseUnit}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

interface AggregatedGroup {
  id: string;
  name: string;
  department: PortionIngredientFixture['department'];
  unitType: ParsedAmount['unitType'];
  baseUnit: string;
  totalValue: number;
  textLabel?: string;
  linkedRecipeTitles: string[];
}

export interface RebuildShoppingOptions {
  portionsMultiplier?: number;
  targetPortions?: number;
}

/**
 * Rebuild shopping list from menu with smart aggregation:
 * - Aggregates duplicate ingredients across meals and days
 * - Scales quantities by ratio: target_portions / base_portions
 * - Preserves checkedInStore and alreadyHave states across rebuilds and scaling
 * - Retains custom added items
 */
export function rebuildShoppingFromMenu(
  menu: { days: Array<{ slots: Record<string, string> }> },
  recipes: Record<string, RecipeViewModel>,
  previous: (ShoppingFixtureItem | PilotShoppingItemV1)[],
  optionsOrPortions: number | RebuildShoppingOptions = 1,
): PilotShoppingItemV1[] {
  const targetPortions =
    typeof optionsOrPortions === 'number'
      ? optionsOrPortions
      : (optionsOrPortions?.targetPortions ?? optionsOrPortions?.portionsMultiplier ?? 1);

  const groups = new Map<string, AggregatedGroup>();

  for (const day of menu.days) {
    for (const [slot, recipeId] of Object.entries(day.slots)) {
      const recipe = recipes[recipeId];
      if (!recipe) {
        throw new Error('Recipe ingredients unavailable');
      }

      // Check for precalculated target variant (from recipesAdapter) or base variant
      const targetVariant = recipe.portionsVariants?.[targetPortions];
      const baseVariant = recipe.portionsVariants?.[1];
      const ingredients = targetVariant?.ingredients || baseVariant?.ingredients;
      if (!ingredients) {
        throw new Error('Recipe ingredients unavailable');
      }

      // If target variant already computed for targetPortions, itemFactor is 1.
      // Otherwise scale from base variant (already normalized to 1 portion): itemFactor = targetPortions.
      let itemFactor = 1;
      if (!targetVariant) {
        itemFactor = targetPortions;
      }

      for (const ingredient of ingredients) {
        if (!ingredient.name.trim() || !ingredient.amountLabel.trim()) {
          throw new Error('Ingredient incomplete');
        }
        const parsed = parseAmount(ingredient.amountLabel);
        const normName = ingredient.name.trim();
        const groupKey = `${normName.toLowerCase()}:${parsed.unitType}:${parsed.baseUnit}`;

        if (!groups.has(groupKey)) {
          const id = `shop-agg-${slugify(normName)}${parsed.unitType !== 'text' ? `-${parsed.unitType}-${slugify(parsed.baseUnit)}` : ''}`;
          groups.set(groupKey, {
            id,
            name: normName,
            department: ingredient.department,
            unitType: parsed.unitType,
            baseUnit: parsed.baseUnit,
            totalValue: 0,
            textLabel: parsed.textLabel,
            linkedRecipeTitles: [],
          });
        }

        const g = groups.get(groupKey)!;
        g.totalValue += parsed.value * itemFactor;
        if (!g.linkedRecipeTitles.includes(recipe.title)) {
          g.linkedRecipeTitles.push(recipe.title);
        }
        if (parsed.textLabel && !g.textLabel) {
          g.textLabel = parsed.textLabel;
        }
      }
    }
  }

  const result: PilotShoppingItemV1[] = [];

  for (const group of groups.values()) {
    const amountLabel = formatAmount(group.totalValue, group.baseUnit, group.unitType, group.textLabel);

    // Match previous item by id or canonical name
    const prevItem = previous.find(
      (item) => item.id === group.id || item.name.toLowerCase().trim() === group.name.toLowerCase()
    );

    // Checkmarks are ONLY preserved if amount has not changed!
    const isAmountSame = prevItem && prevItem.amountLabel === amountLabel;
    const alreadyHave = isAmountSame ? Boolean(prevItem.alreadyHave) : false;
    const checkedInStore = isAmountSame ? Boolean(prevItem.checkedInStore) : false;

    result.push({
      id: group.id,
      name: group.name,
      amountLabel,
      department: group.department,
      linkedRecipeTitles: group.linkedRecipeTitles,
      alreadyHave,
      checkedInStore,
    });
  }

  const customItems: PilotShoppingItemV1[] = previous
    .filter((item) => item.id.startsWith('shop-custom-'))
    .map((item) => ({
      id: item.id,
      name: item.name,
      amountLabel: item.amountLabel,
      department: item.department,
      linkedRecipeTitles: item.linkedRecipeTitles || [],
      alreadyHave: Boolean(item.alreadyHave),
      checkedInStore: Boolean(item.checkedInStore),
    }));
  return [...result, ...customItems];
}
