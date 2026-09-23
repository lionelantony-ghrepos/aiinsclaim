import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  claims,
  documents,
  extractions,
  fraudScores,
  payments,
  reserves,
  tasks,
  type ClaimStatus,
} from "@/lib/db/schema";
import { evaluateRuleSet } from "@/lib/rules";
import {
  countOpenTasks,
  evaluateFnolCompleteness,
  evaluateSettlementCompleteness,
} from "./completeness";
import { GuardFailedError } from "./errors";

export type GuardContext = {
  asOf?: string;
  actor?: string;
  /** Set true when claimant/staff confirms info was received (pending_info → in_assessment). */
  infoReceived?: boolean;
  /** Supervisor approval captured for denial transitions. */
  supervisorApproved?: boolean;
  /** Optional STP evaluation inputs override for in_triage → approved. */
  stpInputs?: Record<string, unknown>;
  /** Optional triage evaluation inputs override for in_triage → in_assessment. */
  triageInputs?: Record<string, unknown>;
  /** Optional authority evaluation inputs override for in_settlement → approved. */
  authInputs?: Record<string, unknown>;
};

export type GuardResult = {
  passed: true;
  ruleAuditId?: string;
};

async function loadClaim(db: Db, claimId: string) {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }
  return claim;
}

async function guardBrDoc001(
  db: Db,
  claimId: string,
  context: GuardContext,
): Promise<GuardResult> {
  const result = await evaluateFnolCompleteness(db, claimId, {
    asOf: context.asOf,
    actor: context.actor,
  });
  if (!result.complete) {
    throw new GuardFailedError(
      "BR-DOC-001",
      "FNOL completeness requirements not met",
      { missing: result.missing },
    );
  }
  return { passed: true, ruleAuditId: result.ruleAuditId };
}

async function guardBrTriage001(
  db: Db,
  claimId: string,
  context: GuardContext,
): Promise<GuardResult> {
  const claim = await loadClaim(db, claimId);
  const inputs = context.triageInputs ?? {
    line_of_business: claim.lineOfBusiness,
    estimated_amount: Number(claim.estimatedAmount ?? 0),
    injury_involved: claim.injuryInvolved,
    liability_disputed: claim.liabilityDisputed,
    severity_score: claim.severityScore ?? 0,
    complexity_score: claim.complexityScore ?? 0,
    policy_active: true,
  };

  const result = await evaluateRuleSet(db, "BR-TRIAGE-001", inputs, {
    claimId,
    actor: context.actor ?? "state-machine:triage-guard",
    asOf: context.asOf,
  });

  if (!result.outputs.route) {
    throw new GuardFailedError(
      "BR-TRIAGE-001",
      "Triage routing decision required",
    );
  }

  return { passed: true, ruleAuditId: result.auditId };
}

async function buildStpInputsFromClaim(
  db: Db,
  claimId: string,
  claim: Awaited<ReturnType<typeof loadClaim>>,
  context: GuardContext,
): Promise<Record<string, unknown>> {
  const fnol = await evaluateFnolCompleteness(db, claimId, {
    asOf: context.asOf,
    actor: context.actor,
  });

  const [latestFraud] = await db
    .select()
    .from(fraudScores)
    .where(eq(fraudScores.claimId, claimId))
    .orderBy(desc(fraudScores.createdAt))
    .limit(1);

  const docRows = await db
    .select()
    .from(documents)
    .where(eq(documents.claimId, claimId));

  const docsExtracted =
    docRows.length > 0 &&
    docRows.every(
      (doc) => doc.status === "verified" || doc.status === "extracted",
    );

  let extractionMinConfidence = 0;
  if (docRows.length > 0) {
    const extractionRows = await db
      .select({ minConfidence: extractions.minConfidence })
      .from(extractions)
      .innerJoin(documents, eq(extractions.documentId, documents.id))
      .where(eq(documents.claimId, claimId));

    if (extractionRows.length > 0) {
      extractionMinConfidence = Math.min(
        ...extractionRows.map((row) => Number(row.minConfidence)),
      );
    }
  }

  return {
    route: claim.route ?? "standard",
    fraud_band: latestFraud?.band ?? "medium",
    all_required_docs_extracted: fnol.complete && docsExtracted,
    extraction_min_confidence: extractionMinConfidence,
    claimant_prior_claims_12m: 0,
    estimated_amount: Number(claim.estimatedAmount ?? 0),
  };
}

async function guardBrStp001(
  db: Db,
  claimId: string,
  context: GuardContext,
): Promise<GuardResult> {
  const claim = await loadClaim(db, claimId);

  if (claim.route !== "green_lane") {
    throw new GuardFailedError(
      "BR-STP-001",
      "STP requires green_lane route",
      { route: claim.route },
    );
  }

  const inputs =
    context.stpInputs ??
    (await buildStpInputsFromClaim(db, claimId, claim, context));

  const result = await evaluateRuleSet(db, "BR-STP-001", inputs, {
    claimId,
    actor: context.actor ?? "state-machine:stp-guard",
    asOf: context.asOf,
  });

  if (!result.outputs.stp_allowed) {
    throw new GuardFailedError(
      "BR-STP-001",
      "STP green-lane criteria not met",
      { reason_code: result.outputs.reason_code },
    );
  }

  return { passed: true, ruleAuditId: result.auditId };
}

