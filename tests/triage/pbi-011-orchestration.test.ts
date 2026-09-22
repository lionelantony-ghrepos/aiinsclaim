import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import * as gateway from "@/lib/agents/gateway";
import {
  retriageClaim,
  runTriageOnSubmit,
  triageClaim,
} from "@/lib/agents/triage";
import { insertAgentRun } from "@/lib/db/queries/append-only";
import { insertExtraction } from "@/lib/db/queries/extractions";
import {
  agentRuns,
  claimItems,
  claimStateHistory,
  claimParties,
  claims,
  documents,
  policies,
  ruleAuditLog,
  tasks,
  users,
} from "@/lib/db/schema";
import { transitionClaim } from "@/lib/state-machine";
import { seedClaimTransitions } from "../../seed/loaders/transitions";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { insertBaseClaim } from "../helpers/pbi-007-fixtures";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

const AS_OF = "2026-06-01";

async function seedAdjusters() {
  const now = new Date();
  const adjusters = [
    { id: crypto.randomUUID(), email: "adj-a@test.local", specialties: ["auto"] },
    { id: crypto.randomUUID(), email: "adj-b@test.local", specialties: ["auto"] },
  ];

  for (const adjuster of adjusters) {
    await isolated.db.insert(users).values({
      id: adjuster.id,
      email: adjuster.email,
      passwordHash: "x",
      displayName: adjuster.email,
      role: "adjuster",
      authorityLevel: 2,
      specialties: adjuster.specialties,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function addVerifiedPhotos(claimId: string, userId: string, count = 2) {
  const now = new Date();
  for (let index = 0; index < count; index += 1) {
    await isolated.db.insert(documents).values({
      id: crypto.randomUUID(),
      claimId,
      docType: "photo",
      storagePath: `photo-${index}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      status: "verified",
      uploadedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function prepareFnolWithoutPhotos(claimId: string) {
  const now = new Date();
  await isolated.db
    .update(claims)
    .set({
      incidentDescription: "Minor bumper damage in parking lot.",
      updatedAt: now,
    })
    .where(eq(claims.id, claimId));

  await isolated.db.insert(claimItems).values({
    id: crypto.randomUUID(),
    claimId,
    itemType: "vehicle",
    description: "2019 sedan",
    vehicleJson: { make: "Toyota", model: "Camry" },
    createdAt: now,
    updatedAt: now,
  });
}

async function addVerifiedInvoiceExtraction(claimId: string, userId: string) {
  const now = new Date();
  const documentId = crypto.randomUUID();
  await isolated.db.insert(documents).values({
    id: documentId,
    claimId,
    docType: "invoice",
    storagePath: "invoice-high.pdf",
    mimeType: "application/pdf",
    sizeBytes: 200,
    status: "verified",
    uploadedBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  const agentRun = await insertAgentRun(isolated.db, {
    agentId: "AGT-EXTRACT",
    claimId,
    documentId,
    promptVersion: "v1",
    model: "mock:test",
    inputJson: { docType: "invoice" },
    outputJson: { minConfidence: 0.95 },
    confidence: "0.95",
    status: "ok",
  });
  await insertExtraction(isolated.db, {
    documentId,
    agentRunId: agentRun.id,
    fieldsJson: { totalAmount: "1800.00" },
    confidenceJson: { totalAmount: 0.95 },
    minConfidence: 0.95,
    applied: true,
  });
}

async function addPriorClaimsForParty(partyId: string, count: number) {
  const now = new Date();
  for (let index = 0; index < count; index += 1) {
    const claimId = crypto.randomUUID();
    const policyId = crypto.randomUUID();
    await isolated.db.insert(policies).values({
      id: policyId,
      policyNumber: `POL-PRIOR-${index}-${claimId.slice(0, 4)}`,
      holderPartyId: partyId,
      lineOfBusiness: "auto",
      status: "active",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      coverageJson: {},
      createdAt: now,
      updatedAt: now,
    });
    await isolated.db.insert(claims).values({
      id: claimId,
      claimNumber: `CLM-PRIOR-${index}-${claimId.slice(0, 4)}`,
      policyId,
      lineOfBusiness: "auto",
      claimType: "collision",
      status: "closed",
      incidentAt: now,
      reportedAt: now,
      estimatedAmount: "900.00",
      createdAt: now,
      updatedAt: now,
    });
    await isolated.db.insert(claimParties).values({
      id: crypto.randomUUID(),
      claimId,
      partyId,
      role: "claimant",
      createdAt: now,
      updatedAt: now,
    });
  }
}

describe("PBI-011 triage orchestration", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
    await seedClaimTransitions(isolated.db);
    await seedAdjusters();
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("TC-011-01 BR-TRIAGE-001 routing matrix", async () => {
    const inactive = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
    });
    await isolated.db
      .update(policies)
      .set({ status: "lapsed", updatedAt: new Date() })
      .where(eq(policies.id, inactive.policyId));
    const inactiveResult = await triageClaim(isolated.db, inactive.claimId);
    expect(inactiveResult.route).toBe("supervisor");

    const injury = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
    });
    await isolated.db
      .update(claims)
      .set({ injuryInvolved: true, updatedAt: new Date() })
      .where(eq(claims.id, injury.claimId));
    const injuryResult = await triageClaim(isolated.db, injury.claimId);
    expect(injuryResult.route).toBe("complex");

    const green = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
    });
    await prepareFnolWithoutPhotos(green.claimId);
    await addVerifiedPhotos(green.claimId, green.userId);
    await addVerifiedInvoiceExtraction(green.claimId, green.userId);
    const greenResult = await triageClaim(isolated.db, green.claimId);
    expect(greenResult.route).toBe("green_lane");
    expect(greenResult.stpApproved).toBe(true);
  });

  it("TC-011-02 green-lane STP auto-approves with audit chain", async () => {
    const draft = await insertBaseClaim(isolated.db, {
      status: "draft",
      estimatedAmount: "1800.00",
    });
    await prepareFnolWithoutPhotos(draft.claimId);
    await addVerifiedPhotos(draft.claimId, draft.userId);
    await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "submitted",
      actorId: draft.userId,
      reason: "FNOL complete",
      triggeredBy: "user",
      guardContext: { asOf: AS_OF },
    });
    await addVerifiedInvoiceExtraction(draft.claimId, draft.userId);

    const result = await runTriageOnSubmit(
      isolated.db,
      draft.claimId,
      "test:system",
    );
    expect(result.stpApproved).toBe(true);
    expect(result.status).toBe("approved");

    const runs = await isolated.db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.claimId, draft.claimId),
          eq(agentRuns.agentId, "AGT-TRIAGE"),
        ),
      );
    expect(runs.length).toBeGreaterThan(0);

    const audits = await isolated.db
      .select()
      .from(ruleAuditLog)
      .where(eq(ruleAuditLog.claimId, draft.claimId));
    expect(audits.length).toBeGreaterThanOrEqual(3);

    const [history] = await isolated.db
      .select()
      .from(claimStateHistory)
      .where(
        and(
          eq(claimStateHistory.claimId, draft.claimId),
          eq(claimStateHistory.toStatus, "approved"),
        ),
      );
    expect(history?.actorId).toBe("rule:BR-STP-001");
  });

  it("TC-011-03 each STP block condition routes to standard with reason", async () => {
    const fraudClaim = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
    });
    await isolated.db
      .update(policies)
      .set({ effectiveFrom: "2026-06-10", updatedAt: new Date() })
      .where(eq(policies.id, fraudClaim.policyId));
    await prepareFnolWithoutPhotos(fraudClaim.claimId);
    await addVerifiedPhotos(fraudClaim.claimId, fraudClaim.userId);
    await addPriorClaimsForParty(fraudClaim.partyId, 2);
    await addVerifiedInvoiceExtraction(fraudClaim.claimId, fraudClaim.userId);
    const fraudResult = await triageClaim(isolated.db, fraudClaim.claimId);
    expect(fraudResult.route).toBe("standard");
    expect(fraudResult.stpBlockReason).toBe("STP-BLOCK-FRAUD");

    const docsClaim = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
    });
    const docsResult = await triageClaim(isolated.db, docsClaim.claimId);
    expect(docsResult.route).toBe("standard");
    expect(docsResult.stpBlockReason).toBe("STP-BLOCK-DOCS");

    const confidenceClaim = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
    });
    await prepareFnolWithoutPhotos(confidenceClaim.claimId);
    await addVerifiedPhotos(confidenceClaim.claimId, confidenceClaim.userId);
    const now = new Date();
    const lowDocId = crypto.randomUUID();
    await isolated.db.insert(documents).values({
      id: lowDocId,
      claimId: confidenceClaim.claimId,
      docType: "invoice",
      storagePath: "invoice-low.pdf",
      mimeType: "application/pdf",
      sizeBytes: 200,
      status: "verified",
      uploadedBy: confidenceClaim.userId,
      createdAt: now,
      updatedAt: now,
    });
    const agentRun = await insertAgentRun(isolated.db, {
      agentId: "AGT-EXTRACT",
      claimId: confidenceClaim.claimId,
      documentId: lowDocId,
      promptVersion: "v1",
      model: "mock:test",
      inputJson: { docType: "invoice" },
      outputJson: { minConfidence: 0.5 },
      confidence: "0.5",
      status: "ok",
    });
    await insertExtraction(isolated.db, {
      documentId: lowDocId,
      agentRunId: agentRun.id,
      fieldsJson: { totalAmount: "1800.00" },
      confidenceJson: { totalAmount: 0.5 },
      minConfidence: 0.5,
      applied: true,
    });
    const confidenceResult = await triageClaim(
      isolated.db,
      confidenceClaim.claimId,
    );
    expect(confidenceResult.route).toBe("standard");
    expect(confidenceResult.stpBlockReason).toBe("STP-BLOCK-CONFIDENCE");

    const frequencyClaim = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
    });
    await isolated.db
      .update(policies)
      .set({ effectiveFrom: "2025-01-01", updatedAt: new Date() })
      .where(eq(policies.id, frequencyClaim.policyId));
    await isolated.db
      .update(claims)
      .set({ policeReportPresent: true, updatedAt: new Date() })
      .where(eq(claims.id, frequencyClaim.claimId));
    await prepareFnolWithoutPhotos(frequencyClaim.claimId);
    await addVerifiedPhotos(frequencyClaim.claimId, frequencyClaim.userId);
    await addPriorClaimsForParty(frequencyClaim.partyId, 2);
    await addVerifiedInvoiceExtraction(
      frequencyClaim.claimId,
      frequencyClaim.userId,
    );
    const frequencyResult = await triageClaim(
      isolated.db,
      frequencyClaim.claimId,
    );
    expect(frequencyResult.route).toBe("standard");
    expect(frequencyResult.stpBlockReason).toBe("STP-BLOCK-FREQUENCY");
  });

  it("TC-011-04 material change triggers re-triage", async () => {
    const claim = await insertBaseClaim(isolated.db, {
      status: "in_assessment",
      route: "standard",
      estimatedAmount: "5000.00",
    });
    await isolated.db
      .update(claims)
      .set({ assignedTo: claim.userId, updatedAt: new Date() })
      .where(eq(claims.id, claim.claimId));

    const auditsBefore = await isolated.db
      .select()
      .from(ruleAuditLog)
      .where(eq(ruleAuditLog.claimId, claim.claimId));

    await isolated.db
      .update(claims)
      .set({ estimatedAmount: "30000.00", updatedAt: new Date() })
      .where(eq(claims.id, claim.claimId));

    const result = await retriageClaim(isolated.db, claim.claimId, {
      previousAmount: 5000,
      trigger: "amount_edit",
    });

    expect(result.skipped).toBe(false);
    expect(result.route).toBe("complex");

    const auditsAfter = await isolated.db
      .select()
      .from(ruleAuditLog)
      .where(eq(ruleAuditLog.claimId, claim.claimId));
    expect(auditsAfter.length).toBeGreaterThan(auditsBefore.length);
  });

  it("TC-011-05 invalid AGT-TRIAGE output routes to review", async () => {
    vi.spyOn(gateway, "callAiGateway").mockResolvedValue({
      output: { bad: "schema" },
      model: "mock:fail",
      latencyMs: 1,
    });

    const claim = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      estimatedAmount: "1800.00",
    });

    const result = await triageClaim(isolated.db, claim.claimId);
    expect(result.agentFailed).toBe(true);
    expect(result.route).toBe("standard");

    const reviewTasks = await isolated.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.claimId, claim.claimId),
          eq(tasks.type, "review_triage"),
        ),
      );
    expect(reviewTasks.length).toBe(1);

    vi.restoreAllMocks();
  });
});
