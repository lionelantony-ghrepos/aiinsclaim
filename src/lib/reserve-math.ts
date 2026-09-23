/**
 * Shared reserve formula evaluator for BR-RESERVE-001 outputs.
 *
 * Pure function: resolves the `reserve_amount_formula` strings emitted by the
 * decision table into indemnity amounts. Parameter values (factors, bases)
 * are passed in by the caller — never read here — so this stays free of
 * business numbers.
 */
export function evaluateReserveFormula(
  formula: string,
  estimatedAmount: number,
  vehicleAcv: number | undefined,
  injuryFactor: number,
  injuryBase: number,
): number {
  const roundCents = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100;
  if (formula.includes("reserve.injury_factor")) {
    return roundCents(estimatedAmount * injuryFactor + injuryBase);
  }
  if (formula.startsWith("min(")) {
    const acv = vehicleAcv ?? estimatedAmount;
    return roundCents(Math.min(estimatedAmount, acv));
  }
  const match = formula.match(/estimated_amount \* ([0-9.]+)/);
  if (match) {
    return roundCents(estimatedAmount * Number(match[1]));
  }
  return roundCents(estimatedAmount);
}

/** Expense reserve derived from an indemnity amount and a rule pct output. */
export function evaluateExpenseReserve(
  indemnityAmount: number,
  expenseReservePct: number,
): number {
  if (!Number.isFinite(expenseReservePct) || expenseReservePct < 0) {
    return 0;
  }
  return (indemnityAmount * expenseReservePct) / 100;
}
