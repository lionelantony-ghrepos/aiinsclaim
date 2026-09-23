import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import {
  claimItems,
  claimParties,
  claims,
  parties,
  policies,
  users,
  type ClaimStatus,
  type UserRole,
} from "@/lib/db/schema";

export async function insertStaffUser(
  db: Db,
  opts: {
    role: UserRole;
    authorityLevel: number;
    email?: string;
  },
): Promise<SessionUser> {
  const now = new Date();
  const id = crypto.randomUUID();
  const email = opts.email ?? `${opts.role}-${id.slice(0, 8)}@test.local`;
  await db.insert(users).values({
    id,
    email,
    passwordHash: "x",
    displayName: `Test ${opts.role}`,
    role: opts.role,
    authorityLevel: opts.authorityLevel,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    email,
    displayName: `Test ${opts.role}`,
    role: opts.role,
    authorityLevel: opts.authorityLevel,
  };
}

export async function insertSettlementClaim(
  db: Db,
  overrides?: Partial<{
    status: ClaimStatus;
    estimatedAmount: string;
    siuReferred: boolean;
    siuDisposition: "open" | "cleared" | "confirmed_fraud" | null;
    assignedTo: string | null;
  }>,
) {
  const now = new Date();
  const claimantUserId = crypto.randomUUID();
  const partyId = crypto.randomUUID();
  const policyId = crypto.randomUUID();
  const claimId = crypto.randomUUID();
  const itemId = crypto.randomUUID();

  await db.insert(users).values({
    id: claimantUserId,
    email: `claimant-${claimId.slice(0, 8)}@test.local`,
    passwordHash: "x",
    displayName: "Settlement Claimant",
    role: "claimant",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(parties).values({
    id: partyId,
    partyType: "person",
    fullName: "Settlement Claimant",
    userId: claimantUserId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(policies).values({
    id: policyId,
    policyNumber: `POL-${policyId.slice(0, 8)}`,
    holderPartyId: partyId,
    lineOfBusiness: "auto",
    status: "active",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    coverageJson: { collision: { limit: 50000, deductible: 500 } },
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(claims).values({
    id: claimId,
    claimNumber: `CLM-2026-${claimId.replaceAll("-", "").slice(0, 6)}`,
    policyId,
    lineOfBusiness: "auto",
    claimType: "collision",
    status: overrides?.status ?? "in_settlement",
    incidentAt: now,
    reportedAt: now,
    incidentDescription: "Settlement fixture collision",
    estimatedAmount: overrides?.estimatedAmount ?? "32000.00",
    assignedTo: overrides?.assignedTo ?? null,
    siuReferred: overrides?.siuReferred ?? false,
    siuDisposition: overrides?.siuDisposition ?? null,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(claimParties).values({
    id: crypto.randomUUID(),
    claimId,
    partyId,
    role: "claimant",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(claimItems).values({
    id: itemId,
    claimId,
    itemType: "vehicle",
    description: "Damaged vehicle",
    assessedAmount: overrides?.estimatedAmount ?? "32000.00",
    assessmentStatus: "assessed",
    createdAt: now,
    updatedAt: now,
  });

  return {
    claimId,
    partyId,
    itemId,
    claimantUserId,
    now,
  };
}

export async function setClaimStatus(
  db: Db,
  claimId: string,
  status: ClaimStatus,
) {
  await db
    .update(claims)
    .set({ status, updatedAt: new Date() })
    .where(eq(claims.id, claimId));
}
