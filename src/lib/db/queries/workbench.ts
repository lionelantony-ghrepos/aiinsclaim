import { asc, desc, eq } from "drizzle-orm";
import { canAccessClaim, queuesForRole } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";
import {
  agentRuns,
  claimItems,
  claimStateHistory,
  policies,
  claims,
  reserves,
  tasks,
} from "@/lib/db/schema";
import { getClaimForUser } from "./claims";

async function assertClaimAccess(db: Db, user: SessionUser, claimId: string) {
  const allowed = await canAccessClaim(db, user, claimId);
  if (!allowed) {
    throw new Error("FORBIDDEN");
  }
}

export async function getWorkbenchClaim(db: Db, user: SessionUser, claimId: string) {
  const claim = await getClaimForUser(db, user, claimId);
  if (!claim) {
    return null;
  }
  const [policy] = await db
    .select()
    .from(policies)
    .where(eq(policies.id, claim.policyId))
    .limit(1);
  return { claim, policy: policy ?? null };
}

export async function listClaimItems(db: Db, user: SessionUser, claimId: string) {
  await assertClaimAccess(db, user, claimId);
  return db
    .select()
    .from(claimItems)
    .where(eq(claimItems.claimId, claimId))
    .orderBy(asc(claimItems.createdAt));
}

export async function listReserves(db: Db, user: SessionUser, claimId: string) {
  await assertClaimAccess(db, user, claimId);
  return db
    .select()
    .from(reserves)
    .where(eq(reserves.claimId, claimId))
    .orderBy(desc(reserves.createdAt));
}

export async function getLatestReserves(db: Db, user: SessionUser, claimId: string) {
  const rows = await listReserves(db, user, claimId);
  const indemnity = rows.find((row) => row.kind === "indemnity") ?? null;
  const expense = rows.find((row) => row.kind === "expense") ?? null;
  return { indemnity, expense };
}

export async function listClaimTasks(db: Db, user: SessionUser, claimId: string) {
  await assertClaimAccess(db, user, claimId);
  const allowedQueues = new Set(queuesForRole(user.role));
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.claimId, claimId))
    .orderBy(desc(tasks.createdAt));
  return rows.filter((row) => allowedQueues.has(row.queue));
}

export async function listClaimHistory(db: Db, user: SessionUser, claimId: string) {
  await assertClaimAccess(db, user, claimId);
  return db
    .select()
    .from(claimStateHistory)
    .where(eq(claimStateHistory.claimId, claimId))
    .orderBy(asc(claimStateHistory.createdAt));
}

export async function listClaimAgentRuns(db: Db, user: SessionUser, claimId: string) {
  await assertClaimAccess(db, user, claimId);
  return db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.claimId, claimId))
    .orderBy(asc(agentRuns.createdAt));
}

export async function getClaimPolicy(db: Db, user: SessionUser, claimId: string) {
  const workbench = await getWorkbenchClaim(db, user, claimId);
  return workbench?.policy ?? null;
}

export type WorkbenchClaimRow = NonNullable<
  Awaited<ReturnType<typeof getWorkbenchClaim>>
>["claim"];

export async function getClaimWriteContext(
  db: Db,
  user: SessionUser,
  claimId: string,
) {
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);
  return claim ?? null;
}
