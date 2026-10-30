/**
 * Core types for keto-engine macronutrient and net carbs calculation.
 */

export type KnownPolyol =
  | 'erythritol'
  | 'allulose'
  | 'xylitol'
  | 'maltitol'
  | 'maltitol_syrup'
  | 'sorbitol'
  | 'isomalt'
  | 'lactitol'
  | 'mannitol'
  | 'glycerol';

export interface PolyolDetail {
  type: string;
  amount: number;
  /**
   * Optional absorption / glycemic impact coefficient between 0 and 1.
   * 0.0 = 100% non-digestible / 0 net carb impact (fully subtracted).
   * 1.0 = 100% digestible (no subtraction).
   */
  absorption?: number;
}

export type PolyolInput =
  | number
  | Record<string, number>
  | PolyolDetail[];

export interface NetCarbsInput {
  carbs: number;
  fiber?: number;
  polyols?: PolyolInput;
}

export interface NetCarbsOptions {
  customCoefficients?: Record<string, number>;
  defaultPolyolAbsorption?: number;
  clampNegative?: boolean;
  roundDecimals?: number;
}

export interface CaloriesInput {
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  polyols?: PolyolInput;
}

export interface CaloriesOptions {
  proteinFactor?: number;
  fatFactor?: number;
  carbsFactor?: number;
  fiberFactor?: number;
  useNetCarbs?: boolean;
  customPolyolCalories?: Record<string, number>;
  defaultPolyolCalorieFactor?: number;
  roundDecimals?: number;
}

export interface MacroRatiosInput {
  protein: number;
  fat: number;
  carbs: number;
  totalCalories?: number;
}

export interface MacroRatiosOptions {
  proteinFactor?: number;
  fatFactor?: number;
  carbsFactor?: number;
  roundDecimals?: number;
}

export interface MacroRatiosResult {
  proteinPct: number;
  fatPct: number;
  carbsPct: number;
  proteinCalories: number;
  fatCalories: number;
  carbsCalories: number;
  totalCalories: number;
}

export interface MacroValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  value?: unknown;
}

export interface MacroValidationResult {
  isValid: boolean;
  issues: MacroValidationIssue[];
}

export interface FullMacroProfileInput {
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  polyols?: PolyolInput;
  declaredCalories?: number;
}

export interface FullMacroProfileResult {
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  netCarbs: number;
  totalPolyols: number;
  effectivePolyolsDeduction: number;
  calculatedCalories: number;
  declaredCalories?: number;
  calorieDiscrepancy?: number;
  ratios: MacroRatiosResult;
  validation: MacroValidationResult;
}
