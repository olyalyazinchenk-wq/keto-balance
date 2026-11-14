import type {
  NetCarbsInput,
  NetCarbsOptions,
  CaloriesInput,
  CaloriesOptions,
  MacroRatiosInput,
  MacroRatiosOptions,
  MacroRatiosResult,
  FullMacroProfileInput,
  FullMacroProfileResult,
  MacroValidationResult,
  MacroValidationIssue,
} from './types';
import { calculatePolyolDeduction } from './polyols';

export const DEFAULT_PROTEIN_KCAL = 4;
export const DEFAULT_FAT_KCAL = 9;
export const DEFAULT_CARBS_KCAL = 4;
export const DEFAULT_FIBER_KCAL = 0;

/**
 * Safely sanitizes numeric input: converts null/undefined to 0, handles NaN and negative numbers.
 */
function sanitizeNumber(value: unknown, fallback: number = 0, allowNegative: boolean = false): number {
  if (value == null) return fallback;
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) return fallback;
  if (!allowNegative && num < 0) return 0;
  return num;
}

/**
 * Helper to round to a given number of decimal places.
 */
function roundTo(value: number, decimals?: number): number {
  if (decimals == null) return value;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Calculates net carbohydrates (чистые углеводы) by subtracting dietary fiber
 * and sugar alcohols (polyols) adjusted for their absorption / glycemic impact coefficient.
 *
 * Formula:
 *   Net Carbs = Total Carbs - Fiber - Sum(Polyol_i * (1 - Absorption_i))
 *
 * Deterministic, pure function — does not mutate input.
 */
export function calculateNetCarbs(input: NetCarbsInput, options?: NetCarbsOptions): number {
  if (!input || typeof input !== 'object') {
    return 0;
  }

  const clampNegative = options?.clampNegative !== false;
  const totalCarbs = sanitizeNumber(input.carbs, 0, !clampNegative);
  const fiber = sanitizeNumber(input.fiber, 0, false);

  const polyolResult = calculatePolyolDeduction(input.polyols, {
    customCoefficients: options?.customCoefficients,
    defaultPolyolAbsorption: options?.defaultPolyolAbsorption,
  });

  let netCarbs = totalCarbs - fiber - polyolResult.deduction;

  if (clampNegative && netCarbs < 0) {
    netCarbs = 0;
  }

  return roundTo(netCarbs, options?.roundDecimals ?? 1);
}

/**
 * Calculates total energy / calories (калорийность) in kcal from macronutrients.
 * Defaults to Atwater factors (4 kcal/g protein, 9 kcal/g fat, 4 kcal/g carbs).
 *
 * Deterministic, pure function — does not mutate input.
 */
export function calculateCalories(input: CaloriesInput, options?: CaloriesOptions): number {
  if (!input || typeof input !== 'object') {
    return 0;
  }

  const pFactor = options?.proteinFactor ?? DEFAULT_PROTEIN_KCAL;
  const fFactor = options?.fatFactor ?? DEFAULT_FAT_KCAL;
  const cFactor = options?.carbsFactor ?? DEFAULT_CARBS_KCAL;
  const fiberFactor = options?.fiberFactor ?? DEFAULT_FIBER_KCAL;

  const protein = sanitizeNumber(input.protein, 0, false);
  const fat = sanitizeNumber(input.fat, 0, false);
  const carbs = sanitizeNumber(input.carbs, 0, false);
  const fiber = sanitizeNumber(input.fiber, 0, false);

  let totalKcal = 0;

  if (options?.useNetCarbs) {
    const netCarbs = calculateNetCarbs({
      carbs,
      fiber,
      polyols: input.polyols,
    });
    const polyolResult = calculatePolyolDeduction(input.polyols, {
      customPolyolCalories: options?.customPolyolCalories,
      defaultPolyolCalorieFactor: options?.defaultPolyolCalorieFactor,
    });

    totalKcal = protein * pFactor + fat * fFactor + netCarbs * cFactor + fiber * fiberFactor + polyolResult.calories;
  } else {
    totalKcal = protein * pFactor + fat * fFactor + carbs * cFactor + fiber * fiberFactor;
  }

  return roundTo(totalKcal, options?.roundDecimals ?? 0);
}

/**
 * Calculates macronutrient percentage shares in total calories (процентные доли Б/Ж/У в калораже).
 * Handles zero calorie edge cases deterministically without division-by-zero or NaN.
 *
 * Deterministic, pure function — does not mutate input.
 */
export function calculateMacroRatios(input: MacroRatiosInput, options?: MacroRatiosOptions): MacroRatiosResult {
  if (!input || typeof input !== 'object') {
    return {
      proteinPct: 0,
      fatPct: 0,
      carbsPct: 0,
      proteinCalories: 0,
      fatCalories: 0,
      carbsCalories: 0,
      totalCalories: 0,
    };
  }

  const pFactor = options?.proteinFactor ?? DEFAULT_PROTEIN_KCAL;
  const fFactor = options?.fatFactor ?? DEFAULT_FAT_KCAL;
  const cFactor = options?.carbsFactor ?? DEFAULT_CARBS_KCAL;
  const decimals = options?.roundDecimals ?? 1;

  const protein = sanitizeNumber(input.protein, 0, false);
  const fat = sanitizeNumber(input.fat, 0, false);
  const carbs = sanitizeNumber(input.carbs, 0, false);

  const proteinCalories = protein * pFactor;
  const fatCalories = fat * fFactor;
  const carbsCalories = carbs * cFactor;
  const sumMacroCalories = proteinCalories + fatCalories + carbsCalories;

  const totalCalories =
    typeof input.totalCalories === 'number' && Number.isFinite(input.totalCalories) && input.totalCalories > 0
      ? input.totalCalories
      : sumMacroCalories;

  // Edge case: zero or negative calories
  if (totalCalories <= 0) {
    return {
      proteinPct: 0,
      fatPct: 0,
      carbsPct: 0,
      proteinCalories: 0,
      fatCalories: 0,
      carbsCalories: 0,
      totalCalories: 0,
    };
  }

  const proteinPct = roundTo((proteinCalories / totalCalories) * 100, decimals);
  const fatPct = roundTo((fatCalories / totalCalories) * 100, decimals);
  const carbsPct = roundTo((carbsCalories / totalCalories) * 100, decimals);

  return {
    proteinPct,
    fatPct,
    carbsPct,
    proteinCalories: roundTo(proteinCalories, 1),
    fatCalories: roundTo(fatCalories, 1),
    carbsCalories: roundTo(carbsCalories, 1),
    totalCalories: roundTo(totalCalories, 1),
  };
}

/**
 * Validates macronutrient ranges, boundary conditions, and consistency.
 * Checks for negative numbers, invalid ranges (fiber > carbs), and large discrepancies.
 */
export function validateMacros(input: FullMacroProfileInput): MacroValidationResult {
  const issues: MacroValidationIssue[] = [];

  if (!input || typeof input !== 'object') {
    return {
      isValid: false,
      issues: [{ field: 'root', message: 'Input must be a valid object', severity: 'error', value: input }],
    };
  }

  const fields: Array<'protein' | 'fat' | 'carbs' | 'fiber'> = ['protein', 'fat', 'carbs', 'fiber'];
  for (const f of fields) {
    const val = input[f];
    if (val != null) {
      const num = Number(val);
      if (Number.isNaN(num) || !Number.isFinite(num)) {
        issues.push({
          field: f,
          message: `Field '${f}' must be a finite number`,
          severity: 'error',
          value: val,
        });
      } else if (num < 0) {
        issues.push({
          field: f,
          message: `Field '${f}' cannot be negative`,
          severity: 'error',
          value: val,
        });
      }
    }
  }

  const carbs = sanitizeNumber(input.carbs, 0, true);
  const fiber = sanitizeNumber(input.fiber, 0, true);

  if (fiber > carbs && carbs >= 0) {
    issues.push({
      field: 'fiber',
      message: `Dietary fiber (${fiber}g) exceeds total carbohydrates (${carbs}g)`,
      severity: 'warning',
      value: { fiber, carbs },
    });
  }

  if (input.polyols != null) {
    const polyolRes = calculatePolyolDeduction(input.polyols);
    if (polyolRes.totalPolyols > carbs && carbs >= 0) {
      issues.push({
        field: 'polyols',
        message: `Polyols (${polyolRes.totalPolyols}g) exceed total carbohydrates (${carbs}g)`,
        severity: 'warning',
        value: { polyols: polyolRes.totalPolyols, carbs },
      });
    }
  }

  if (typeof input.declaredCalories === 'number') {
    if (input.declaredCalories < 0) {
      issues.push({
        field: 'declaredCalories',
        message: 'Declared calories cannot be negative',
        severity: 'error',
        value: input.declaredCalories,
      });
    } else {
      const calcKcal = calculateCalories(input);
      const diff = Math.abs(calcKcal - input.declaredCalories);
      // If difference is greater than 20% and at least 30 kcal
      const threshold = Math.max(30, input.declaredCalories * 0.2);
      if (diff > threshold) {
        issues.push({
          field: 'declaredCalories',
          message: `Declared calories (${input.declaredCalories}) deviate from calculated calories (${calcKcal}) by ${diff.toFixed(0)} kcal`,
          severity: 'warning',
          value: { declared: input.declaredCalories, calculated: calcKcal, diff },
        });
      }
    }
  }

  const isValid = issues.every((i) => i.severity !== 'error');
  return { isValid, issues };
}

/**
 * Computes complete macro profile including net carbs, calories, ratios, and validation.
 * Pure function — does not mutate input.
 */
export function calculateMacroProfile(
  input: FullMacroProfileInput,
  options?: {
    netCarbsOptions?: NetCarbsOptions;
    caloriesOptions?: CaloriesOptions;
    ratiosOptions?: MacroRatiosOptions;
  }
): FullMacroProfileResult {
  const protein = sanitizeNumber(input.protein, 0, false);
  const fat = sanitizeNumber(input.fat, 0, false);
  const carbs = sanitizeNumber(input.carbs, 0, false);
  const fiber = sanitizeNumber(input.fiber, 0, false);

  const polyolResult = calculatePolyolDeduction(input.polyols, {
    customCoefficients: options?.netCarbsOptions?.customCoefficients,
    defaultPolyolAbsorption: options?.netCarbsOptions?.defaultPolyolAbsorption,
    customPolyolCalories: options?.caloriesOptions?.customPolyolCalories,
    defaultPolyolCalorieFactor: options?.caloriesOptions?.defaultPolyolCalorieFactor,
  });

  const netCarbs = calculateNetCarbs({
    carbs,
    fiber,
    polyols: input.polyols,
  }, options?.netCarbsOptions);

  const calculatedCalories = calculateCalories({
    protein,
    fat,
    carbs,
    fiber,
    polyols: input.polyols,
  }, options?.caloriesOptions);

  const declaredCalories = typeof input.declaredCalories === 'number' ? input.declaredCalories : undefined;
  const calorieDiscrepancy =
    declaredCalories !== undefined ? roundTo(Math.abs(calculatedCalories - declaredCalories), 1) : undefined;

  const ratios = calculateMacroRatios({
    protein,
    fat,
    carbs: netCarbs, // In keto macro ratios, carb share is based on net carbs
    totalCalories: calculatedCalories,
  }, options?.ratiosOptions);

  const validation = validateMacros(input);

  return {
    protein,
    fat,
    carbs,
    fiber,
    netCarbs,
    totalPolyols: polyolResult.totalPolyols,
    effectivePolyolsDeduction: polyolResult.deduction,
    calculatedCalories,
    declaredCalories,
    calorieDiscrepancy,
    ratios,
    validation,
  };
}
