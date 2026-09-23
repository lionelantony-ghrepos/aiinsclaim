import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import type { Db } from "@/lib/db/client";
import { claimItems, claims, reserves } from "@/lib/db/schema";
import type { ClaimType, Lob } from "@/lib/db/schema";
import { loadRules } from "@/lib/rules";
import { evaluateRuleSet } from "@/lib/rules";
import { getParameter } from "@/lib/rules/params";
import { evaluateExpenseReserve, evaluateReserveFormula } from "@/lib/reserve-math";
import { loadClaimWithPolicy } from "@/lib/triage/inputs";
import { redactForAgent } from "./redact";

const AGENT_ID = "AGT-RESERVE";
const PROMPT_VERSION = "rules-v1";

export const ReserveSuggestionSchema = z.object({
  indemnityAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  expenseAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  expensePct: z.number(),
  formula: z.string(),
  ruleAuditId: z.string(),
  rationale: z.string(),
  comparables: z.array(
    z.object({
      claimNumber: z.string(),
      indemnityAmount: z.string(),
    }),
  ),
  confidence: z.number().min(0).max(1),
});

export type ReserveSuggestion = z.infer<typeof ReserveSuggestionSchema>;

async function readVehicleAcv(db: Db, claimId: string): Promise<number | undefined> {
  const items = await db
    .select()
    .from(claimItems)
    .where(eq(claimItems.claimId, claimId));
  for (const item of items) {
    const vehicle = item.vehicleJson as Record<string, unknown> | null;
    if (vehicle && typeof vehicle === "object") {
      for (const key of ["acv", "actualCashValue", "actual_cash_value"]) {
        const value = Number(vehicle[key]);
        if (Number.isFinite(value) && value > 0) {
          return value;
        }
      }
    }
  }
  return undefined;
}

async function loadComparables(
  db: Db,
  claimId: string,
  lineOfBusiness: Lob,
  claimType: ClaimType,
): Promise<ReserveSuggestion["comparables"]> {
  const peers = await db
    .select({ id: claims.id, claimNumber: claims.claimNumber })
    .from(claims)
    .where(
      and(
        eq(claims.lineOfBusiness, lineOfBusiness),
        eq(claims.claimType, claimType),
        ne(claims.id, claimId),
      ),
    )
    .limit(8);

  const comparables: ReserveSuggestion["comparables"] = [];
  for (const peer of peers) {
    const [indemnity] = await db
      .select()
      .from(reserves)
      .where(and(eq(reserves.claimId, peer.id), eq(reserves.kind, "indemnity")))
      .orderBy(desc(reserves.createdAt))
      .limit(1);
    if (indemnity) {
      comparables.push({
        claimNumber: peer.claimNumber,
        indemnityAmount: indemnity.amount,
      });
    }
    if (comparables.length >= 3) {
      break;
    }
  }
  return comparables;
}

/**
 * AGT-RESERVE: rules-only reserve suggester. Evaluates BR-RESERVE-001,
 * resolves the formula with parameter values, and returns a proposal.
 * Never writes reserves — the adjuster confirms via confirmReserve.
 */
export async function runReserveAgent(
  db: Db,
  claimId: string,
  opts?: { actor?: string },
): Promise<{ suggestion: ReserveSuggestion; agentRunId: string }> {
  const actor = opts?.actor ?? "agent:AGT-RESERVE";
  const started = Date.now();
  const { claim } = await loadClaimWithPolicy(db, claimId);
  const estimatedAmount = Number(claim.estimatedAmount ?? 0);
  const vehicleAcv = await readVehicleAcv(db, claimId);

  const result = await evaluateRuleSet(
    db,
    "BR-RESERVE-001",
    {
      line_of_business: claim.lineOfBusiness,
      claim_type: claim.claimType,
      estimated_amount: estimatedAmount,
      injury_involved: claim.injuryInvolved,
      ...(vehicleAcv !== undefined ? { vehicle_acv: vehicleAcv } : {}),
    },
    { claimId, actor },
  );

  const formula = String(
    result.outputs.reserve_amount_formula ?? "estimated_amount * 1.1",
  );
  const expensePct = Number(result.outputs.expense_reserve_pct ?? 8);

  const injuryFactor = Number(
    (await getParameter(db, "reserve.injury_factor")).valueJson,
  );
  const injuryBase = Number(
    (await getParameter(db, "reserve.injury_base")).valueJson,
  );

  const indemnity = evaluateReserveFormula(
    formula,
    estimatedAmount,
    vehicleAcv,
    injuryFactor,
    injuryBase,
  );
  const expense = evaluateExpenseReserve(indemnity, expensePct);

  const loaded = await loadRules(db, result.versionId);
  const matchedLabel =
    loaded.find((rule) => result.matchedRuleIds.includes(rule.id))?.label ??
    "reserve row";

  const comparables = await loadComparables(
    db,
    claimId,
    claim.lineOfBusiness,
    claim.claimType,
  );

  const suggestion = ReserveSuggestionSchema.parse({
    indemnityAmount: indemnity.toFixed(2),
    expenseAmount: expense.toFixed(2),
    expensePct,
    formula,
    ruleAuditId: result.auditId ?? "",
    rationale:
      `BR-RESERVE-001 matched "${matchedLabel}" for ${claim.lineOfBusiness} ` +
      `${claim.claimType.replaceAll("_", " ")} at estimated ${estimatedAmount.toFixed(2)}. ` +
      `Suggested indemnity ${indemnity.toFixed(2)} plus ${expensePct}% expense ` +
      `${expense.toFixed(2)}. Confirm or edit below — nothing is set until you confirm.`,
    comparables,
    confidence: 1,
  });

  const redactedInput = redactForAgent({
    claimId,
    lineOfBusiness: claim.lineOfBusiness,
    claimType: claim.claimType,
    estimatedAmount,
    injuryInvolved: claim.injuryInvolved,
  });

  const agentRun = await insertAgentRun(db, {
    agentId: AGENT_ID,
    claimId,
    promptVersion: PROMPT_VERSION,
    model: "rules:BR-RESERVE-001",
    inputJson: redactedInput as unknown as Record<string, unknown>,
    outputJson: suggestion as unknown as Record<string, unknown>,
    confidence: String(suggestion.confidence),
    status: "ok",
    latencyMs: Date.now() - started,
  });

  return { suggestion, agentRunId: agentRun.id };
}
