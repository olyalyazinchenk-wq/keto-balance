export type ProgressMetric = 'weight' | 'chest' | 'waist' | 'hips';
export interface ProgressEntry { date: string; weight: number | null; chest: number | null; waist: number | null; hips: number | null }
export interface ProgressSnapshot { age: number | null; entries: ProgressEntry[]; revision: number }
export interface ProgressWrite { age: number; entry: ProgressEntry; expected_revision: number; consent: true }
