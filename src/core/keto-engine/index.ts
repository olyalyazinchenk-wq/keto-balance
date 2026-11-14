/**
 * keto-engine: deterministic nutritional calculation engine for Keto-Balance.
 *
 * Exports calculation and validation functions for:
 * - Net Carbs (чистые углеводы) with sugar alcohol (polyol) absorption coefficients
 * - Total Calories (общая калорийность) based on standard or net-carb Atwater factors
 * - Macronutrient Caloric Shares (процентные доли Б/Ж/У в калораже) with zero-division protection
 * - Range validation and boundary handling
 */

export * from './types';
export * from './polyols';
export * from './calculations';
