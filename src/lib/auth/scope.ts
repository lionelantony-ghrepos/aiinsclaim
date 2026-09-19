import { and, eq, or } from "drizzle-orm";
import { claimParties, claims, parties } from "@/lib/db/schema";
import type { SessionUser } from "./session";
import { getDb } from "@/lib/db";

const STAFF_ROLES = new Set([
  "intake_agent",
  "adjuster",
  "supervisor",
  "siu_analyst",
  "admin",
]);

export async function canAccessClaim(user: SessionUser, claimId: string) {
  if (user.role === "admin") return true;
  if (STAFF_ROLES.has(user.role)) return true;

  const db = getDb();
  const [row] = await db
    .select({ id: claims.id })
    .from(claims)
    .innerJoin(claimParties, eq(claimParties.claimId, claims.id))
    .innerJoin(parties, eq(parties.id, claimParties.partyId))
    .where(and(eq(claims.id, claimId), eq(parties.userId, user.id)))
    .limit(1);

  return Boolean(row);
}

export function staffClaimFilter(user: SessionUser) {
  if (user.role === "admin" || STAFF_ROLES.has(user.role)) {
    return undefined;
  }

  return or(eq(parties.userId, user.id));
}
