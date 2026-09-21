import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db";
import type { UserRole } from "@/lib/db/schema";
import {
  claimParties,
  claims,
  parties,
  policies,
  users,
} from "@/lib/db/schema";

export function sessionUser(
  id: string,
  role: UserRole,
  extras?: Partial<SessionUser>,
): SessionUser {
  return {
    id,
    email: extras?.email ?? `${id}@test.local`,
    displayName: extras?.displayName ?? id,
    role,
    authorityLevel: extras?.authorityLevel ?? 0,
  };
}

export async function insertMinimalClaim(db: Db) {
  const now = new Date();
  const partyId = crypto.randomUUID();
  const policyId = crypto.randomUUID();
  const claimId = crypto.randomUUID();

  await db.insert(parties).values({
    id: partyId,
    partyType: "person",
    fullName: "Fixture Party",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(policies).values({
    id: policyId,
    policyNumber: `POL-${policyId}`,
    holderPartyId: partyId,
    lineOfBusiness: "auto",
    status: "active",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    coverageJson: {},
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(claims).values({
    id: claimId,
    claimNumber: `CLM-2026-${claimId.replaceAll("-", "").slice(0, 6)}`,
    policyId,
    lineOfBusiness: "auto",
    claimType: "collision",
    status: "draft",
    incidentAt: now,
    reportedAt: now,
    estimatedAmount: "100.00",
    createdAt: now,
    updatedAt: now,
  });

  return { claimId, policyId, partyId };
}

export async function seedTwoClaimantClaims(db: Db) {
  const now = new Date();
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const partyAId = crypto.randomUUID();
  const partyBId = crypto.randomUUID();
  const policyAId = crypto.randomUUID();
  const policyBId = crypto.randomUUID();
  const claimAId = crypto.randomUUID();
  const claimBId = crypto.randomUUID();

  await db.insert(users).values([
    {
      id: userAId,
      email: `a-${userAId}@test.local`,
      passwordHash: "x",
      displayName: "Claimant A",
      role: "claimant",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: userBId,
      email: `b-${userBId}@test.local`,
      passwordHash: "x",
      displayName: "Claimant B",
      role: "claimant",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(parties).values([
    {
      id: partyAId,
      partyType: "person",
      fullName: "Party A",
      userId: userAId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: partyBId,
      partyType: "person",
      fullName: "Party B",
      userId: userBId,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(policies).values([
    {
      id: policyAId,
      policyNumber: `POL-A-${policyAId}`,
      holderPartyId: partyAId,
      lineOfBusiness: "auto",
      status: "active",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      coverageJson: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      id: policyBId,
      policyNumber: `POL-B-${policyBId}`,
      holderPartyId: partyBId,
      lineOfBusiness: "property",
      status: "active",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      coverageJson: {},
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(claims).values([
    {
      id: claimAId,
      claimNumber: `CLM-2026-A${claimAId.replaceAll("-", "").slice(0, 5)}`,
      policyId: policyAId,
      lineOfBusiness: "auto",
      claimType: "collision",
      status: "submitted",
      incidentAt: now,
      reportedAt: now,
      estimatedAmount: "100.00",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: claimBId,
      claimNumber: `CLM-2026-B${claimBId.replaceAll("-", "").slice(0, 5)}`,
      policyId: policyBId,
      lineOfBusiness: "property",
      claimType: "water_damage",
      status: "submitted",
      incidentAt: now,
      reportedAt: now,
      estimatedAmount: "100.00",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(claimParties).values([
    {
      id: crypto.randomUUID(),
      claimId: claimAId,
      partyId: partyAId,
      role: "claimant",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      claimId: claimBId,
      partyId: partyBId,
      role: "claimant",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  return {
    userA: sessionUser(userAId, "claimant", { displayName: "Claimant A" }),
    userB: sessionUser(userBId, "claimant", { displayName: "Claimant B" }),
    claimAId,
    claimBId,
    adjuster: sessionUser(crypto.randomUUID(), "adjuster", {
      displayName: "Adjuster",
    }),
  };
}
