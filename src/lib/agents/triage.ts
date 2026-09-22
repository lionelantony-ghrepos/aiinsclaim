import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import { insertTask } from "@/lib/db/queries/tasks";
import {
  claims,
  fraudScores,
  type ClaimRoute,
  type ClaimStatus,
} from "@/lib/db/schema";
import { evaluateRuleSet } from "@/lib/rules";
import { getParameter } from "@/lib/rules/params";
import {
  TriageAgentInputSchema,
  TriageAgentOutputSchema,
  type TriageAgentInput,
  type TriageAgentOutput,
} from "@/lib/schemas/agents/triage";
import { resolveAdjusterId } from "@/lib/triage/assign";
import {
  buildFraudStubInputs,
  buildStpInputs,
  countClaimantPriorClaims12m,
  loadClaimWithPolicy,
  loadLatestExtractionFields,
} from "@/lib/triage/inputs";
import { transitionClaim } from "@/lib/state-machine";
import { TriageSchemaError } from "./errors";
import { callAiGateway } from "./gateway";
import { redactForAgent } from "./redact";

const AGENT_ID = "AGT-TRIAGE";
const PROMPT_VERSION = "v1";

const FALLBACK_SCORES = {
  severityScore: 50,
  complexityScore: 50,
  reasonCodes: ["AGENT-FALLBACK"],
  keyRisks: ["Triage agent unavailable — manual review required"],
  confidence: 0,
};

export type TriageOrchestrationResult = {
  claimId: string;
  status: ClaimStatus;
  route: ClaimRoute | null;
  stpApproved: boolean;
  stpBlockReason: string | null;
  agentFailed: boolean;
  skipped: boolean;
  auditIds: {
    triage?: string;
    fraud?: string;
    stp?: string;
  };
};

