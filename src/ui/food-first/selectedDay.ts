export function resolveSelectedDay(
  saved: unknown,
  days: ReadonlyArray<{ dayIndex: number }>
): number | null {
  if (days.length === 0) return null;
  if (
    typeof saved === 'number' &&
    Number.isInteger(saved) &&
    days.some((day) => day.dayIndex === saved)
  ) {
    return saved;
  }
  return days[0].dayIndex;
}
