/**
 * src/ui/pilot/gate.ts
 * Pure logic for Start Gate access evaluation and status formatting.
 */

export type PilotApproach = 'keto' | 'carnivore';

/**
 * Returns true if and only if both age confirmation (18+) and personal data processing consent are granted.
 */
export function isGateGranted(
  confirmed18Plus: boolean,
  consentedToPd: boolean
): boolean {
  return confirmed18Plus === true && consentedToPd === true;
}

/**
 * Returns user-facing status label indicating completed conditions.
 * Examples:
 * - 'Требуется подтверждение · 0 из 2'
 * - 'Требуется подтверждение · 1 из 2'
 * - 'Доступ открыт · 2 из 2 условий выполнены'
 */
export function gateStatusLabel(
  confirmed18Plus: boolean,
  consentedToPd: boolean
): string {
  const completed = (confirmed18Plus ? 1 : 0) + (consentedToPd ? 1 : 0);
  if (completed === 2) {
    return 'Доступ открыт · 2 из 2 условий выполнены';
  }
  return `Требуется подтверждение · ${completed} из 2`;
}
