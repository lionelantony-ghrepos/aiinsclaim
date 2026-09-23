"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { canAccessClaim, canWriteClaim } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { runReserveAgent } from "@/lib/agents/reserve";
import { emitMaterialChange, regenerateSummary } from "@/lib/agents/summary";
import { getDb } from "@/lib/db";
import {
  insertAuditLog,
  updateAgentRunOutcome,
} from "@/lib/db/queries/append-only";
import { insertTask } from "@/lib/db/queries/tasks";
import {
  agentRuns,
  claimItems,
  claimParties,
  claims,
  notifications,
  parties,
  reserves,
} from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema/enums";
import {
  CompleteAssessmentSchema,
  ConfirmReserveSchema,
  RequestInfoSchema,
  SuggestReserveSchema,
  UpdateItemAssessmentSchema,
  ApproveSettlementSchema,
  CloseClaimSchema,
  DenyClaimSchema,
  IssuePaymentSchema,
  ProposeSettlementSchema,
} from "@/lib/schemas/financials";
import { getParameter } from "@/lib/rules/params";
import {
  approveSettlement,
  closeClaim,
  denyClaim,
  issuePayment,
  proposeSettlement,
} from "@/lib/settlement/service";
import {
  GuardFailedError,
  IllegalTransitionError,
  transitionClaim,
} from "@/lib/state-machine";

const ASSESSMENT_ROLES = [
  "adjuster",
  "supervisor",
  "admin",
] as const satisfies readonly UserRole[];

export type WorkbenchActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function actionError(error: unknown): WorkbenchActionResult<never> {
  if (error instanceof ZodError) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Validation failed" },
    };
  }
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } };
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
  }
  console.error("[workbench-action] error:", error);
  return {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  };
}

function revalidateWorkbench(claimId: string) {
  revalidatePath(`/claims/${claimId}`);
}

export async function suggestReserveAction(
  input: unknown,
): Promise<
  WorkbenchActionResult<{
    suggestion: Awaited<ReturnType<typeof runReserveAgent>>["suggestion"];
    agentRunId: string;
  }>
> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = SuggestReserveSchema.parse(input);
    const db = getDb();

    if (!(await canAccessClaim(db, user, parsed.claimId))) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }

    const { suggestion, agentRunId } = await runReserveAgent(db, parsed.claimId, {
      actor: `user:${user.id}`,
    });

    return { ok: true, data: { suggestion, agentRunId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function confirmReserveAction(
  input: unknown,
): Promise<
  WorkbenchActionResult<{ indemnityId: string; expenseId: string } | { approvalTaskId: string }>
> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = ConfirmReserveSchema.parse(input);
    const db = getDb();

    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, parsed.claimId))
      .limit(1);
    if (!claim) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
    }
    if (!canWriteClaim(user, { assignedTo: claim.assignedTo, siuReferred: claim.siuReferred })) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }

    const previous = await db
      .select()
      .from(reserves)
      .where(eq(reserves.claimId, parsed.claimId))
      .orderBy(desc(reserves.createdAt));
    const prevIndemnity = previous.find((row) => row.kind === "indemnity") ?? null;
    const prevExpense = previous.find((row) => row.kind === "expense") ?? null;
    const prevTotal =
      (prevIndemnity ? Number(prevIndemnity.amount) : 0) +
      (prevExpense ? Number(prevExpense.amount) : 0);

    const newIndemnity = Number(parsed.indemnityAmount);
    const newExpense = Number(parsed.expenseAmount);
    const newTotal = newIndemnity + newExpense;

    const approvalPct = Number(
      (await getParameter(db, "reserve.change_approval_pct")).valueJson,
    );
    const deltaPct =
      prevTotal > 0 ? (Math.abs(newTotal - prevTotal) / prevTotal) * 100 : 0;
    const needsApproval =
      prevTotal > 0 &&
      deltaPct > approvalPct &&
      user.role !== "supervisor" &&
      user.role !== "admin";

    if (needsApproval) {
      const task = await insertTask(db, {
        claimId: parsed.claimId,
        type: "assess_claim",
        queue: "supervision",
        priority: 4,
        assignedTo: null,
        payloadJson: {
          kind: "reserve_approval",
          proposedIndemnityAmount: parsed.indemnityAmount,
          proposedExpenseAmount: parsed.expenseAmount,
          previousIndemnityAmount: prevIndemnity?.amount ?? null,
          previousExpenseAmount: prevExpense?.amount ?? null,
          changePct: Number(deltaPct.toFixed(2)),
          requestedBy: user.id,
          ...(parsed.sourceAgentRunId
            ? { sourceAgentRunId: parsed.sourceAgentRunId }
            : {}),
        },
      });
      await insertAuditLog(db, {
        actor: `user:${user.id}`,
        action: "reserve_approval_requested",
        entity: "reserves",
        entityId: parsed.claimId,
        afterJson: {
          claimId: parsed.claimId,
          approvalTaskId: task.id,
          changePct: Number(deltaPct.toFixed(2)),
        },
      });
      revalidateWorkbench(parsed.claimId);
      return {
        ok: false,
        error: {
          code: "APPROVAL_REQUIRED",
          message: `Reserve change ${deltaPct.toFixed(1)}% exceeds the approval threshold; supervisor approval task ${task.id} created.`,
        },
      };
    }

    const source = parsed.sourceAgentRunId ? "agent_suggested" : "manual";
    const [indemnityRow] = await db
      .insert(reserves)
      .values({
        id: crypto.randomUUID(),
        claimId: parsed.claimId,
        kind: "indemnity",
        amount: parsed.indemnityAmount,
        setBy: user.id,
        source,
        supersedesId: prevIndemnity?.id ?? null,
      })
      .returning();
    const [expenseRow] = await db
      .insert(reserves)
      .values({
        id: crypto.randomUUID(),
        claimId: parsed.claimId,
        kind: "expense",
        amount: parsed.expenseAmount,
        setBy: user.id,
        source,
        supersedesId: prevExpense?.id ?? null,
      })
      .returning();

    if (parsed.sourceAgentRunId) {
      await updateAgentRunOutcome(db, parsed.sourceAgentRunId, "accepted");
    } else {
      const [latestSuggestion] = await db
        .select()
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.claimId, parsed.claimId),
            eq(agentRuns.agentId, "AGT-RESERVE"),
          ),
        )
        .orderBy(desc(agentRuns.createdAt))
        .limit(1);
      if (latestSuggestion && !latestSuggestion.outcome) {
        await updateAgentRunOutcome(db, latestSuggestion.id, "overridden");
      }
    }
    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "reserve_confirmed",
      entity: "reserves",
      entityId: parsed.claimId,
      afterJson: {
        claimId: parsed.claimId,
        indemnityAmount: parsed.indemnityAmount,
        expenseAmount: parsed.expenseAmount,
        source,
      },
    });

    revalidateWorkbench(parsed.claimId);
    return {
      ok: true,
      data: { indemnityId: indemnityRow.id, expenseId: expenseRow.id },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateItemAssessmentAction(
  input: unknown,
): Promise<WorkbenchActionResult<{ claimItemId: string }>> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = UpdateItemAssessmentSchema.parse(input);
    const db = getDb();

    const [item] = await db
      .select()
      .from(claimItems)
      .where(eq(claimItems.id, parsed.claimItemId))
      .limit(1);
    if (!item) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Claim item not found" } };
    }
    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, item.claimId))
      .limit(1);
    if (!claim) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
    }
    if (!canWriteClaim(user, { assignedTo: claim.assignedTo, siuReferred: claim.siuReferred })) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }

    await db
      .update(claimItems)
      .set({
        assessedAmount: parsed.assessedAmount ?? null,
        assessmentStatus: parsed.assessmentStatus,
        updatedAt: new Date(),
      })
      .where(eq(claimItems.id, parsed.claimItemId));

    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "item_assessed",
      entity: "claim_items",
      entityId: parsed.claimItemId,
      afterJson: {
        claimId: item.claimId,
        assessedAmount: parsed.assessedAmount ?? null,
        assessmentStatus: parsed.assessmentStatus,
      },
    });

    revalidateWorkbench(item.claimId);
    return { ok: true, data: { claimItemId: parsed.claimItemId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function requestInfoAction(
  input: unknown,
): Promise<WorkbenchActionResult<{ taskId: string }>> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = RequestInfoSchema.parse(input);
    const db = getDb();

    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, parsed.claimId))
      .limit(1);
    if (!claim) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
    }
    if (!canWriteClaim(user, { assignedTo: claim.assignedTo, siuReferred: claim.siuReferred })) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }
    if (claim.status !== "in_assessment") {
      return {
        ok: false,
        error: { code: "ILLEGAL_TRANSITION", message: "Info can only be requested while in assessment" },
      };
    }

    const task = await insertTask(db, {
      claimId: parsed.claimId,
      type: "request_info",
      queue: "adjusting",
      priority: 3,
      assignedTo: null,
      payloadJson: { kind: "info_request", note: parsed.note, requestedBy: user.id },
    });

    const [claimantLink] = await db
      .select({ userId: parties.userId })
      .from(claimParties)
      .innerJoin(parties, eq(parties.id, claimParties.partyId))
      .where(
        and(
          eq(claimParties.claimId, parsed.claimId),
          eq(claimParties.role, "claimant"),
        ),
      )
      .limit(1);
    if (claimantLink?.userId) {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: claimantLink.userId,
        claimId: parsed.claimId,
        taskId: task.id,
        kind: "info_requested",
        title: `More information needed for ${claim.claimNumber}`,
        bodyMd: parsed.note,
      });
    }

    try {
      await transitionClaim(db, {
        claimId: parsed.claimId,
        toStatus: "pending_info",
        actorId: user.id,
        reason: parsed.note.slice(0, 200),
        triggeredBy: "user",
      });
    } catch (error) {
      if (error instanceof GuardFailedError) {
        return {
          ok: false,
          error: { code: "GUARD_FAILED", message: error.message },
        };
      }
      if (error instanceof IllegalTransitionError) {
        return {
          ok: false,
          error: { code: "ILLEGAL_TRANSITION", message: error.message },
        };
      }
      throw error;
    }

    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "info_requested",
      entity: "claims",
      entityId: parsed.claimId,
      afterJson: { claimId: parsed.claimId, taskId: task.id },
    });

    revalidateWorkbench(parsed.claimId);
    return { ok: true, data: { taskId: task.id } };
  } catch (error) {
    return actionError(error);
  }
}

