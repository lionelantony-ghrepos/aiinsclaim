/** Elapsed SLA ratio for sweep thresholds (not capped at 100%). */
export function slaSweepElapsedRatio(
  startedAt: Date | null,
  dueAt: Date | null,
  now = new Date(),
): number {
  if (!startedAt || !dueAt) {
    return 0;
  }
  const total = dueAt.getTime() - startedAt.getTime();
  if (total <= 0) {
    return 1;
  }
  const elapsed = now.getTime() - startedAt.getTime();
  return Math.max(0, elapsed / total);
}
