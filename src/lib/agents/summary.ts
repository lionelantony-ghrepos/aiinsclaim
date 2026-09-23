import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import {
  agentRuns,
  claims,
  claimStateHistory,
  fraudScores,
  reserves,
  ruleAuditLog,
} from "@/lib/db/schema";
import { getParameter } from "@/lib/rules/params";
import {
  SummaryAgentInputSchema,
  SummaryAgentOutputSchema,
  type SummaryAgentInput,
  type SummaryAgentOutput,
} from "@/lib/schemas/agents/summary";
import { callAiGateway } from "./gateway";
import { redactForAgent } from "./redact";

const AGENT_ID = "AGT-SUMMARY";
const PROMPT_VERSION = "v1";

export async function runSummaryAgent(
  db: Db,
  input: SummaryAgentInput,
): Promise<{
  output: SummaryAgentOutput | null;
  agentRunId: string;
  agentFailed: boolean;
}> {
  const parsedInput = SummaryAgentInputSchema.parse(input);
  const redactedInput = redactForAgent(parsedInput);
  const started = Date.now();

  let output: SummaryAgentOutput | null = null;
  let model = "mock:agt-summary-v1";
  let status: "ok" | "failed" = "ok";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const gateway = await callAiGateway({
        agentId: AGENT_ID,
        promptVersion: PROMPT_VERSION,
        input: parsedInput,
      });
      output = SummaryAgentOutputSchema.parse(gateway.output as unknown);
      model = gateway.model;
      status = "ok";
      break;
    } catch {
      status = "failed";
      output = null;
    }
  }

  const agentFailed = output === null;

  const agentRun = await insertAgentRun(db, {
    agentId: AGENT_ID,
    claimId: parsedInput.claimSnapshot.claimId,
    promptVersion: PROMPT_VERSION,
    model,
    inputJson: redactedInput as unknown as Record<string, unknown>,
    outputJson: agentFailed
      ? null
      : (output as unknown as Record<string, unknown>),
    status,
    latencyMs: Date.now() - started,
    outcome: agentFailed ? undefined : "accepted",
  });

  return {
    output: agentFailed ? null : output,
    agentRunId: agentRun.id,
    agentFailed,
  };
}

export async function regenerateSummary(
  db: Db,
  claimId: string,
  trigger: string,
): Promise<{ agentRunId: string; agentFailed: boolean }> {
  // Load claim snapshot
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  // Latest fraud score
  const [latestFraud] = await db
    .select()
    .from(fraudScores)
    .where(eq(fraudScores.claimId, claimId))
    .orderBy(desc(fraudScores.createdAt))
    .limit(1);

  // Reserve total (latest indemnity + expense)
  const reserveRows = await db
    .select()
    .from(reserves)
    .where(eq(reserves.claimId, claimId))
    .orderBy(desc(reserves.createdAt));

  const latestIndemnity = reserveRows.find((r) => r.kind === "indemnity");
  const latestExpense = reserveRows.find((r) => r.kind === "expense");
  const reserveTotal =
    Number(latestIndemnity?.amount ?? 0) + Number(latestExpense?.amount ?? 0);

  // Recent events — last 10 from claim_state_history, agent_runs, rule_audit_log merged
  const [stateRows, agentRunRows, ruleAuditRows] = await Promise.all([
    db
      .select()
      .from(claimStateHistory)
      .where(eq(claimStateHistory.claimId, claimId))
      .orderBy(desc(claimStateHistory.createdAt))
      .limit(10),
    db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.claimId, claimId))
      .orderBy(desc(agentRuns.createdAt))
      .limit(10),
    db
      .select()
      .from(ruleAuditLog)
      .where(eq(ruleAuditLog.claimId, claimId))
      .orderBy(desc(ruleAuditLog.evaluatedAt))
      .limit(10),
  ]);

  type RawEvent = { at: Date; kind: string; description: string };
  const allEvents: RawEvent[] = [
    ...stateRows.map((r) => ({
      at: r.createdAt,
      kind: "state_change",
      description: `${r.fromStatus ?? "—"} → ${r.toStatus}${r.reason ? `: ${r.reason}` : ""}`,
    })),
    ...agentRunRows.map((r) => ({
      at: r.createdAt,
      kind: "agent_run",
      description: `${r.agentId} ${r.status}${r.outcome ? ` (${r.outcome})` : ""}`,
    })),
    ...ruleAuditRows.map((r) => ({
      at: r.evaluatedAt ?? new Date(),
      kind: "rule_audit",
      description: `Rule set evaluated: ${r.matchedRuleIds.join(", ") || "none"}`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10);

  const recentEvents = allEvents.map((e) => ({
    at: e.at.toISOString(),
    kind: e.kind,
    description: e.description,
  }));

  const agentInput: SummaryAgentInput = {
    claimSnapshot: {
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      status: claim.status,
      lineOfBusiness: claim.lineOfBusiness,
      claimType: claim.claimType,
      estimatedAmount: Number(claim.estimatedAmount ?? 0),
      incidentDescription: claim.incidentDescription ?? null,
      severityScore: claim.severityScore ?? null,
      complexityScore: claim.complexityScore ?? null,
      fraudBand: latestFraud?.band ?? null,
      siuReferred: claim.siuReferred,
      reserveTotal,
    },
    recentEvents,
    previousSummary: claim.summaryMd ?? null,
  };

  const { output, agentRunId, agentFailed } = await runSummaryAgent(
    db,
    agentInput,
  );

  if (!agentFailed && output) {
    await db
      .update(claims)
      .set({
        summaryMd: output.summaryMd,
        summaryGeneratedAt: new Date(),
        summaryStale: false,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claimId));
  } else {
    // Keep existing summaryMd, mark stale
    await db
      .update(claims)
      .set({
        summaryStale: true,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claimId));
  }

  console.log(
    `[AGT-SUMMARY] regenerateSummary claimId=${claimId} trigger=${trigger} agentFailed=${agentFailed} agentRunId=${agentRunId}`,
  );

  return { agentRunId, agentFailed };
}

/**
 * Emit a material change event. If enough time has passed since the last
 * summary generation (per ui.summary_debounce_s), regenerates the summary.
 * In this in-process learning stack, regeneration runs synchronously.
 * Always wrap the caller with `.catch(() => {})` to avoid blocking the main workflow.
 */
export async function emitMaterialChange(
  db: Db,
  claimId: string,
  kind: string,
): Promise<void> {
  const [claim] = await db
    .select({
      summaryGeneratedAt: claims.summaryGeneratedAt,
    })
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) return;

  let debounceMs = 0;
  try {
    const param = await getParameter(db, "ui.summary_debounce_s");
    debounceMs = Number(param.valueJson) * 1000;
  } catch {
    // Parameter not found — default 0 (no debounce)
    debounceMs = 0;
  }

  const lastGenerated = claim.summaryGeneratedAt?.getTime() ?? 0;
  const elapsed = Date.now() - lastGenerated;

  if (elapsed >= debounceMs) {
    await regenerateSummary(db, claimId, kind);
  }
}
