/**
 * src/domain/safety.ts — Консервативный медицинский стоп-протокол (P09).
 * Реализует fail-safe перехват экстренных симптомов и состояние safetyHold.
 */

export interface SafetyHoldState {
  active: boolean;
  reason: string;
  timestamp: number;
}

export const EMERGENCY_KEYWORDS: string[] = [
  "боль в груди",
  "давит в груди",
  "жжение в груди",
  "сердце болит",
  "задыхаюсь",
  "удушье",
  "удушья",
  "трудно дышать",
  "не могу дышать",
  "нехватка воздуха",
  "нехватку воздуха",
  "потеря сознания",
  "потери сознания",
  "падаю в обморок",
  "обморок",
  "потемнело в глазах",
];

export const NEGATION_KEYWORDS: string[] = [
  "нет боли в груди",
  "не болит грудь",
  "не задыхаюсь",
  "нет удушья",
  "без потери сознания",
];

export function detectEmergency(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase().trim();
  for (const neg of NEGATION_KEYWORDS) {
    if (lower.includes(neg)) return false;
  }
  for (const kw of EMERGENCY_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

export function createDefaultSafetyHold(): SafetyHoldState {
  return {
    active: false,
    reason: "",
    timestamp: 0,
  };
}

export function activateSafetyHold(reason: string = "emergency_symptoms"): SafetyHoldState {
  return {
    active: true,
    reason,
    timestamp: Date.now(),
  };
}

export function clearSafetyHold(): SafetyHoldState {
  return createDefaultSafetyHold();
}
