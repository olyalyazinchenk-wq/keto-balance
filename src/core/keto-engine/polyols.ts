import type { PolyolInput, PolyolDetail } from './types';

/**
 * Sugar alcohol (polyol) glycemic / absorption / net carb impact coefficients.
 * Value represents the fraction (0.0 to 1.0) of polyol that is absorbed / impacts blood glucose / counts towards net carbs.
 *
 * 0.0 = completely non-digestible / 0 net carb impact (100% subtracted from total carbs, e.g. erythritol)
 * 1.0 = completely digestible / 100% net carb impact (0% subtracted from total carbs, e.g. glycerol)
 * 0.5 = 50% digestible (50% subtracted from total carbs, e.g. maltitol, xylitol)
 */
export const POLYOL_ABSORPTION_COEFFICIENTS: Readonly<Record<string, number>> = Object.freeze({
  erythritol: 0.0,
  'эритритол': 0.0,
  'эритрит': 0.0,

  allulose: 0.0,
  'аллюлоза': 0.0,

  mannitol: 0.0,
  'маннитол': 0.0,
  'маннит': 0.0,

  lactitol: 0.4,
  'лактитол': 0.4,

  xylitol: 0.5,
  'ксилитол': 0.5,
  'ксилит': 0.5,

  isomalt: 0.5,
  'изомальт': 0.5,

  maltitol: 0.5,
  'мальтитол': 0.5,
  'мальтит': 0.5,

  maltitol_syrup: 0.75,
  'мальтитный сироп': 0.75,
  'сироп мальтита': 0.75,

  sorbitol: 0.6,
  'сорбитол': 0.6,
  'сорбит': 0.6,

  glycerol: 1.0,
  glycerin: 1.0,
  'глицерин': 1.0,
});

/**
 * Standard caloric density per gram of sugar alcohols (kcal / g).
 */
export const POLYOL_CALORIC_FACTORS: Readonly<Record<string, number>> = Object.freeze({
  erythritol: 0.2,
  'эритритол': 0.2,
  'эритрит': 0.2,
  allulose: 0.4,
  'аллюлоза': 0.4,
  mannitol: 1.6,
  'маннитол': 1.6,
  'маннит': 1.6,
  lactitol: 2.0,
  'лактитол': 2.0,
  isomalt: 2.0,
  'изомальт': 2.0,
  xylitol: 2.4,
  'ксилитол': 2.4,
  'ксилит': 2.4,
  maltitol: 2.1,
  'мальтитол': 2.1,
  'мальтит': 2.1,
  maltitol_syrup: 3.0,
  'мальтитный сироп': 3.0,
  sorbitol: 2.6,
  'сорбитол': 2.6,
  'сорбит': 2.6,
  glycerol: 4.3,
  'глицерин': 4.3,
});

/**
 * Default polyol absorption coefficient when polyol type is unspecified or unknown.
 * Set to 0.5 (standard conservative estimate for general polyols blend).
 */
export const DEFAULT_UNKNOWN_POLYOL_ABSORPTION = 0.5;

/**
 * Default caloric factor for unknown polyols (kcal / g).
 */
export const DEFAULT_UNKNOWN_POLYOL_KCAL = 2.4;

/**
 * Normalizes polyol name for case-insensitive and whitespace-insensitive lookup.
 */
export function normalizePolyolName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

/**
 * Resolves the absorption / glycemic impact coefficient (0.0 to 1.0) for a given polyol.
 */
export function getPolyolAbsorptionCoefficient(
  name: string,
  customCoefficients?: Record<string, number>,
  fallback: number = DEFAULT_UNKNOWN_POLYOL_ABSORPTION
): number {
  const normalized = normalizePolyolName(name);

  if (customCoefficients) {
    for (const [key, val] of Object.entries(customCoefficients)) {
      if (normalizePolyolName(key) === normalized && typeof val === 'number' && !Number.isNaN(val)) {
        return Math.max(0, Math.min(1, val));
      }
    }
  }

  for (const [key, val] of Object.entries(POLYOL_ABSORPTION_COEFFICIENTS)) {
    if (normalizePolyolName(key) === normalized) {
      return val;
    }
  }

  return Math.max(0, Math.min(1, fallback));
}

