import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  claimParties,
  claims,
  documents,
  extractions,
  parties,
  policies,
} from "@/lib/db/schema";
import { evaluateFnolCompleteness } from "@/lib/state-machine/completeness";

export async function loadClaimWithPolicy(db: Db, claimId: string) {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  const [policy] = await db
    .select()
    .from(policies)
    .where(eq(policies.id, claim.policyId))
    .limit(1);
  if (!policy) {
    throw new Error(`Policy not found for claim: ${claimId}`);
  }

  return { claim, policy };
}

export async function countClaimantPriorClaims12m(
  db: Db,
  claimId: string,
): Promise<number> {
  const [claimParty] = await db
    .select({ partyId: claimParties.partyId })
    .from(claimParties)
    .where(
      and(eq(claimParties.claimId, claimId), eq(claimParties.role, "claimant")),
    )
    .limit(1);

  if (!claimParty) {
    return 0;
  }

  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const claimantClaims = await db
    .select({ id: claims.id, createdAt: claims.createdAt })
    .from(claims)
    .innerJoin(claimParties, eq(claimParties.claimId, claims.id))
    .where(eq(claimParties.partyId, claimParty.partyId));

  return claimantClaims.filter(
    (row) =>
      row.id !== claimId && row.createdAt.getTime() >= cutoff,
  ).length;
}

export async function buildStpInputs(
  db: Db,
  claimId: string,
  claim: Awaited<ReturnType<typeof loadClaimWithPolicy>>["claim"],
  priorClaims12m: number,
) {
  const fnol = await evaluateFnolCompleteness(db, claimId, {
    actor: "triage:stp-inputs",
  });

  const docRows = await db
    .select()
    .from(documents)
    .where(eq(documents.claimId, claimId));

  const docsExtracted =
    docRows.length > 0 &&
    docRows.every(
      (doc) => doc.status === "verified" || doc.status === "extracted",
    );

  let extractionMinConfidence = 0;
  if (docRows.length > 0) {
    const extractionRows = await db
      .select({ minConfidence: extractions.minConfidence })
      .from(extractions)
      .innerJoin(documents, eq(extractions.documentId, documents.id))
      .where(eq(documents.claimId, claimId));

    if (extractionRows.length > 0) {
      extractionMinConfidence = Math.min(
        ...extractionRows.map((row) => Number(row.minConfidence)),
      );
    }
  }

  return {
    route: claim.route ?? "standard",
    fraud_band: "low" as const,
    all_required_docs_extracted: fnol.complete && docsExtracted,
    extraction_min_confidence: extractionMinConfidence,
    claimant_prior_claims_12m: priorClaims12m,
    estimated_amount: Number(claim.estimatedAmount ?? 0),
  };
}

function incidentTimeBand(incidentAt: Date): "day" | "night" {
  const hour = incidentAt.getHours();
  return hour >= 22 || hour < 6 ? "night" : "day";
}

export async function buildFraudInputs(
  db: Db,
  claimId: string,
  claim: Awaited<ReturnType<typeof loadClaimWithPolicy>>["claim"],
  priorClaims12m: number,
  agentSignals?: {
    narrativeInconsistency?: number;
    docAnomaly?: number;
  },
) {
  const { policy } = await loadClaimWithPolicy(db, claimId);
  const policyStart = new Date(policy.effectiveFrom).getTime();
  const incidentAt = claim.incidentAt.getTime();
  const reportedAt = claim.reportedAt.getTime();
  const daysSincePolicyStart = Math.max(
    0,
    Math.floor((incidentAt - policyStart) / (24 * 60 * 60 * 1000)),
  );
  const daysToReport = Math.max(
    0,
    Math.floor((reportedAt - incidentAt) / (24 * 60 * 60 * 1000)),
  );

  const coverageLimit = Number(
    (policy.coverageJson as { limit?: number })?.limit ?? 50000,
  );
  const estimated = Number(claim.estimatedAmount ?? 0);

  return {
    days_since_policy_start: daysSincePolicyStart,
    days_to_report: daysToReport,
    claimant_prior_claims_12m: priorClaims12m,
    amount_vs_coverage_ratio:
      coverageLimit > 0 ? estimated / coverageLimit : 0,
    narrative_inconsistency: agentSignals?.narrativeInconsistency ?? 0,
    doc_anomaly: agentSignals?.docAnomaly ?? 0,
    incident_time_band: incidentTimeBand(claim.incidentAt),
    police_report_present: claim.policeReportPresent,
    claim_type: claim.claimType,
  };
}

/** @deprecated Use buildFraudInputs — kept for backward-compatible tests. */
export async function buildFraudStubInputs(
  db: Db,
  claimId: string,
  claim: Awaited<ReturnType<typeof loadClaimWithPolicy>>["claim"],
  priorClaims12m: number,
) {
  return buildFraudInputs(db, claimId, claim, priorClaims12m);
}

export async function loadClaimantPartyId(db: Db, claimId: string) {
  const [row] = await db
    .select({ partyId: parties.id })
    .from(claimParties)
    .innerJoin(parties, eq(parties.id, claimParties.partyId))
    .where(eq(claimParties.claimId, claimId))
    .limit(1);
  return row?.partyId ?? null;
}

export async function loadLatestExtractionFields(
  db: Db,
  claimId: string,
): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ fieldsJson: extractions.fieldsJson })
    .from(extractions)
    .innerJoin(documents, eq(extractions.documentId, documents.id))
    .where(eq(documents.claimId, claimId))
    .orderBy(desc(extractions.createdAt))
    .limit(1);

  return (row?.fieldsJson as Record<string, unknown> | undefined) ?? {};
}
