import { and, desc, eq } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";
import { insertAuditLog } from "@/lib/db/queries/append-only";
import { insertTask } from "@/lib/db/queries/tasks";
import {
  claimParties,
  claims,
  fraudScores,
  notifications,
  parties,
  payments,
  settlements,
  type FraudBand,
  type PaymentMethod,
  type SettlementItemRow,
} from "@/lib/db/schema";
import { canWriteClaim } from "@/lib/auth/scope";
import { getParameter } from "@/lib/rules/params";
import { evaluateRuleSet } from "@/lib/rules";
import {
  GuardFailedError,
  IllegalTransitionError,
  transitionClaim,
} from "@/lib/state-machine";
import { computeSettlementTotal, moneyToNumber } from "@/lib/settlement-math";
import { DENIAL_REASON_CODES } from "@/lib/schemas/denial";
import type {
  ApproveSettlementInput,
  CloseClaimInput,
  DenyClaimInput,
  IssuePaymentInput,
  ProposeSettlementInput,
} from "@/lib/schemas/financials";

export const AUTHORITY_ROUTED_MESSAGE =
  "Above your authority — routed to supervision.";

export type SettlementResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

async function notifyClaimant(
  db: Db,
  claimId: string,
  kind: string,
  title: string,
  bodyMd: string,
  taskId?: string,
) {
  const [claimantLink] = await db
    .select({ userId: parties.userId })
    .from(claimParties)
    .innerJoin(parties, eq(parties.id, claimParties.partyId))
    .where(
      and(eq(claimParties.claimId, claimId), eq(claimParties.role, "claimant")),
    )
    .limit(1);
  if (!claimantLink?.userId) {
    return;
  }
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: claimantLink.userId,
    claimId,
    taskId: taskId ?? null,
    kind,
    title,
    bodyMd,
  });
}

async function loadClaimantPartyId(db: Db, claimId: string) {
  const [link] = await db
    .select({ partyId: claimParties.partyId })
    .from(claimParties)
    .where(
      and(eq(claimParties.claimId, claimId), eq(claimParties.role, "claimant")),
    )
    .limit(1);
  return link?.partyId ?? null;
}

async function latestFraudBand(db: Db, claimId: string): Promise<FraudBand> {
  const [row] = await db
    .select({ band: fraudScores.band })
    .from(fraudScores)
    .where(eq(fraudScores.claimId, claimId))
    .orderBy(desc(fraudScores.createdAt))
    .limit(1);
  return (row?.band as FraudBand | undefined) ?? "low";
}

function authInputsFor(
  user: SessionUser,
  settlementAmount: number,
  fraudBand: FraudBand,
  claim: { siuReferred: boolean; siuDisposition: string | null },
) {
  return {
    settlement_amount: settlementAmount,
    approver_role: user.role,
    approver_authority_level: user.authorityLevel,
    fraud_band: fraudBand,
    siu_referred: claim.siuReferred,
    ...(claim.siuDisposition
      ? { siu_disposition: claim.siuDisposition }
      : {}),
  };
}

function transitionError(error: unknown): SettlementResult<never> | null {
  if (error instanceof GuardFailedError) {
    return {
      ok: false,
      error: {
        code: "GUARD_FAILED",
        message: error.details
          ? `${error.message}: ${JSON.stringify(error.details)}`
          : error.message,
      },
    };
  }
  if (error instanceof IllegalTransitionError) {
    return {
      ok: false,
      error: { code: "ILLEGAL_TRANSITION", message: error.message },
    };
  }
  return null;
}

