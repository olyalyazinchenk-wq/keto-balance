/** Wall-clock deadline: browser background throttling must not extend cooking time. */
export function timerDeadline(seconds: number, now: number = Date.now()): number | null {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(now)) return null;
  const deadline = now + seconds * 1000;
  return Number.isFinite(deadline) ? deadline : null;
}

export function remainingTimerSeconds(deadline: number | null, now: number = Date.now()): number {
  if (deadline === null || !Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
