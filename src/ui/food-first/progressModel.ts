import type { ProgressEntry, ProgressMetric } from '../../api/progressTypes';

export const PROGRESS_METRICS: { id: ProgressMetric; label: string; unit: string; min: number; max: number }[] = [
  { id: 'weight', label: 'Вес', unit: 'кг', min: 20, max: 400 },
  { id: 'chest', label: 'Грудь', unit: 'см', min: 20, max: 300 },
  { id: 'waist', label: 'Талия', unit: 'см', min: 20, max: 300 },
  { id: 'hips', label: 'Бёдра', unit: 'см', min: 20, max: 300 },
];
export function progressToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
export function progressDate(date: string): string { return date.split('-').reverse().join('.'); }
export function progressNumber(value: number): string { return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 }); }
export function progressDelta(entries: ProgressEntry[], metric: ProgressMetric): { first: number; latest: number; delta: number } | null {
  const measured = [...entries].sort((a, b) => a.date.localeCompare(b.date)).filter(e => e[metric] != null);
  if (measured.length < 2) return null;
  const first = measured[0][metric]!, latest = measured[measured.length - 1][metric]!;
  return { first, latest, delta: Math.round((latest - first) * 10) / 10 };
}
export function parseProgressEntry(date: string, fields: Record<ProgressMetric, string>): ProgressEntry {
  const timestamp = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(timestamp) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > progressToday() || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Выберите существующую дату не позднее сегодняшней.');
  const entry: ProgressEntry = { date, weight: null, chest: null, waist: null, hips: null };
  for (const { id, label, min, max } of PROGRESS_METRICS) {
    const text = fields[id].trim().replace(',', '.');
    if (!text) continue;
    const value = Number(text);
    if (!/^\d+(?:\.\d)?$/.test(text) || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}: укажите число от ${min} до ${max}, не более одного знака после запятой.`);
    entry[id] = value;
  }
  if (PROGRESS_METRICS.every(({ id }) => entry[id] == null)) throw new Error('Заполните хотя бы один замер.');
  return entry;
}
