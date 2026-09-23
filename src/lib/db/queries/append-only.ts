import { eq } from "drizzle-orm";
import { AppendOnlyViolationError } from "@/lib/auth/errors";
import type { Db } from "@/lib/db/client";
import {
  agentRuns,
  auditLog,
  claimStateHistory,
  ruleAuditLog,
  type AgentRunOutcome,
  type AgentRunStatus,
  type ClaimStatus,
} from "@/lib/db/schema";

function rejectAppendOnly(table: string): never {
  throw new AppendOnlyViolationError(table);
}

export async function insertClaimStateHistory(
  db: Db,
  values: {
    id?: string;
    claimId: string;
    fromStatus?: ClaimStatus | null;
    toStatus: ClaimStatus;
    triggeredBy: string;
    actorId: string;
    reason?: string | null;
    ruleAuditId?: string | null;
  },
) {
  const [row] = await db
    .insert(claimStateHistory)
    .values({
      id: values.id ?? crypto.randomUUID(),
      claimId: values.claimId,
      fromStatus: values.fromStatus,
      toStatus: values.toStatus,
      triggeredBy: values.triggeredBy,
      actorId: values.actorId,
      reason: values.reason,
      ruleAuditId: values.ruleAuditId,
    })
    .returning();
  return row;
}

export function updateClaimStateHistory(): never {
  return rejectAppendOnly("claim_state_history");
}

export function deleteClaimStateHistory(): never {
  return rejectAppendOnly("claim_state_history");
}

export async function insertRuleAuditLog(
  db: Db,
  values: {
    id?: string;
    versionId: string;
    claimId?: string | null;
    inputsJson: Record<string, unknown>;
    outputsJson: Record<string, unknown>;
    matchedRuleIds: string[];
    actor: string;
    evaluatedAt?: Date;
  },
) {
  const [row] = await db
    .insert(ruleAuditLog)
    .values({
      id: values.id ?? crypto.randomUUID(),
      versionId: values.versionId,
      claimId: values.claimId,
      inputsJson: values.inputsJson,
      outputsJson: values.outputsJson,
      matchedRuleIds: values.matchedRuleIds,
      actor: values.actor,
      evaluatedAt: values.evaluatedAt,
    })
    .returning();
  return row;
}

export function updateRuleAuditLog(): never {
  return rejectAppendOnly("rule_audit_log");
}

export function deleteRuleAuditLog(): never {
  return rejectAppendOnly("rule_audit_log");
}

export async function insertAgentRun(
  db: Db,
  values: {
    id?: string;
    agentId: string;
    claimId?: string | null;
    documentId?: string | null;
    promptVersion?: string | null;
    model?: string | null;
    inputJson?: Record<string, unknown> | null;
    outputJson?: Record<string, unknown> | null;
    confidence?: string | null;
    status: AgentRunStatus;
    latencyMs?: number | null;
    outcome?: AgentRunOutcome | null;
  },
) {
  const [row] = await db
    .insert(agentRuns)
    .values({
      id: values.id ?? crypto.randomUUID(),
      agentId: values.agentId,
      claimId: values.claimId,
      documentId: values.documentId,
      promptVersion: values.promptVersion,
      model: values.model,
      inputJson: values.inputJson,
      outputJson: values.outputJson,
      confidence: values.confidence,
      status: values.status,
      latencyMs: values.latencyMs,
      outcome: values.outcome,
    })
    .returning();
  return row;
}

export function updateAgentRun(): never {
  return rejectAppendOnly("agent_runs");
}

/** HITL resolution may record accepted/overridden on the originating agent run. */
export async function updateAgentRunOutcome(
  db: Db,
  id: string,
  outcome: AgentRunOutcome,
) {
  const [row] = await db
    .update(agentRuns)
    .set({ outcome })
    .where(eq(agentRuns.id, id))
    .returning();
  return row ?? null;
}

export function deleteAgentRun(): never {
  return rejectAppendOnly("agent_runs");
}

export async function insertAuditLog(
  db: Db,
  values: {
    id?: string;
    actor: string;
    action: string;
    entity: string;
    entityId: string;
    beforeJson?: Record<string, unknown> | null;
    afterJson?: Record<string, unknown> | null;
    at?: Date;
  },
) {
  const [row] = await db
    .insert(auditLog)
    .values({
      id: values.id ?? crypto.randomUUID(),
      actor: values.actor,
      action: values.action,
      entity: values.entity,
      entityId: values.entityId,
      beforeJson: values.beforeJson,
      afterJson: values.afterJson,
      at: values.at,
    })
    .returning();
  return row;
}

export function updateAuditLog(): never {
  return rejectAppendOnly("audit_log");
}

export function deleteAuditLog(): never {
  return rejectAppendOnly("audit_log");
}