export async function proposeSettlement(
  db: Db,
  user: SessionUser,
  input: ProposeSettlementInput,
): Promise<SettlementResult<{ settlementId: string; totalAmount: string }>> {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, input.claimId))
    .limit(1);
  if (!claim) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
  }
  if (!canWriteClaim(user, { assignedTo: claim.assignedTo, siuReferred: claim.siuReferred })) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
  }
  if (claim.status !== "in_settlement") {
    return {
      ok: false,
      error: {
        code: "ILLEGAL_TRANSITION",
        message: "Settlements can only be proposed while in settlement",
      },
    };
  }

  const totalAmount = computeSettlementTotal(input.items, input.deductibleApplied);
  const settlementId = crypto.randomUUID();
  const itemsJson: SettlementItemRow[] = input.items.map((item) => ({
    claimItemId: item.claimItemId,
    amount: item.amount,
  }));

  await db.insert(settlements).values({
    id: settlementId,
    claimId: input.claimId,
    itemsJson,
    deductibleApplied: input.deductibleApplied,
    totalAmount,
    note: input.note ?? null,
    status: "proposed",
    proposedBy: user.id,
  });

  await insertAuditLog(db, {
    actor: `user:${user.id}`,
    action: "settlement_proposed",
    entity: "settlements",
    entityId: settlementId,
    afterJson: {
      claimId: input.claimId,
      settlementId,
      totalAmount,
      itemCount: itemsJson.length,
    },
  });

  return { ok: true, data: { settlementId, totalAmount } };
}

export async function approveSettlement(
  db: Db,
  user: SessionUser,
  input: ApproveSettlementInput,
): Promise<
  SettlementResult<
    | { decision: "allowed"; claimId: string }
    | { decision: "routed"; taskId: string; message: string }
  >
> {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, input.claimId))
    .limit(1);
  if (!claim) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
  }
  if (!canWriteClaim(user, { assignedTo: claim.assignedTo, siuReferred: claim.siuReferred })) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
  }

  const [settlement] = await db
    .select()
    .from(settlements)
    .where(
      and(
        eq(settlements.id, input.settlementId),
        eq(settlements.claimId, input.claimId),
      ),
    )
    .limit(1);
  if (!settlement) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Settlement not found" },
    };
  }
  if (
    settlement.status !== "proposed" &&
    settlement.status !== "pending_approval"
  ) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: `Settlement is ${settlement.status}`,
      },
    };
  }

  const fraudBand = await latestFraudBand(db, input.claimId);
  const amount = moneyToNumber(settlement.totalAmount);
  const authInputs = authInputsFor(user, amount, fraudBand, claim);

  const evalResult = await evaluateRuleSet(db, "BR-AUTH-001", authInputs, {
    claimId: input.claimId,
    actor: `user:${user.id}`,
  });

  const decision = String(evalResult.outputs.decision ?? "");

  if (decision === "block") {
    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "settlement_approval_blocked",
      entity: "settlements",
      entityId: input.settlementId,
      afterJson: {
        claimId: input.claimId,
        reason: evalResult.outputs.reason ?? "SIU hold",
        ruleAuditId: evalResult.auditId,
      },
    });
    return {
      ok: false,
      error: {
        code: "SIU_HOLD",
        message: String(evalResult.outputs.reason ?? "SIU hold"),
      },
    };
  }

  if (decision === "require_next_level") {
    const task = await insertTask(db, {
      claimId: input.claimId,
      type: "approve_settlement",
      queue: "supervision",
      priority: 4,
      assignedTo: null,
      payloadJson: {
        kind: "approve_settlement",
        settlementId: input.settlementId,
        amount: settlement.totalAmount,
        claimId: input.claimId,
        requestedBy: user.id,
        ruleAuditId: evalResult.auditId,
      },
    });

    await db
      .update(settlements)
      .set({
        status: "pending_approval",
        authorityRuleAuditId: evalResult.auditId,
        updatedAt: new Date(),
      })
      .where(eq(settlements.id, input.settlementId));

    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "settlement_approval_routed",
      entity: "settlements",
      entityId: input.settlementId,
      afterJson: {
        claimId: input.claimId,
        taskId: task.id,
        ruleAuditId: evalResult.auditId,
      },
    });

    return {
      ok: true,
      data: {
        decision: "routed",
        taskId: task.id,
        message: AUTHORITY_ROUTED_MESSAGE,
      },
    };
  }

  if (decision !== "allow") {
    return {
      ok: false,
      error: {
        code: "APPROVAL_REQUIRED",
        message: "Settlement approval decision was not allow",
      },
    };
  }

  try {
    await transitionClaim(db, {
      claimId: input.claimId,
      toStatus: "approved",
      actorId: user.id,
      reason: "Settlement approved within authority",
      triggeredBy: "user",
      guardContext: {
        actor: `user:${user.id}`,
        authInputs,
      },
    });
  } catch (error) {
    const mapped = transitionError(error);
    if (mapped) return mapped;
    throw error;
  }

  await db
    .update(settlements)
    .set({
      status: "approved",
      authorityRuleAuditId: evalResult.auditId,
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, input.settlementId));

  await notifyClaimant(
    db,
    input.claimId,
    "settlement_approved",
    `Settlement approved for ${claim.claimNumber}`,
    `Your claim settlement of ${settlement.totalAmount} was approved.`,
  );

  await insertAuditLog(db, {
    actor: `user:${user.id}`,
    action: "settlement_approved",
    entity: "settlements",
    entityId: input.settlementId,
    afterJson: {
      claimId: input.claimId,
      ruleAuditId: evalResult.auditId,
      totalAmount: settlement.totalAmount,
    },
  });

  return { ok: true, data: { decision: "allowed", claimId: input.claimId } };
}

