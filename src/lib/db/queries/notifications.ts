import { and, desc, eq } from "drizzle-orm";
import { canAccessClaim, isStaffRole } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";
import { notifications, users } from "@/lib/db/schema";

export async function listNotificationsForUser(db: Db, user: SessionUser) {
  if (isStaffRole(user.role)) {
    return db.select().from(notifications);
  }

  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id));
}

export async function listClaimCommsForUser(
  db: Db,
  user: SessionUser,
  claimId: string,
) {
  if (!(await canAccessClaim(db, user, claimId))) {
    throw new Error("FORBIDDEN");
  }
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.claimId, claimId),
        eq(notifications.userId, user.id),
        eq(notifications.kind, "comms"),
      ),
    )
    .orderBy(desc(notifications.createdAt));
}

export async function notifyAdminsOfAgentDisable(
  db: Db,
  values: {
    agentId: string;
    failureCount: number;
  },
) {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)));

  for (const admin of admins) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      userId: admin.id,
      kind: "agent_ops",
      title: `${values.agentId} disabled after repeated failures`,
      bodyMd: `${values.agentId} was disabled after ${values.failureCount} failed runs in the configured failure window. Manual review fallback is active.`,
    });
  }
}
