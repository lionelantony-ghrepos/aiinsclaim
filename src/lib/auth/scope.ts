import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { claimParties, claims, parties } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema/enums";
import { RulesWriteForbiddenError } from "./errors";
import type { SessionUser } from "./session";

const STAFF_ROLES = new Set<UserRole>([
  "intake_agent",
  "adjuster",
  "supervisor",
  "siu_analyst",
  "admin",
]);

export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.has(role);
}

/** Claimant self-scope: claim_parties → parties.user_id. Staff read is unfiltered. */
export function claimantClaimsFilter(user: SessionUser) {
  return eq(parties.userId, user.id);
}

export function staffClaimFilter(user: SessionUser) {
  if (isStaffRole(user.role)) {
    return undefined;
  }
  return claimantClaimsFilter(user);
}

export function assertCanWriteRules(user: SessionUser) {
  if (user.role !== "admin") {
    throw new RulesWriteForbiddenError();
  }
}

export async function canAccessClaim(
  user: SessionUser,
  claimId: string,
  db: Db = getDb(),
) {
  if (isStaffRole(user.role)) {
    return true;
  }

  const [row] = await db
    .select({ id: claims.id })
    .from(claims)
    .innerJoin(claimParties, eq(claimParties.claimId, claims.id))
    .innerJoin(parties, eq(parties.id, claimParties.partyId))
    .where(and(eq(claims.id, claimId), claimantClaimsFilter(user)))
    .limit(1);

  return Boolean(row);
}