export async function issuePayment(
  db: Db,
  user: SessionUser,
  input: IssuePaymentInput,
): Promise<SettlementResult<{ paymentId: string; reference: string }>> {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, input.claimId))
    .limit(1);
  if (!claim) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
  }
  if (!canWriteClaim(user, { assignedTo: claim.assignedTo, siuReferred: claim.siuReferred })) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
  }
  if (claim.status !== "approved") {
    return {
      ok: false,
      error: {
        code: "ILLEGAL_TRANSITION",
        message: "Payment can only be issued for approved claims",
      },
    };
  }

  const [settlement] = await db
    .select()
    .from(settlements)
    .where(
      and(
        eq(settlements.id, input.settlementId),
        eq(settlements.claimId, input.claimId),
      ),
    )
    .limit(1);
  if (!settlement || settlement.status !== "approved") {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Approved settlement required",
      },
    };
  }

  const payeePartyId = await loadClaimantPartyId(db, input.claimId);
  if (!payeePartyId) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Claimant party not found" },
    };
  }

  const paymentId = crypto.randomUUID();
  const shortId = paymentId.replaceAll("-", "").slice(0, 8).toUpperCase();
  const method: PaymentMethod = input.method;
  const reference =
    method === "ach_mock" ? `ACH-MOCK-${shortId}` : `CHK-MOCK-${shortId}`;

  await db.insert(payments).values({
    id: paymentId,
    claimId: input.claimId,
    payeePartyId,
    amount: settlement.totalAmount,
    method,
    status: "issued",
    reference,
    approvedBy: user.id,
    authorityRuleAuditId: settlement.authorityRuleAuditId,
  });

  try {
    await transitionClaim(db, {
      claimId: input.claimId,
      toStatus: "paid",
      actorId: user.id,
      reason: "Mock payment issued",
      triggeredBy: "user",
      guardContext: { actor: `user:${user.id}` },
    });
  } catch (error) {
    const mapped = transitionError(error);
    if (mapped) return mapped;
    throw error;
  }

  await notifyClaimant(
    db,
    input.claimId,
    "payment_issued",
    `Payment issued for ${claim.claimNumber}`,
    `A mock payment (${reference}) of ${settlement.totalAmount} was issued.`,
  );

  await insertAuditLog(db, {
    actor: `user:${user.id}`,
    action: "payment_issued",
    entity: "payments",
    entityId: paymentId,
    afterJson: {
      claimId: input.claimId,
      settlementId: input.settlementId,
      paymentId,
      reference,
      method,
    },
  });

  return { ok: true, data: { paymentId, reference } };
}