export async function completeAssessmentAction(
  input: unknown,
): Promise<WorkbenchActionResult<{ claimId: string }>> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = CompleteAssessmentSchema.parse(input);
    const db = getDb();

    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, parsed.claimId))
      .limit(1);
    if (!claim) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
    }
    if (!canWriteClaim(user, { assignedTo: claim.assignedTo, siuReferred: claim.siuReferred })) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }

    try {
      await transitionClaim(db, {
        claimId: parsed.claimId,
        toStatus: "in_settlement",
        actorId: user.id,
        reason: "Assessment complete",
        triggeredBy: "user",
      });
    } catch (error) {
      if (error instanceof GuardFailedError) {
        return {
          ok: false,
          error: {
            code: "GUARD_FAILED",
            message: error.details ? JSON.stringify(error.details) : error.message,
          },
        };
      }
      if (error instanceof IllegalTransitionError) {
        return {
          ok: false,
          error: { code: "ILLEGAL_TRANSITION", message: error.message },
        };
      }
      throw error;
    }

    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "assessment_completed",
      entity: "claims",
      entityId: parsed.claimId,
      afterJson: { claimId: parsed.claimId, toStatus: "in_settlement" },
    });

    revalidateWorkbench(parsed.claimId);
    return { ok: true, data: { claimId: parsed.claimId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function proposeSettlementAction(
  input: unknown,
): Promise<WorkbenchActionResult<{ settlementId: string; totalAmount: string }>> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = ProposeSettlementSchema.parse(input);
    const db = getDb();
    const result = await proposeSettlement(db, user, parsed);
    if (result.ok) {
      revalidateWorkbench(parsed.claimId);
      emitMaterialChange(db, parsed.claimId, "settlement_change").catch(() => {});
    }
    return result;
  } catch (error) {
    return actionError(error);
  }
}

export async function approveSettlementAction(
  input: unknown,
): Promise<
  WorkbenchActionResult<
    | { decision: "allowed"; claimId: string }
    | { decision: "routed"; taskId: string; message: string }
  >
> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = ApproveSettlementSchema.parse(input);
    const db = getDb();
    const result = await approveSettlement(db, user, parsed);
    if (result.ok || result.error.code === "SIU_HOLD") {
      revalidateWorkbench(parsed.claimId);
      emitMaterialChange(db, parsed.claimId, "settlement_change").catch(() => {});
    }
    return result;
  } catch (error) {
    return actionError(error);
  }
}

export async function issuePaymentAction(
  input: unknown,
): Promise<WorkbenchActionResult<{ paymentId: string; reference: string }>> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = IssuePaymentSchema.parse(input);
    const db = getDb();
    const result = await issuePayment(db, user, parsed);
    if (result.ok) {
      revalidateWorkbench(parsed.claimId);
      emitMaterialChange(db, parsed.claimId, "settlement_change").catch(() => {});
    }
    return result;
  } catch (error) {
    return actionError(error);
  }
}

export async function closeClaimAction(
  input: unknown,
): Promise<WorkbenchActionResult<{ claimId: string }>> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = CloseClaimSchema.parse(input);
    const db = getDb();
    const result = await closeClaim(db, user, parsed);
    if (result.ok) {
      revalidateWorkbench(parsed.claimId);
      emitMaterialChange(db, parsed.claimId, "state_change").catch(() => {});
    }
    return result;
  } catch (error) {
    return actionError(error);
  }
}

export async function denyClaimAction(
  input: unknown,
): Promise<WorkbenchActionResult<{ taskId: string }>> {
  try {
    const user = await requireRole(...ASSESSMENT_ROLES);
    const parsed = DenyClaimSchema.parse(input);
    const db = getDb();
    const result = await denyClaim(db, user, parsed);
    if (result.ok) {
      revalidateWorkbench(parsed.claimId);
      revalidatePath("/queue");
      emitMaterialChange(db, parsed.claimId, "state_change").catch(() => {});
    }
    return result;
  } catch (error) {
    return actionError(error);
  }
}

export async function regenerateSummaryAction(
  claimId: string,
): Promise<WorkbenchActionResult<{ agentRunId: string }>> {
  try {
    await requireRole(...ASSESSMENT_ROLES);
    const db = getDb();
    const { agentRunId } = await regenerateSummary(db, claimId, "manual");
    revalidateWorkbench(claimId);
    return { ok: true, data: { agentRunId } };
  } catch (error) {
    return actionError(error);
  }
}