export async function runTriageAgent(
  db: Db,
  input: TriageAgentInput,
): Promise<{
  output: TriageAgentOutput | null;
  agentRunId: string;
  agentFailed: boolean;
}> {
  const parsedInput = TriageAgentInputSchema.parse(input);
  const redactedInput = redactForAgent(parsedInput);
  const started = Date.now();

  let output: TriageAgentOutput | null = null;
  let model = "mock:agt-triage-v1";
  let status: "ok" | "failed" = "ok";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const gateway = await callAiGateway({
        agentId: AGENT_ID,
        promptVersion: PROMPT_VERSION,
        input: parsedInput,
      });
      output = TriageAgentOutputSchema.parse(gateway.output as unknown);
      model = gateway.model;
      status = "ok";
      break;
    } catch {
      status = "failed";
      output = null;
    }
  }

  const agentFailed = output === null;
  const persistedOutput: TriageAgentOutput = output ?? FALLBACK_SCORES;

  const agentRun = await insertAgentRun(db, {
    agentId: AGENT_ID,
    claimId: parsedInput.claimSnapshot.claimId,
    promptVersion: PROMPT_VERSION,
    model,
    inputJson: redactedInput as unknown as Record<string, unknown>,
    outputJson: persistedOutput as unknown as Record<string, unknown>,
    confidence: String(persistedOutput.confidence),
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

export async function runTriageOnSubmit(
  db: Db,
  claimId: string,
  actor = "system:triage",
): Promise<TriageOrchestrationResult> {
  await transitionClaim(db, {
    claimId,
    toStatus: "in_triage",
    actorId: actor,
    reason: "Submitted claim entered triage queue",
    triggeredBy: "system",
  });

  return triageClaim(db, claimId, { actor });
}

export async function retriageClaim(
  db: Db,
  claimId: string,
  options?: { previousAmount?: number; trigger?: string },
): Promise<TriageOrchestrationResult> {
  const { claim } = await loadClaimWithPolicy(db, claimId);

  const terminalStatuses: ClaimStatus[] = [
    "draft",
    "withdrawn",
    "denied",
    "closed",
    "paid",
    "approved",
  ];
  if (terminalStatuses.includes(claim.status)) {
    return skipResult(claimId, claim.status, claim.route);
  }

  if (options?.previousAmount !== undefined) {
    const deltaParam = await getParameter(db, "triage.retriage_amount_delta");
    const threshold = Number(deltaParam.valueJson);
    const current = Number(claim.estimatedAmount ?? 0);
    const delta = Math.abs(current - options.previousAmount);
    if (delta <= threshold) {
      return skipResult(claimId, claim.status, claim.route);
    }
  }

  return triageClaim(db, claimId, {
    actor: "system:retriage",
    isRetriage: true,
    trigger: options?.trigger,
  });
}

export async function triageClaim(
  db: Db,
  claimId: string,
  options?: {
    actor?: string;
    isRetriage?: boolean;
    trigger?: string;
  },
): Promise<TriageOrchestrationResult> {
  const actor = options?.actor ?? "system:triage";
  const { claim, policy } = await loadClaimWithPolicy(db, claimId);
  const priorClaims12m = await countClaimantPriorClaims12m(db, claimId);
  const extractedFields = await loadLatestExtractionFields(db, claimId);

  const agentInput: TriageAgentInput = {
    claimSnapshot: {
      claimId: claim.id,
      claimType: claim.claimType,
      lineOfBusiness: claim.lineOfBusiness,
      estimatedAmount: Number(claim.estimatedAmount ?? 0),
      injuryInvolved: claim.injuryInvolved,
      liabilityDisputed: claim.liabilityDisputed,
      incidentDescription: claim.incidentDescription,
    },
    extractedFields,
    policyCoverageSummary: {
      active: policy.status === "active",
      lineOfBusiness: claim.lineOfBusiness,
    },
    priorClaimCounts: {
      claims12m: priorClaims12m,
    },
  };

  const { output, agentFailed } = await runTriageAgent(db, agentInput);
  const scores = output ?? FALLBACK_SCORES;

  await db
    .update(claims)
    .set({
      severityScore: scores.severityScore,
      complexityScore: scores.complexityScore,
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claimId));

  const triageResult = await evaluateRuleSet(
    db,
    "BR-TRIAGE-001",
    {
      line_of_business: claim.lineOfBusiness,
      estimated_amount: Number(claim.estimatedAmount ?? 0),
      injury_involved: claim.injuryInvolved,
      liability_disputed: claim.liabilityDisputed,
      severity_score: scores.severityScore,
      complexity_score: scores.complexityScore,
      policy_active: policy.status === "active",
    },
    { claimId, actor: `agent:${AGENT_ID}` },
  );

  const route = triageResult.outputs.route as ClaimRoute;
  const priority = Number(triageResult.outputs.priority ?? 3);

  const assignResult = await evaluateRuleSet(
    db,
    "BR-ASSIGN-001",
    {
      route,
      line_of_business: claim.lineOfBusiness,
      injury_involved: claim.injuryInvolved,
    },
    { claimId, actor: `rule:BR-ASSIGN-001` },
  );

  const assignedTo = await resolveAdjusterId(db, {
    claimId,
    route,
    lineOfBusiness: claim.lineOfBusiness,
    injuryInvolved: claim.injuryInvolved,
    assignOutputs: assignResult.outputs,
  });

  const fraudInputs = await buildFraudStubInputs(
    db,
    claimId,
    claim,
    priorClaims12m,
  );
  const fraudResult = await evaluateRuleSet(db, "BR-FRAUD-001", fraudInputs, {
    claimId,
    actor: "triage:fraud-stub",
  });

  await db.insert(fraudScores).values({
    id: crypto.randomUUID(),
    claimId,
    score: Number(fraudResult.outputs.fraud_score ?? 0),
    band: (fraudResult.outputs.fraud_band as "low" | "medium" | "high" | "critical") ?? "low",
    reasonCodes: (fraudResult.outputs.reason_codes as string[]) ?? [],
    signalsJson: { stub: true, trigger: options?.trigger ?? "initial" },
    ruleAuditId: fraudResult.auditId,
  });

  let finalRoute = route;
  const stpApproved = false;
  let stpBlockReason: string | null = null;
  let stpAuditId: string | undefined;

  const canStpTransition =
    !options?.isRetriage && (claim.status === "in_triage" || claim.status === "submitted");

  if (route === "green_lane" && canStpTransition) {
    const stpInputs = {
      ...(await buildStpInputs(db, claimId, claim, priorClaims12m)),
      route: "green_lane" as const,
      fraud_band:
        (fraudResult.outputs.fraud_band as "low" | "medium" | "high" | "critical") ??
        "low",
    };

    const stpResult = await evaluateRuleSet(db, "BR-STP-001", stpInputs, {
      claimId,
      actor: "rule:BR-STP-001",
    });
    stpAuditId = stpResult.auditId;

    if (stpResult.outputs.stp_allowed) {
      await db
        .update(claims)
        .set({
          route: finalRoute,
          priority,
          assignedTo,
          updatedAt: new Date(),
        })
        .where(eq(claims.id, claimId));

      const approved = await transitionClaim(db, {
        claimId,
        toStatus: "approved",
        actorId: "rule:BR-STP-001",
        reason: "Green-lane STP auto-approval",
        triggeredBy: "rule",
        guardContext: { stpInputs, actor: "rule:BR-STP-001" },
      });

      return {
        claimId,
        status: approved.toStatus,
        route: finalRoute,
        stpApproved: true,
        stpBlockReason: null,
        agentFailed,
        skipped: false,
        auditIds: {
          triage: triageResult.auditId,
          fraud: fraudResult.auditId,
          stp: stpAuditId,
        },
      };
    }

    finalRoute = "standard";
    stpBlockReason = String(stpResult.outputs.reason_code ?? "STP-BLOCK");
  } else if (route === "green_lane" && options?.isRetriage) {
    finalRoute = "standard";
  }

  await db
    .update(claims)
    .set({
      route: finalRoute,
      priority,
      assignedTo,
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claimId));

  if (
    !options?.isRetriage &&
    (agentFailed || finalRoute === "supervisor")
  ) {
    await insertTask(db, {
      claimId,
      type: "review_triage",
      queue: finalRoute === "supervisor" ? "supervision" : "adjusting",
      priority: 4,
      payloadJson: {
        reason: agentFailed ? "agent_schema_failure" : "supervisor_route",
        reasonCodes: scores.reasonCodes,
        trigger: options?.trigger ?? "initial",
      },
    });
  }

  if (options?.isRetriage) {
    return {
      claimId,
      status: claim.status,
      route: finalRoute,
      stpApproved,
      stpBlockReason,
      agentFailed,
      skipped: false,
      auditIds: {
        triage: triageResult.auditId,
        fraud: fraudResult.auditId,
        stp: stpAuditId,
      },
    };
  }

  const assessment = await transitionClaim(db, {
    claimId,
    toStatus: "in_assessment",
    actorId: actor,
    reason: options?.isRetriage
      ? `Re-triage (${options.trigger ?? "material_change"})`
      : "Triage routed to assessment",
    triggeredBy: options?.isRetriage ? "system" : "rule",
    guardContext: {
      triageInputs: {
        line_of_business: claim.lineOfBusiness,
        estimated_amount: Number(claim.estimatedAmount ?? 0),
        injury_involved: claim.injuryInvolved,
        liability_disputed: claim.liabilityDisputed,
        severity_score: scores.severityScore,
        complexity_score: scores.complexityScore,
        policy_active: policy.status === "active",
      },
      actor,
    },
  });

  return {
    claimId,
    status: assessment.toStatus,
    route: finalRoute,
    stpApproved,
    stpBlockReason,
    agentFailed,
    skipped: false,
    auditIds: {
      triage: triageResult.auditId,
      fraud: fraudResult.auditId,
      stp: stpAuditId,
    },
  };
}

function skipResult(
  claimId: string,
  status: ClaimStatus,
  route: ClaimRoute | null,
): TriageOrchestrationResult {
  return {
    claimId,
    status,
    route,
    stpApproved: status === "approved",
    stpBlockReason: null,
    agentFailed: false,
    skipped: true,
    auditIds: {},
  };
}

export { TriageSchemaError };
