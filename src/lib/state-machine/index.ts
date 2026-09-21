import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { insertClaimStateHistory } from "@/lib/db/queries/append-only";
import {
  claimTransitions,
  claims,
  type ClaimStatus,
  type TriggeredBy,
} from "@/lib/db/schema";
import { isNonTerminalStatus } from "./completeness";
import { GuardFailedError, IllegalTransitionError } from "./errors";
import { runGuard, type GuardContext } from "./guards";

export {
  evaluateFnolCompleteness,
  evaluateSettlementCompleteness,
  isNonTerminalStatus,
  NON_TERMINAL_STATUSES,
} from "./completeness";
export {
  GuardFailedError,
  IllegalTransitionError,
  type MissingRequirement,
} from "./errors";
export { isKnownGuard, runGuard, type GuardContext } from "./guards";

export type TransitionClaimParams = {
  claimId: string;
  toStatus: ClaimStatus;
  actorId: string;
  reason: string;
  triggeredBy?: TriggeredBy;
  guardContext?: GuardContext;
};

export type TransitionClaimResult = {
  claimId: string;
  fromStatus: ClaimStatus;
  toStatus: ClaimStatus;
  historyId: string;
  ruleAuditId?: string;
};

async function findEnabledTransition(
  db: Db,
  fromStatus: ClaimStatus,
  toStatus: ClaimStatus,
) {
  const [exact] = await db
    .select()
    .from(claimTransitions)
    .where(
      and(
        eq(claimTransitions.fromStatus, fromStatus),
        eq(claimTransitions.toStatus, toStatus),
        eq(claimTransitions.enabled, true),
      ),
    )
    .limit(1);

  if (exact) {
    return exact;
  }

  if (isNonTerminalStatus(fromStatus)) {
    const [wildcard] = await db
      .select()
      .from(claimTransitions)
      .where(
        and(
          eq(claimTransitions.fromStatus, "*"),
          eq(claimTransitions.toStatus, toStatus),
          eq(claimTransitions.enabled, true),
        ),
      )
      .limit(1);
    return wildcard ?? null;
  }

  return null;
}

export async function transitionClaim(
  db: Db,
  params: TransitionClaimParams,
): Promise<TransitionClaimResult> {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, params.claimId))
    .limit(1);

  if (!claim) {
    throw new Error(`Claim not found: ${params.claimId}`);
  }

  const fromStatus = claim.status;
  const transition = await findEnabledTransition(db, fromStatus, params.toStatus);

  if (!transition) {
    throw new IllegalTransitionError(fromStatus, params.toStatus);
  }

  let ruleAuditId: string | undefined;
  if (transition.guardCode) {
    try {
      const guardResult = await runGuard(
        db,
        transition.guardCode,
        params.claimId,
        {
          ...params.guardContext,
          actor: params.guardContext?.actor ?? params.actorId,
        },
      );
      ruleAuditId = guardResult.ruleAuditId;
    } catch (error) {
      if (error instanceof GuardFailedError) {
        throw error;
      }
      throw error;
    }
  }

  const now = new Date();
  await db
    .update(claims)
    .set({ status: params.toStatus, updatedAt: now })
    .where(eq(claims.id, params.claimId));

  const history = await insertClaimStateHistory(db, {
    claimId: params.claimId,
    fromStatus,
    toStatus: params.toStatus,
    triggeredBy: params.triggeredBy ?? "user",
    actorId: params.actorId,
    reason: params.reason,
    ruleAuditId: ruleAuditId ?? null,
  });

  return {
    claimId: params.claimId,
    fromStatus,
    toStatus: params.toStatus,
    historyId: history.id,
    ruleAuditId,
  };
}
