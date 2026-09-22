import { and, eq } from "drizzle-orm";
import { claimantClaimsFilter, isStaffRole } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";
import { claimParties, claims, parties } from "@/lib/db/schema";

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export async function listClaimsForUser(db: Db, user: SessionUser) {
  if (isStaffRole(user.role)) {
    return db.select().from(claims);
  }

  const rows = await db
    .select({ claim: claims })
    .from(claims)
    .innerJoin(claimParties, eq(claimParties.claimId, claims.id))
    .innerJoin(parties, eq(parties.id, claimParties.partyId))
    .where(claimantClaimsFilter(user));

  return uniqueById(rows.map((row) => row.claim));
}

export async function getClaimForUser(
  db: Db,
  user: SessionUser,
  claimId: string,
) {
  if (isStaffRole(user.role)) {
    const [row] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);
    return row ?? null;
  }

  const [row] = await db
    .select({ claim: claims })
    .from(claims)
    .innerJoin(claimParties, eq(claimParties.claimId, claims.id))
    .innerJoin(parties, eq(parties.id, claimParties.partyId))
    .where(and(eq(claims.id, claimId), claimantClaimsFilter(user)))
    .limit(1);

  return row?.claim ?? null;
}
