"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { canAccessClaim, canWriteClaim } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { runReserveAgent } from "@/lib/agents/reserve";
import { runCommsAgent } from "@/lib/agents/comms";
import { emitMaterialChange, regenerateSummary } from "@/lib/agents/summary";
import { getDb } from "@/lib/db";
import {
  insertAuditLog,
  updateAgentRunOutcome,
} from "@/lib/db/queries/append-only";
import { listClaimCommsForUser } from "@/lib/db/queries/notifications";
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
import {
  COMMS_TEMPLATES,
  CommsAgentInputSchema,
  CommsAgentOutputSchema,
  CommsDraftRequestSchema,
  CommsSendSchema,
  CommsUpdateDraftSchema,
  type CommsDraftType,
} from "@/lib/schemas/agents/comms";
import {
  DENIAL_REASON_CODES,
  DenialReasonCodesSchema,
} from "@/lib/schemas/denial";
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
  if (error instanceof Error && error.message === "VALIDATION_FAILED") {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Validation failed" },
    };
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

const COMMS_ROLES = [
  "intake_agent",
  "adjuster",
  "supervisor",
  "siu_analyst",
  "admin",
] as const satisfies readonly UserRole[];

function commsTemplate(
  templateId: string,
  draftType: "acknowledgement" | "information_request" | "decision_letter",
) {
  const template = COMMS_TEMPLATES.find(
    (candidate) =>
      candidate.id === templateId && candidate.draftType === draftType,
  );
  if (!template) {
    throw new Error("VALIDATION_FAILED");
  }
  return {
    templateId: template.id,
    subject: `${template.label} for staff review`,
    bodyMd: `${template.label} approved template for staff review.`,
    context: { locale: "en-US" },
  };
}

async function findCommsAgentRun(
  db: ReturnType<typeof getDb>,
  agentRunId: string,
  claimId: string,
) {
  const [run] = await db
    .select({
      id: agentRuns.id,
      claimId: agentRuns.claimId,
      agentId: agentRuns.agentId,
      inputJson: agentRuns.inputJson,
      outputJson: agentRuns.outputJson,
      outcome: agentRuns.outcome,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.id, agentRunId),
        eq(agentRuns.claimId, claimId),
        eq(agentRuns.agentId, "AGT-COMMS"),
      ),
    )
    .limit(1);
  return run ?? null;
}

async function getConfiguredDenialCodes(db: ReturnType<typeof getDb>) {
  const parameter = await getParameter(db, "denial.reason_codes");
  const parsed = DenialReasonCodesSchema.safeParse(parameter.valueJson);
  return parsed.success ? parsed.data : [...DENIAL_REASON_CODES];
}

function parseDraftType(value: string | null): CommsDraftType | null {
  const result = CommsUpdateDraftSchema.shape.draftType.safeParse(value);
  return result.success ? result.data : null;
}

function assertDecisionLetterBody(
  draftType: CommsDraftType,
  bodyMd: string,
  denialReasonCode: string | null,
  configuredCodes: string[],
) {
  if (draftType !== "decision_letter") return;
  if (
    !denialReasonCode ||
    !configuredCodes.includes(denialReasonCode) ||
    !bodyMd.includes(denialReasonCode)
  ) {
    throw new Error("VALIDATION_FAILED");
  }
}

function parseRunProvenance(
  sourceRun: Awaited<ReturnType<typeof findCommsAgentRun>>,
) {
  if (!sourceRun) return null;
  const input = CommsAgentInputSchema.safeParse(sourceRun.inputJson);
  const output = CommsAgentOutputSchema.safeParse(sourceRun.outputJson);
  if (!input.success || !output.success) return null;
  const template = COMMS_TEMPLATES.find(
    (candidate) =>
      candidate.id === input.data.template.templateId &&
      candidate.draftType === input.data.draftType,
  );
  if (!template) return null;
  return {
    draftType: input.data.draftType,
    templateId: template.id,
    denialReasonCode: input.data.claimFacts.denialReasonCode,
  };
}

