import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
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

export function assertCanWriteRules(user: SessionUser) {
  if (user.role !== "admin") {
    throw new RulesWriteForbiddenError();
  }
}

type ClaimWriteFields = {
  assignedTo: string | null;
  siuReferred: boolean;
};

/** Staff writes: admin/supervisor all; adjuster/intake assigned; SIU referred claims. */
export function canWriteClaim(user: SessionUser, claim: ClaimWriteFields) {
  switch (user.role) {
    case "admin":
    case "supervisor":
      return true;
    case "adjuster":
    case "intake_agent":
      return claim.assignedTo === user.id;
    case "siu_analyst":
      return claim.siuReferred;
    default:
      return false;
  }
}

export async function canAccessClaim(
  db: Db,
  user: SessionUser,
  claimId: string,
) {
  if (isStaffRole(user.role)) {
    const [row] = await db
      .select({ id: claims.id })
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);
    return Boolean(row);
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
