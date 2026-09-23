import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import type { Lob } from "@/lib/db/schema";
import { claims, documents, parties, policies, users } from "@/lib/db/schema";
import {
  createDraftClaim,
  getDraftClaimDetail,
  updateDraftClaim,
} from "@/lib/db/queries/intake";
import type { FnolClaimType } from "@/lib/intake/constants";

export async function insertClaimantWithPolicy(
  db: Db,
  lob: Lob = "auto",
) {
  const now = new Date();
  const userId = crypto.randomUUID();
  const partyId = crypto.randomUUID();
  const policyId = crypto.randomUUID();

  await db.insert(users).values({
    id: userId,
    email: `claimant-${userId.slice(0, 8)}@test.local`,
    passwordHash: "x",
    displayName: "Test Claimant",
    role: "claimant",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(parties).values({
    id: partyId,
    partyType: "person",
    fullName: "Test Claimant",
    email: `claimant-${userId.slice(0, 8)}@test.local`,
    userId,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(policies).values({
    id: policyId,
    policyNumber: `POL-TEST-${policyId.slice(0, 8)}`,
    holderPartyId: partyId,
    lineOfBusiness: lob,
    status: "active",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    coverageJson: {},
    createdAt: now,
    updatedAt: now,
  });

  return { userId, partyId, policyId, now };
}

export async function createTestDraftClaim(
  db: Db,
  params: {
    policyId: string;
    claimType: FnolClaimType;
    actorUserId: string;
    lob?: Lob;
  },
) {
  const lob = params.lob ?? (params.claimType === "collision" || params.claimType === "glass" || params.claimType === "theft" ? "auto" : "property");
  return createDraftClaim(db, {
    policyId: params.policyId,
    lob,
    claimType: params.claimType,
    actorUserId: params.actorUserId,
  });
}

export async function satisfyGlassFnol(
  db: Db,
  claimId: string,
  userId: string,
  now = new Date(),
) {
  await updateDraftClaim(db, {
    claimId,
    incident: {
      description:
        "Windshield cracked by road debris while driving on the highway.",
      estimatedAmount: "450.00",
      incidentAt: now.toISOString(),
      location: {
        line1: "100 Test Ave",
        city: "Springfield",
        state: "IL",
        postalCode: "62701",
      },
    },
  });

  await db.insert(documents).values({
    id: crypto.randomUUID(),
    claimId,
    docType: "photo",
    storagePath: "glass-photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 100,
    uploadedBy: userId,
    createdAt: now,
    updatedAt: now,
  });
}

export async function satisfyCollisionFnolForIntake(
  db: Db,
  claimId: string,
  userId: string,
  now = new Date(),
) {
  await updateDraftClaim(db, {
    claimId,
    incident: {
      description:
        "Rear-end collision at intersection with moderate vehicle damage.",
      estimatedAmount: "3500.00",
      incidentAt: now.toISOString(),
      location: {
        line1: "200 Main St",
        city: "Springfield",
        state: "IL",
        postalCode: "62701",
      },
      vehicles: [{ make: "Toyota", model: "Camry", year: 2019 }],
    },
  });

  for (let index = 0; index < 2; index += 1) {
    await db.insert(documents).values({
      id: crypto.randomUUID(),
      claimId,
      docType: "photo",
      storagePath: `collision-photo-${index}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      uploadedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function readClaimStatus(db: Db, claimId: string) {
  const [claim] = await db
    .select({ status: claims.status })
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  return claim?.status;
}

export async function loadDraftDetail(db: Db, claimId: string) {
  return getDraftClaimDetail(db, claimId);
}
