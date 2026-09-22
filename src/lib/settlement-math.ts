/**
 * Pure settlement total: sum(item amounts) − deductible, cents-safe.
 * Callers supply amounts; no business thresholds live here.
 */

function toCents(amount: string | number): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round((n + Number.EPSILON) * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function computeSettlementTotal(
  items: ReadonlyArray<{ amount: string | number }>,
  deductibleApplied: string | number,
): string {
  const itemsCents = items.reduce((sum, item) => sum + toCents(item.amount), 0);
  const deductibleCents = toCents(deductibleApplied);
  return fromCents(Math.max(0, itemsCents - deductibleCents));
}

export function moneyToNumber(amount: string | number): number {
  return toCents(amount) / 100;
}
