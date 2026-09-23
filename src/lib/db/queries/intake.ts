import { and, eq, like, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { nextClaimNumber } from "@/lib/db/claim-number";
import {
  claimItems,
  claimParties,
  claims,
  documents,
  notifications,
  parties,
  policies,
  type ClaimPartyRole,
  type ClaimType,
  type DocType,
  type Lob,
} from "@/lib/db/schema";
import { lobForFnolClaimType, type FnolClaimType } from "@/lib/intake/constants";
import type {
  ClaimItemInput,
  ClaimPartyInput,
  IncidentPartialInput,
} from "@/lib/schemas/claims";
import { saveClaimDocument } from "@/lib/storage/local";

export async function listPoliciesForClaimant(db: Db, userId: string) {
  return db
    .select({
      id: policies.id,
      policyNumber: policies.policyNumber,
      lineOfBusiness: policies.lineOfBusiness,
      status: policies.status,
      effectiveFrom: policies.effectiveFrom,
      effectiveTo: policies.effectiveTo,
      holderName: parties.fullName,
    })
    .from(policies)
    .innerJoin(parties, eq(parties.id, policies.holderPartyId))
    .where(and(eq(parties.userId, userId), eq(policies.status, "active")));
}

export async function searchPoliciesForStaff(db: Db, query: string) {
  const pattern = `%${query.trim()}%`;
  return db
    .select({
      id: policies.id,
      policyNumber: policies.policyNumber,
      lineOfBusiness: policies.lineOfBusiness,
      status: policies.status,
      effectiveFrom: policies.effectiveFrom,
      effectiveTo: policies.effectiveTo,
      holderPartyId: policies.holderPartyId,
      holderName: parties.fullName,
      holderEmail: parties.email,
    })
    .from(policies)
    .innerJoin(parties, eq(parties.id, policies.holderPartyId))
    .where(
      or(
        like(policies.policyNumber, pattern),
        like(parties.fullName, pattern),
        like(parties.email, pattern),
      ),
    )
    .limit(25);
}

type CreateDraftClaimParams = {
  policyId: string;
  lob: Lob;
  claimType: FnolClaimType;
  actorUserId: string;
  claimantPartyId?: string;
};

export async function createDraftClaim(db: Db, params: CreateDraftClaimParams) {
  const [policy] = await db
    .select()
    .from(policies)
    .where(eq(policies.id, params.policyId))
    .limit(1);

  if (!policy) {
    throw new Error("NOT_FOUND");
  }

  if (policy.lineOfBusiness !== params.lob) {
    throw new Error("VALIDATION_FAILED: policy LOB mismatch");
  }

  const expectedLob = lobForFnolClaimType(params.claimType);
  if (expectedLob !== params.lob) {
    throw new Error("VALIDATION_FAILED: claim type LOB mismatch");
  }

  const claimantPartyId = params.claimantPartyId ?? policy.holderPartyId;
  const now = new Date();
  const claimId = crypto.randomUUID();
  const claimNumber = await nextClaimNumber(db);

  await db.insert(claims).values({
    id: claimId,
    claimNumber,
    policyId: policy.id,
    lineOfBusiness: params.lob,
    claimType: params.claimType as ClaimType,
    status: "draft",
    incidentAt: now,
    reportedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(claimParties).values({
    id: crypto.randomUUID(),
    claimId,
    partyId: claimantPartyId,
    role: "claimant",
    createdAt: now,
    updatedAt: now,
  });

  return { claimId, claimNumber };
}

function mergeIncidentLocation(
  existing: Record<string, unknown> | null | undefined,
  incident: IncidentPartialInput,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };

  if (incident.location) {
    Object.assign(merged, incident.location);
  }
  if (incident.fireServiceRef !== undefined) {
    merged.fireServiceRef = incident.fireServiceRef;
    merged.fireServiceReference = incident.fireServiceRef;
  }
  if (incident.incidentDateInStormWindow !== undefined) {
    merged.incidentDateInStormWindow = incident.incidentDateInStormWindow;
    merged.stormWindowVerified = incident.incidentDateInStormWindow;
  }
  if (incident.damagedPanel !== undefined) {
    merged.damagedPanel = incident.damagedPanel;
  }
  if (incident.waterSource !== undefined) {
    merged.waterSource = incident.waterSource;
  }

  return merged;
}

async function upsertClaimParties(
  db: Db,
  claimId: string,
  partyRows: ClaimPartyInput[],
) {
  const now = new Date();
  await db.delete(claimParties).where(eq(claimParties.claimId, claimId));

  for (const row of partyRows) {
    const partyId = row.id ?? crypto.randomUUID();
    const [existingParty] = row.id
      ? await db.select().from(parties).where(eq(parties.id, row.id)).limit(1)
      : [undefined];

    if (existingParty) {
      await db
        .update(parties)
        .set({
          fullName: row.fullName,
          email: row.email ?? null,
          phone: row.phone ?? null,
          addressJson: row.address ?? null,
          updatedAt: now,
        })
        .where(eq(parties.id, partyId));
    } else {
      await db.insert(parties).values({
        id: partyId,
        partyType: "person",
        fullName: row.fullName,
        email: row.email ?? null,
        phone: row.phone ?? null,
        addressJson: row.address ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.insert(claimParties).values({
      id: crypto.randomUUID(),
      claimId,
      partyId,
      role: row.role as ClaimPartyRole,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function upsertClaimItems(
  db: Db,
  claimId: string,
  itemRows: ClaimItemInput[],
) {
  const now = new Date();
  await db.delete(claimItems).where(eq(claimItems.claimId, claimId));

  for (const row of itemRows) {
    await db.insert(claimItems).values({
      id: row.id ?? crypto.randomUUID(),
      claimId,
      itemType: row.itemType,
      description: row.description,
      vehicleJson: row.vehicle ?? null,
      claimedAmount: row.claimedAmount ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function applyIncidentPatch(
  db: Db,
  claimId: string,
  incident: IncidentPartialInput,
) {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  if (!claim) {
    throw new Error("NOT_FOUND");
  }

  const now = new Date();
  const updates: Partial<typeof claims.$inferInsert> = {
    updatedAt: now,
  };

  if (incident.incidentAt) {
    updates.incidentAt = new Date(incident.incidentAt);
  }
  if (incident.description !== undefined) {
    updates.incidentDescription = incident.description;
  }
  if (
    incident.location !== undefined ||
    incident.fireServiceRef !== undefined ||
    incident.incidentDateInStormWindow !== undefined ||
    incident.damagedPanel !== undefined ||
    incident.waterSource !== undefined
  ) {
    updates.incidentLocationJson = mergeIncidentLocation(
      claim.incidentLocationJson,
      incident,
    );
  }
  if (incident.injuryInvolved !== undefined) {
    updates.injuryInvolved = incident.injuryInvolved;
  }
  if (incident.liabilityDisputed !== undefined) {
    updates.liabilityDisputed = incident.liabilityDisputed;
  }
  if (incident.estimatedAmount !== undefined) {
    updates.estimatedAmount = incident.estimatedAmount;
  }
  if (incident.policeReportNumber !== undefined) {
    updates.policeReportNumber = incident.policeReportNumber;
    updates.policeReportPresent = incident.policeReportNumber.trim().length > 0;
  }

  await db.update(claims).set(updates).where(eq(claims.id, claimId));

  if (incident.vehicles?.length) {
    const vehicleItems: ClaimItemInput[] = incident.vehicles.map((vehicle, index) => ({
      itemType: "vehicle",
      description: `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}`.trim(),
      vehicle,
      claimedAmount: index === 0 ? incident.estimatedAmount : undefined,
    }));
    await upsertClaimItems(db, claimId, vehicleItems);
  }

  if (incident.thirdParty) {
    const now = new Date();
    const partyId = crypto.randomUUID();
    await db.insert(parties).values({
      id: partyId,
      partyType: "person",
      fullName: incident.thirdParty.fullName,
      phone: incident.thirdParty.phone ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(claimParties).values({
      id: crypto.randomUUID(),
      claimId,
      partyId,
      role: "third_party",
      createdAt: now,
      updatedAt: now,
    });
  }
}

type UpdateDraftClaimParams = {
  claimId: string;
  incident?: IncidentPartialInput;
  parties?: ClaimPartyInput[];
  items?: ClaimItemInput[];
};

export async function updateDraftClaim(db: Db, params: UpdateDraftClaimParams) {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, params.claimId))
    .limit(1);

  if (!claim) {
    throw new Error("NOT_FOUND");
  }
  if (claim.status !== "draft") {
    throw new Error("VALIDATION_FAILED: only draft claims can be updated");
  }

  if (params.incident) {
    await applyIncidentPatch(db, params.claimId, params.incident);
  }
  if (params.parties) {
    await upsertClaimParties(db, params.claimId, params.parties);
  }
  if (params.items) {
    await upsertClaimItems(db, params.claimId, params.items);
  }

  return { claimId: params.claimId, updatedAt: new Date().toISOString() };
}

type UploadDraftDocumentParams = {
  claimId: string;
  docType: DocType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Buffer;
  uploadedBy: string;
};

export async function uploadDraftDocument(
  db: Db,
  params: UploadDraftDocumentParams,
) {
  const storagePath = await saveClaimDocument(
    params.claimId,
    params.fileName,
    params.bytes,
  );
  const now = new Date();
  const documentId = crypto.randomUUID();

  const [row] = await db
    .insert(documents)
    .values({
      id: documentId,
      claimId: params.claimId,
      docType: params.docType,
      storagePath,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      status: "uploaded",
      uploadedBy: params.uploadedBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row;
}

type InsertClaimNotificationParams = {
  userId: string;
  claimId: string;
  kind: string;
  title: string;
  bodyMd: string;
};

export async function insertClaimNotification(
  db: Db,
  params: InsertClaimNotificationParams,
) {
  const [row] = await db
    .insert(notifications)
    .values({
      id: crypto.randomUUID(),
      userId: params.userId,
      claimId: params.claimId,
      kind: params.kind,
      title: params.title,
      bodyMd: params.bodyMd,
      deliveryStatus: "not_applicable",
    })
    .returning();
  return row;
}

export async function getDraftClaimDetail(db: Db, claimId: string) {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) {
    return null;
  }

  const [partyRows, itemRows, docRows, policyRow] = await Promise.all([
    db
      .select({
        id: claimParties.id,
        role: claimParties.role,
        partyId: parties.id,
        fullName: parties.fullName,
        email: parties.email,
        phone: parties.phone,
        addressJson: parties.addressJson,
      })
      .from(claimParties)
      .innerJoin(parties, eq(parties.id, claimParties.partyId))
      .where(eq(claimParties.claimId, claimId)),
    db.select().from(claimItems).where(eq(claimItems.claimId, claimId)),
    db.select().from(documents).where(eq(documents.claimId, claimId)),
    db
      .select({
        id: policies.id,
        policyNumber: policies.policyNumber,
        lineOfBusiness: policies.lineOfBusiness,
        status: policies.status,
      })
      .from(policies)
      .where(eq(policies.id, claim.policyId))
      .limit(1),
  ]);

  return {
    claim,
    policy: policyRow ?? null,
    parties: partyRows,
    items: itemRows,
    documents: docRows,
  };
}