export async function draftCommunication(
  input: unknown,
): Promise<WorkbenchActionResult<Awaited<ReturnType<typeof runCommsAgent>>["output"] & {
  draftType: CommsDraftType;
  agentRunId: string;
  agentFailed: boolean;
}>> {
  try {
    const user = await requireRole(...COMMS_ROLES);
    const parsed = CommsDraftRequestSchema.parse(input);
    const db = getDb();
    if (!(await canAccessClaim(db, user, parsed.claimId))) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }
    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, parsed.claimId))
      .limit(1);
    if (!claim) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
    }
    const template = commsTemplate(parsed.templateId, parsed.draftType);
    const configuredDenialCodes = await getConfiguredDenialCodes(db);
    const denialReasonCode =
      claim.denialReasonCode && configuredDenialCodes.includes(claim.denialReasonCode)
        ? claim.denialReasonCode
        : null;
    if (parsed.draftType === "decision_letter" && !denialReasonCode) {
      return {
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "A coded denial reason is required." },
      };
    }
    const agentInput = CommsAgentInputSchema.parse({
      draftType: parsed.draftType,
      claimFacts: {
        claimNumber: claim.claimNumber,
        claimId: claim.id,
        lineOfBusiness: claim.lineOfBusiness,
        claimType: claim.claimType,
        denialReasonCode,
      },
      claimSummaryMd: claim.summaryMd ?? "",
      template,
      context: template.context,
      tone: parsed.tone,
      readingLevel: parsed.readingLevel,
    });
    const result = await runCommsAgent(db, agentInput);
    return {
      ok: true,
      data: {
        ...result.output,
        draftType: parsed.draftType,
        agentRunId: result.agentRunId,
        agentFailed: result.agentFailed,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCommunicationDraft(
  input: unknown,
): Promise<WorkbenchActionResult<{ outboxId: string }>> {
  try {
    const user = await requireRole(...COMMS_ROLES);
    const parsed = CommsUpdateDraftSchema.parse(input);
    const db = getDb();
    const rows = await listClaimCommsForUser(db, user, parsed.claimId);
    const existing = parsed.outboxId
      ? rows.find((row) => row.id === parsed.outboxId)
      : undefined;
    if (existing && existing.deliveryStatus !== "draft") {
      return { ok: false, error: { code: "CONFLICT", message: "Sent communications cannot be edited" } };
    }
    const template = commsTemplate(parsed.templateId, parsed.draftType);
    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, parsed.claimId))
      .limit(1);
    if (!claim) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
    }
    const denialCodes = await getConfiguredDenialCodes(db);
    const storedDraftType = existing ? parseDraftType(existing.draftType) : null;
    if (existing && existing.draftType !== null && !storedDraftType) {
      throw new Error("VALIDATION_FAILED");
    }
    if (storedDraftType && storedDraftType !== parsed.draftType) {
      throw new Error("VALIDATION_FAILED");
    }
    if (existing?.templateId && existing.templateId !== template.templateId) {
      throw new Error("VALIDATION_FAILED");
    }
    const outboxId = existing?.id ?? crypto.randomUUID();
    const agentRunId = existing?.agentRunId ?? parsed.agentRunId ?? null;
    if (agentRunId) {
      const sourceRun = await findCommsAgentRun(db, agentRunId, parsed.claimId);
      const provenance = parseRunProvenance(sourceRun);
      if (
        !provenance ||
        provenance.draftType !== parsed.draftType ||
        provenance.templateId !== template.templateId
      ) {
        return {
          ok: false,
          error: { code: "VALIDATION_FAILED", message: "Invalid communication draft provenance" },
        };
      }
    }
    assertDecisionLetterBody(
      parsed.draftType,
      parsed.bodyMd,
      claim.denialReasonCode,
      denialCodes,
    );
    if (existing) {
      await db
        .update(notifications)
        .set({
          title: parsed.subject,
          bodyMd: parsed.bodyMd,
          draftType: parsed.draftType,
          templateId: template.templateId,
          agentRunId,
        })
        .where(and(eq(notifications.id, outboxId), eq(notifications.userId, user.id)));
      if (
        agentRunId &&
        (existing.title !== parsed.subject || existing.bodyMd !== parsed.bodyMd)
      ) {
        await updateAgentRunOutcome(db, agentRunId, "overridden");
      }
    } else {
      await db.insert(notifications).values({
        id: outboxId,
        userId: user.id,
        claimId: parsed.claimId,
        kind: "comms",
        title: parsed.subject,
        bodyMd: parsed.bodyMd,
        deliveryStatus: "draft",
        draftType: parsed.draftType,
        templateId: template.templateId,
        agentRunId,
      });
      if (agentRunId) {
        const sourceRun = await findCommsAgentRun(db, agentRunId, parsed.claimId);
        const generatedSubject =
          typeof sourceRun?.outputJson?.subject === "string"
            ? sourceRun.outputJson.subject
            : null;
        const generatedBody =
          typeof sourceRun?.outputJson?.bodyMd === "string"
            ? sourceRun.outputJson.bodyMd
            : null;
        if (
          sourceRun &&
          (generatedSubject !== parsed.subject || generatedBody !== parsed.bodyMd)
        ) {
          await updateAgentRunOutcome(db, agentRunId, "overridden");
        }
      }
    }
    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "communication_draft_saved",
      entity: "notifications",
      entityId: outboxId,
      afterJson: { claimId: parsed.claimId, templateId: parsed.templateId },
    });
    revalidateWorkbench(parsed.claimId);
    return { ok: true, data: { outboxId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function sendMockCommunication(
  input: unknown,
): Promise<WorkbenchActionResult<{ outboxId: string }>> {
  try {
    const user = await requireRole(...COMMS_ROLES);
    const parsed = CommsSendSchema.parse(input);
    const db = getDb();
    const rows = await listClaimCommsForUser(db, user, parsed.claimId);
    const existing = rows.find((row) => row.id === parsed.outboxId);
    if (!existing) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Draft not found" } };
    }
    if (existing.deliveryStatus !== "draft") {
      return { ok: false, error: { code: "CONFLICT", message: "Communication was already sent" } };
    }
    const draftType = parseDraftType(existing.draftType);
    if (!draftType || !existing.templateId) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Untyped communication drafts cannot be sent",
        },
      };
    }
    const template = commsTemplate(existing.templateId, draftType);
    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, parsed.claimId))
      .limit(1);
    if (!claim) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Claim not found" } };
    }
    const denialCodes = await getConfiguredDenialCodes(db);
    assertDecisionLetterBody(
      draftType,
      existing.bodyMd,
      claim.denialReasonCode,
      denialCodes,
    );
    if (existing.agentRunId) {
      const sourceRun = await findCommsAgentRun(
        db,
        existing.agentRunId,
        parsed.claimId,
      );
      const provenance = parseRunProvenance(sourceRun);
      if (
        !provenance ||
        provenance.draftType !== draftType ||
        provenance.templateId !== template.templateId
      ) {
        return {
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Invalid communication draft provenance",
          },
        };
      }
    }
    await db
      .update(notifications)
      .set({ deliveryStatus: "mock_sent" })
      .where(and(eq(notifications.id, parsed.outboxId), eq(notifications.userId, user.id)));
    if (existing.agentRunId) {
      const sourceRun = await findCommsAgentRun(
        db,
        existing.agentRunId,
        parsed.claimId,
      );
      const generatedSubject =
        typeof sourceRun.outputJson?.subject === "string"
          ? sourceRun.outputJson.subject
          : null;
      const generatedBody =
        typeof sourceRun.outputJson?.bodyMd === "string"
          ? sourceRun.outputJson.bodyMd
          : null;
      const unchanged =
        generatedSubject === existing.title && generatedBody === existing.bodyMd;
      if (unchanged) {
        await updateAgentRunOutcome(db, existing.agentRunId, "accepted");
      } else if (sourceRun.outcome !== "overridden") {
        await updateAgentRunOutcome(db, existing.agentRunId, "overridden");
      }
    }
    await insertAuditLog(db, {
      actor: `user:${user.id}`,
      action: "communication_mock_sent",
      entity: "notifications",
      entityId: parsed.outboxId,
      afterJson: { claimId: parsed.claimId },
    });
    revalidateWorkbench(parsed.claimId);
    return { ok: true, data: { outboxId: parsed.outboxId } };
  } catch (error) {
    return actionError(error);
  }
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
    emitMaterialChange(db, parsed.claimId, "reserve_change").catch(() => {});
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
        deliveryStatus: "not_applicable",
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
    emitMaterialChange(db, parsed.claimId, "state_change").catch(() => {});
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
): Promise<WorkbenchActionResult<{ agentRunId: string; agentFailed: boolean }>> {
  try {
    await requireRole(
      "intake_agent",
      "adjuster",
      "supervisor",
      "siu_analyst",
      "admin",
    );
    const db = getDb();
    const { agentRunId, agentFailed } = await regenerateSummary(db, claimId, "manual");
    revalidateWorkbench(claimId);
    return { ok: true, data: { agentRunId, agentFailed } };
  } catch (error) {
    return actionError(error);
  }
}