async function guardOpenInfoRequest(
  db: Db,
  claimId: string,
): Promise<GuardResult> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.claimId, claimId),
        eq(tasks.type, "request_info"),
        inArray(tasks.status, ["open", "in_progress"]),
      ),
    )
    .limit(1);

  if (!task) {
    throw new GuardFailedError(
      "open_info_request",
      "Open info request task required",
    );
  }

  return { passed: true };
}

async function guardInfoReceived(
  _db: Db,
  _claimId: string,
  context: GuardContext,
): Promise<GuardResult> {
  if (!context.infoReceived) {
    throw new GuardFailedError(
      "info_received",
      "Info received confirmation required",
    );
  }
  return { passed: true };
}

async function guardAssessmentComplete(
  db: Db,
  claimId: string,
  context: GuardContext,
): Promise<GuardResult> {
  const settlement = await evaluateSettlementCompleteness(db, claimId, {
    asOf: context.asOf,
    actor: context.actor,
  });
  if (!settlement.complete) {
    throw new GuardFailedError(
      "assessment_complete",
      "Settlement document requirements not met",
      { missing: settlement.missing },
    );
  }

  const [reserve] = await db
    .select()
    .from(reserves)
    .where(eq(reserves.claimId, claimId))
    .limit(1);

  if (!reserve) {
    throw new GuardFailedError(
      "assessment_complete",
      "Reserve must be set before completing assessment",
    );
  }

  return { passed: true, ruleAuditId: settlement.ruleAuditId };
}

async function guardBrAuth001(
  db: Db,
  claimId: string,
  context: GuardContext,
): Promise<GuardResult> {
  if (!context.authInputs) {
    throw new GuardFailedError(
      "BR-AUTH-001",
      "Authority inputs are required for settlement approval",
    );
  }

  const result = await evaluateRuleSet(db, "BR-AUTH-001", context.authInputs, {
    claimId,
    actor: context.actor ?? "state-machine:auth-guard",
    asOf: context.asOf,
  });

  if (result.outputs.decision !== "allow") {
    throw new GuardFailedError(
      "BR-AUTH-001",
      "Settlement exceeds approver authority",
      { decision: result.outputs.decision, reason: result.outputs.reason },
    );
  }

  return { passed: true, ruleAuditId: result.auditId };
}

async function guardPaymentCreated(
  db: Db,
  claimId: string,
): Promise<GuardResult> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.claimId, claimId))
    .limit(1);

  if (!payment) {
    throw new GuardFailedError(
      "payment_created",
      "Payment record required before marking claim paid",
    );
  }

  return { passed: true };
}

async function guardClosureChecklist(
  db: Db,
  claimId: string,
): Promise<GuardResult> {
  const openCount = await countOpenTasks(db, claimId);
  if (openCount > 0) {
    throw new GuardFailedError(
      "closure_checklist",
      "All tasks must be closed before closing claim",
      { open_tasks: openCount },
    );
  }
  return { passed: true };
}

async function guardDenialApproval(
  db: Db,
  claimId: string,
  context: GuardContext,
): Promise<GuardResult> {
  const claim = await loadClaim(db, claimId);
  if (!claim.denialReasonCode?.trim()) {
    throw new GuardFailedError(
      "denial_approval",
      "Denial reason code required",
    );
  }
  if (!context.supervisorApproved) {
    throw new GuardFailedError(
      "denial_approval",
      "Supervisor approval required for denial",
    );
  }
  return { passed: true };
}

type GuardFn = (
  db: Db,
  claimId: string,
  context: GuardContext,
) => Promise<GuardResult>;

const GUARD_REGISTRY: Record<string, GuardFn> = {
  "BR-DOC-001": guardBrDoc001,
  "BR-TRIAGE-001": guardBrTriage001,
  "BR-STP-001": guardBrStp001,
  open_info_request: guardOpenInfoRequest,
  info_received: guardInfoReceived,
  assessment_complete: guardAssessmentComplete,
  "BR-AUTH-001": guardBrAuth001,
  payment_created: guardPaymentCreated,
  closure_checklist: guardClosureChecklist,
  denial_approval: guardDenialApproval,
};

export async function runGuard(
  db: Db,
  guardCode: string,
  claimId: string,
  context: GuardContext = {},
): Promise<GuardResult> {
  const guard = GUARD_REGISTRY[guardCode];
  if (!guard) {
    throw new GuardFailedError(guardCode, `Unknown guard: ${guardCode}`);
  }
  return guard(db, claimId, context);
}

export function isKnownGuard(guardCode: string): boolean {
  return guardCode in GUARD_REGISTRY;
}

export type { ClaimStatus };
