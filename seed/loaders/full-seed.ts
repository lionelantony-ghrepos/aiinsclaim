import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  claimParties,
  claims,
  documents,
  fraudScores,
  parties,
  policies,
  reserves,
  users,
} from "@/lib/db/schema";
import { evaluateRuleSet } from "@/lib/rules";
import { saveClaimDocument } from "@/lib/storage/local";
import { ensureSeedAssets } from "../generators/assets";
import { buildClaimSlots } from "../generators/distributions";
import {
  evaluateReserveFormula,
  generateClaims,
} from "../generators/claims";
import { generateDocumentPlan } from "../generators/documents";
import {
  buildClaimPartyLinks as linkParties,
  generateParties,
} from "../generators/parties";
import { generatePolicies } from "../generators/policies";
import { generateUsers } from "../generators/users";
import { deterministicId } from "../lib/deterministic-id";
import { truncateAll } from "../lib/truncate";
import { seedRulesAndParameters } from "./rules";

export type SeedResult = {
  userCount: number;
  partyCount: number;
  policyCount: number;
  claimCount: number;
  documentCount: number;
};

export async function runFullSeed(
  db: Db,
  sqlite: Database.Database,
): Promise<SeedResult> {
  await truncateAll(db, sqlite);
  await seedRulesAndParameters(db);

  const seedUsers = await generateUsers();
  await db.insert(users).values(
    seedUsers.map((user) => ({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      displayName: user.displayName,
      role: user.role,
      authorityLevel: user.authorityLevel,
      specialties: user.specialties,
      isActive: user.isActive,
    })),
  );

  const { parties: seedParties, claimantPartyIds, holderPartyIds } =
    generateParties(seedUsers);
  await db.insert(parties).values(
    seedParties.map((party) => ({
      id: party.id,
      partyType: party.partyType,
      fullName: party.fullName,
      email: party.email,
      phone: party.phone,
      addressJson: party.addressJson,
      userId: party.userId,
    })),
  );

  const seedPolicies = generatePolicies(holderPartyIds);
  await db.insert(policies).values(
    seedPolicies.map((policy) => ({
      id: policy.id,
      policyNumber: policy.policyNumber,
      holderPartyId: policy.holderPartyId,
      lineOfBusiness: policy.lineOfBusiness,
      status: policy.status,
      effectiveFrom: policy.effectiveFrom,
      effectiveTo: policy.effectiveTo,
      coverageJson: policy.coverageJson,
    })),
  );

  const adjusterIds = seedUsers
    .filter((user) => user.role === "adjuster")
    .map((user) => user.id);
  const adminId = seedUsers.find((user) => user.role === "admin")!.id;
  const slots = buildClaimSlots();
  const seedClaims = generateClaims(slots, seedPolicies, adjusterIds);

  await db.insert(claims).values(
    seedClaims.map((claim) => ({
      id: claim.id,
      claimNumber: claim.claimNumber,
      policyId: claim.policyId,
      lineOfBusiness: claim.lineOfBusiness,
      claimType: claim.claimType,
      status: claim.status,
      incidentAt: claim.incidentAt,
      reportedAt: claim.reportedAt,
      incidentDescription: claim.incidentDescription,
      incidentLocationJson: claim.incidentLocationJson,
      estimatedAmount: claim.estimatedAmount,
      severityScore: claim.severityScore,
      complexityScore: claim.complexityScore,
      route: claim.route,
      priority: claim.priority,
      assignedTo: claim.assignedTo,
      siuReferred: claim.siuReferred,
      injuryInvolved: claim.injuryInvolved,
      liabilityDisputed: claim.liabilityDisputed,
      policeReportPresent: claim.policeReportPresent,
      policeReportNumber: claim.policeReportNumber,
    })),
  );

  const extraPartyIds = seedParties
    .filter((party) => !claimantPartyIds.includes(party.id))
    .map((party) => party.id);
  const claimPartyLinks = linkParties(
    seedClaims.length,
    claimantPartyIds,
    extraPartyIds,
  );
  await db.insert(claimParties).values(
    claimPartyLinks.map((link) => ({
      id: link.id,
      claimId: seedClaims[link.claimIndex].id,
      partyId: link.partyId,
      role: link.role,
    })),
  );

  for (const [claimIndex, claim] of seedClaims.entries()) {
    const estimatedAmount = Number(claim.estimatedAmount);

    const fraud = await evaluateRuleSet(
      db,
      "BR-FRAUD-001",
      claim.fraudInputs,
      { claimId: claim.id, actor: "seed:fraud", asOf: "2026-06-01" },
    );

    await db.insert(fraudScores).values({
      id: deterministicId("fraud-score", claimIndex),
      claimId: claim.id,
      score: Number(fraud.outputs.fraud_score ?? 0),
      band: (fraud.outputs.fraud_band as typeof claim.fraudBand) ?? "low",
      reasonCodes: (fraud.outputs.reason_codes as string[]) ?? [],
      signalsJson: { inputs: claim.fraudInputs },
      ruleAuditId: fraud.auditId ?? null,
    });

    if (claim.status === "draft") {
      continue;
    }

    const triage = await evaluateRuleSet(
      db,
      "BR-TRIAGE-001",
      {
        line_of_business: claim.lineOfBusiness,
        estimated_amount: estimatedAmount,
        injury_involved: claim.injuryInvolved,
        liability_disputed: claim.liabilityDisputed,
        severity_score: claim.severityScore,
        complexity_score: claim.complexityScore,
        policy_active: claim.policyActive,
      },
      { claimId: claim.id, actor: "seed:triage", asOf: "2026-06-01" },
    );

    const reserve = await evaluateRuleSet(
      db,
      "BR-RESERVE-001",
      {
        line_of_business: claim.lineOfBusiness,
        claim_type: claim.claimType,
        estimated_amount: estimatedAmount,
        injury_involved: claim.injuryInvolved,
        vehicle_acv: claim.vehicleAcv,
      },
      { claimId: claim.id, actor: "seed:reserve", asOf: "2026-06-01" },
    );

    const route = triage.outputs.route as string | undefined;
    const priority = triage.outputs.priority as number | undefined;
    const siuReferred = Boolean(fraud.outputs.siu_referred);

    await db
      .update(claims)
      .set({
        route: route as typeof claim.route,
        priority: priority ?? claim.priority,
        siuReferred,
      })
      .where(eq(claims.id, claim.id));

    const formula = String(reserve.outputs.reserve_amount_formula ?? "estimated_amount * 1.1");
    const expensePct = Number(reserve.outputs.expense_reserve_pct ?? 8);
    const indemnityAmount = evaluateReserveFormula(
      formula,
      estimatedAmount,
      claim.vehicleAcv,
      1.5,
      10000,
    );

    await db.insert(reserves).values([
      {
        id: deterministicId("reserve-indemnity", claimIndex),
        claimId: claim.id,
        kind: "indemnity",
        amount: indemnityAmount.toFixed(2),
        setBy: adminId,
        source: "agent_suggested",
      },
      {
        id: deterministicId("reserve-expense", claimIndex),
        claimId: claim.id,
        kind: "expense",
        amount: ((indemnityAmount * expensePct) / 100).toFixed(2),
        setBy: adminId,
        source: "agent_suggested",
      },
    ]);
  }

  const assets = await ensureSeedAssets();
  const documentPlan = generateDocumentPlan(seedClaims, assets);
  const intakeId =
    seedUsers.find((user) => user.role === "intake_agent")?.id ?? adminId;

  for (const doc of documentPlan) {
    const storagePath = await saveClaimDocument(
      doc.claimId,
      doc.fileName,
      doc.bytes,
    );
    await db.insert(documents).values({
      id: doc.id,
      claimId: doc.claimId,
      docType: doc.docType,
      storagePath,
      mimeType: doc.mimeType,
      sizeBytes: doc.bytes.length,
      status: doc.status,
      uploadedBy: intakeId,
    });
  }

  return {
    userCount: seedUsers.length,
    partyCount: seedParties.length,
    policyCount: seedPolicies.length,
    claimCount: seedClaims.length,
    documentCount: documentPlan.length,
  };
}
