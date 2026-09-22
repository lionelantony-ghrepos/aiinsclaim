import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import type { ClaimStatus } from "@/lib/db/schema";
import {
  claimItems,
  claimParties,
  claims,
  documents,
  parties,
  payments,
  policies,
  reserves,
  tasks,
  users,
} from "@/lib/db/schema";

export async function insertBaseClaim(
  db: Db,
  overrides?: Partial<{
    status: ClaimStatus;
    claimType: "collision" | "glass" | "theft";
    lineOfBusiness: "auto" | "property";
    estimatedAmount: string;
    incidentDescription: string | null;
    route: "green_lane" | "standard" | "complex" | "supervisor" | null;
    denialReasonCode: string | null;
  }>,
) {
  const now = new Date();
  const partyId = crypto.randomUUID();
  const policyId = crypto.randomUUID();
  const claimId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  await db.insert(users).values({
    id: userId,
    email: `user-${userId.slice(0, 8)}@test.local`,
    passwordHash: "x",
    displayName: "Test User",
    role: "claimant",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(parties).values({
    id: partyId,
    partyType: "person",
    fullName: "Test Claimant",
    userId,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(policies).values({
    id: policyId,
    policyNumber: `POL-${policyId.slice(0, 8)}`,
    holderPartyId: partyId,
    lineOfBusiness: overrides?.lineOfBusiness ?? "auto",
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
    lineOfBusiness: overrides?.lineOfBusiness ?? "auto",
    claimType: overrides?.claimType ?? "collision",
    status: overrides?.status ?? "draft",
    incidentAt: now,
    reportedAt: now,
    incidentDescription: overrides?.incidentDescription ?? null,
    estimatedAmount: overrides?.estimatedAmount ?? "5000.00",
    severityScore: 20,
    complexityScore: 15,
    route: overrides?.route ?? null,
    denialReasonCode: overrides?.denialReasonCode ?? null,
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

  return { claimId, policyId, partyId, userId, now };
}

export async function satisfyCollisionFnol(
  db: Db,
  claimId: string,
  userId: string,
  now = new Date(),
) {
  await db
    .update(claims)
    .set({
      incidentDescription:
        "Rear-end collision at intersection with moderate vehicle damage.",
      updatedAt: now,
    })
    .where(eq(claims.id, claimId));

  await db.insert(claimItems).values({
    id: crypto.randomUUID(),
    claimId,
    itemType: "vehicle",
    description: "2019 sedan",
    vehicleJson: { make: "Toyota", model: "Camry" },
    createdAt: now,
    updatedAt: now,
  });

  for (let index = 0; index < 2; index += 1) {
    await db.insert(documents).values({
      id: crypto.randomUUID(),
      claimId,
      docType: "photo",
      storagePath: `photo-${index}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      uploadedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function addOpenInfoRequestTask(
  db: Db,
  claimId: string,
  now = new Date(),
) {
  await db.insert(tasks).values({
    id: crypto.randomUUID(),
    claimId,
    type: "request_info",
    queue: "adjusting",
    priority: 3,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
}

export async function addReserve(
  db: Db,
  claimId: string,
  userId: string,
  now = new Date(),
) {
  await db.insert(reserves).values({
    id: crypto.randomUUID(),
    claimId,
    kind: "indemnity",
    amount: "5000.00",
    setBy: userId,
    source: "manual",
    createdAt: now,
  });
}

export async function addSettlementDocs(
  db: Db,
  claimId: string,
  userId: string,
  now = new Date(),
) {
  for (const docType of ["repair_estimate", "police_report"] as const) {
    await db.insert(documents).values({
      id: crypto.randomUUID(),
      claimId,
      docType,
      storagePath: `${docType}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 200,
      uploadedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function addPayment(
  db: Db,
  claimId: string,
  partyId: string,
  now = new Date(),
) {
  await db.insert(payments).values({
    id: crypto.randomUUID(),
    claimId,
    payeePartyId: partyId,
    amount: "5000.00",
    method: "ach_mock",
    status: "issued",
    createdAt: now,
    updatedAt: now,
  });
}