export async function closeClaim(
  db: Db,
  user: SessionUser,
  input: CloseClaimInput,
): Promise<SettlementResult<{ claimId: string }>> {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, input.claimId))
    .limit(1);
  if (!claim) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
  }
  if (!canWriteClaim(user, { assignedTo: claim.assignedTo, siuReferred: claim.siuReferred })) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
  }
  if (claim.status !== "paid") {
    return {
      ok: false,
      error: {
        code: "ILLEGAL_TRANSITION",
        message: "Only paid claims can be closed",
      },
    };
  }

  try {
    await transitionClaim(db, {
      claimId: input.claimId,
      toStatus: "closed",
      actorId: user.id,
      reason: "Closure checklist satisfied",
      triggeredBy: "user",
      guardContext: { actor: `user:${user.id}` },
    });
  } catch (error) {
    if (error instanceof GuardFailedError) {
      const openTasks =
        typeof error.details?.open_tasks === "number"
          ? error.details.open_tasks
          : undefined;
      return {
        ok: false,
        error: {
          code: "GUARD_FAILED",
          message:
            openTasks !== undefined
              ? `Cannot close: ${openTasks} open task(s)`
              : error.message,
        },
      };
    }
    const mapped = transitionError(error);
    if (mapped) return mapped;
    throw error;
  }

  await notifyClaimant(
    db,
    input.claimId,
    "claim_closed",
    `Claim ${claim.claimNumber} closed`,
    "Your claim has been closed.",
  );

  await insertAuditLog(db, {
    actor: `user:${user.id}`,
    action: "claim_closed",
    entity: "claims",
    entityId: input.claimId,
    afterJson: { claimId: input.claimId, toStatus: "closed" },
  });

  return { ok: true, data: { claimId: input.claimId } };
}

export async function denyClaim(
  db: Db,
  user: SessionUser,
  input: DenyClaimInput,
): Promise<SettlementResult<{ taskId: string }>> {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, input.claimId))
    .limit(1);
  if (!claim) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
  }
  if (!canWriteClaim(user, { assignedTo: claim.assignedTo, siuReferred: claim.siuReferred })) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
  }

  if (!claim.denialReasonCode?.trim() && !input.reasonCode) {
    return {
      ok: false,
      error: { code: "REASON_REQUIRED", message: "Denial reason code required" },
    };
  }
  if (input.note.trim().length < 10) {
    return {
      ok: false,
      error: {
        code: "REASON_REQUIRED",
        message: "Denial note required (min 10 characters)",
      },
    };
  }

  const param = await getParameter(db, "denial.reason_codes");
  const seededCodes = Array.isArray(param.valueJson)
    ? param.valueJson.filter((c): c is string => typeof c === "string")
    : [...DENIAL_REASON_CODES];
  if (!seededCodes.includes(input.reasonCode)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid denial reason code",
      },
    };
  }

  await db
    .update(claims)
    .set({
      denialReasonCode: input.reasonCode,
      updatedAt: new Date(),
    })
    .where(eq(claims.id, input.claimId));

  const task = await insertTask(db, {
    claimId: input.claimId,
    type: "escalation",
    queue: "supervision",
    priority: 5,
    assignedTo: null,
    payloadJson: {
      kind: "deny_confirmation",
      reasonCode: input.reasonCode,
      note: input.note,
      claimId: input.claimId,
      requestedBy: user.id,
    },
  });

  await notifyClaimant(
    db,
    input.claimId,
    "denial_pending",
    `Denial pending review for ${claim.claimNumber}`,
    "A denial has been proposed and awaits supervisor confirmation.",
    task.id,
  );

  await insertAuditLog(db, {
    actor: `user:${user.id}`,
    action: "denial_requested",
    entity: "claims",
    entityId: input.claimId,
    afterJson: {
      claimId: input.claimId,
      taskId: task.id,
      reasonCode: input.reasonCode,
    },
  });

  return { ok: true, data: { taskId: task.id } };
}