export interface PolyolDeductionResult {
  totalPolyols: number;
  deduction: number;
  digestiblePolyols: number;
  calories: number;
}

/**
 * Calculates total polyols, non-digestible deduction, digestible remaining, and caloric impact.
 * Does not mutate input.
 */
export function calculatePolyolDeduction(
  polyols?: PolyolInput,
  options?: {
    customCoefficients?: Record<string, number>;
    defaultPolyolAbsorption?: number;
    customPolyolCalories?: Record<string, number>;
    defaultPolyolCalorieFactor?: number;
  }
): PolyolDeductionResult {
  if (polyols == null) {
    return { totalPolyols: 0, deduction: 0, digestiblePolyols: 0, calories: 0 };
  }

  const defaultAbsorption =
    typeof options?.defaultPolyolAbsorption === 'number' && !Number.isNaN(options.defaultPolyolAbsorption)
      ? Math.max(0, Math.min(1, options.defaultPolyolAbsorption))
      : DEFAULT_UNKNOWN_POLYOL_ABSORPTION;

  const defaultKcal =
    typeof options?.defaultPolyolCalorieFactor === 'number' && !Number.isNaN(options.defaultPolyolCalorieFactor)
      ? Math.max(0, options.defaultPolyolCalorieFactor)
      : DEFAULT_UNKNOWN_POLYOL_KCAL;

  // Case 1: Generic numeric polyols (no breakdown)
  if (typeof polyols === 'number') {
    if (Number.isNaN(polyols) || !Number.isFinite(polyols) || polyols <= 0) {
      return { totalPolyols: 0, deduction: 0, digestiblePolyols: 0, calories: 0 };
    }
    const deduction = polyols * (1 - defaultAbsorption);
    const digestible = polyols * defaultAbsorption;
    const calories = polyols * defaultKcal;
    return {
      totalPolyols: polyols,
      deduction,
      digestiblePolyols: digestible,
      calories,
    };
  }

  // Normalize object/array breakdown into PolyolDetail[]
  let details: PolyolDetail[] = [];
  if (Array.isArray(polyols)) {
    details = polyols.filter((item): item is PolyolDetail => item != null && typeof item === 'object');
  } else if (typeof polyols === 'object') {
    details = Object.entries(polyols).map(([type, amount]) => ({
      type,
      amount: typeof amount === 'number' ? amount : 0,
    }));
  }

  let totalPolyols = 0;
  let deduction = 0;
  let digestiblePolyols = 0;
  let calories = 0;

  for (const item of details) {
    const amount = Number(item.amount);
    if (Number.isNaN(amount) || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    totalPolyols += amount;

    const absorption =
      typeof item.absorption === 'number' && !Number.isNaN(item.absorption)
        ? Math.max(0, Math.min(1, item.absorption))
        : getPolyolAbsorptionCoefficient(item.type, options?.customCoefficients, defaultAbsorption);

    const nonDigestibleShare = 1 - absorption;
    deduction += amount * nonDigestibleShare;
    digestiblePolyols += amount * absorption;

    // Calorie calculation
    const normName = normalizePolyolName(item.type);
    let calFactor = defaultKcal;
    if (options?.customPolyolCalories && normName in options.customPolyolCalories) {
      calFactor = options.customPolyolCalories[normName];
    } else {
      for (const [k, v] of Object.entries(POLYOL_CALORIC_FACTORS)) {
        if (normalizePolyolName(k) === normName) {
          calFactor = v;
          break;
        }
      }
    }
    calories += amount * calFactor;
  }

  return {
    totalPolyols,
    deduction,
    digestiblePolyols,
    calories,
  };
}