export async function resolveApproveSettlementTask(
  db: Db,
  user: SessionUser,
  task: {
    id: string;
    claimId: string;
    payloadJson: Record<string, unknown> | null;
  },
  resolution: "accepted" | "rejected",
  resolutionReason?: string,
): Promise<SettlementResult<{ claimId: string }>> {
  const payload = task.payloadJson ?? {};
  const settlementId =
    typeof payload.settlementId === "string" ? payload.settlementId : null;
  if (!settlementId) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Missing settlementId" },
    };
  }

  if (resolution === "rejected") {
    if (!resolutionReason || resolutionReason.trim().length < 10) {
      return {
        ok: false,
        error: {
          code: "REASON_REQUIRED",
          message: "Rejection reason required (min 10 characters)",
        },
      };
    }
    await db
      .update(settlements)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(settlements.id, settlementId));
    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "settlement_rejected",
      entity: "settlements",
      entityId: settlementId,
      afterJson: { claimId: task.claimId, taskId: task.id },
    });
    return { ok: true, data: { claimId: task.claimId } };
  }

  const result = await approveSettlement(db, user, {
    claimId: task.claimId,
    settlementId,
  });
  if (!result.ok) {
    return result;
  }
  if (result.data.decision === "routed") {
    return {
      ok: false,
      error: {
        code: "APPROVAL_REQUIRED",
        message: result.data.message,
      },
    };
  }
  return { ok: true, data: { claimId: task.claimId } };
}

export async function resolveDenyConfirmationTask(
  db: Db,
  user: SessionUser,
  task: {
    id: string;
    claimId: string;
    payloadJson: Record<string, unknown> | null;
  },
  resolution: "accepted" | "rejected",
  resolutionReason?: string,
): Promise<SettlementResult<{ claimId: string }>> {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, task.claimId))
    .limit(1);
  if (!claim) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
  }

  if (resolution === "rejected") {
    if (!resolutionReason || resolutionReason.trim().length < 10) {
      return {
        ok: false,
        error: {
          code: "REASON_REQUIRED",
          message: "Rejection reason required (min 10 characters)",
        },
      };
    }
    await db
      .update(claims)
      .set({ denialReasonCode: null, updatedAt: new Date() })
      .where(eq(claims.id, task.claimId));
    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "denial_rejected",
      entity: "claims",
      entityId: task.claimId,
      afterJson: { claimId: task.claimId, taskId: task.id },
    });
    return { ok: true, data: { claimId: task.claimId } };
  }

  try {
    await transitionClaim(db, {
      claimId: task.claimId,
      toStatus: "denied",
      actorId: user.id,
      reason: "Supervisor confirmed denial",
      triggeredBy: "user",
      guardContext: {
        actor: `user:${user.id}`,
        supervisorApproved: true,
      },
    });
  } catch (error) {
    const mapped = transitionError(error);
    if (mapped) return mapped;
    throw error;
  }

  await notifyClaimant(
    db,
    task.claimId,
    "claim_denied",
    `Claim ${claim.claimNumber} denied`,
    `Your claim was denied (${claim.denialReasonCode ?? "see claim"}).`,
    task.id,
  );

  await insertAuditLog(db, {
    actor: `user:${user.id}`,
    action: "denial_confirmed",
    entity: "claims",
    entityId: task.claimId,
    afterJson: {
      claimId: task.claimId,
      taskId: task.id,
      reasonCode: claim.denialReasonCode,
    },
  });

  return { ok: true, data: { claimId: task.claimId } };
}
