import { faker } from "@faker-js/faker";
import type {
  ClaimRoute,
  ClaimStatus,
  ClaimType,
  FraudBand,
  Lob,
} from "@/lib/db/schema";
import type { ClaimSlot } from "./distributions";
import type { SeedPolicy } from "./policies";
import { deterministicId } from "../lib/deterministic-id";

export type FraudInputs = {
  days_since_policy_start: number;
  days_to_report: number;
  claimant_prior_claims_12m: number;
  amount_vs_coverage_ratio: number;
  narrative_inconsistency: number;
  doc_anomaly: number;
  incident_time_band: "day" | "night";
  police_report_present: boolean;
  claim_type: ClaimType;
};

export type SeedClaim = {
  id: string;
  claimNumber: string;
  policyId: string;
  lineOfBusiness: Lob;
  claimType: ClaimType;
  status: ClaimStatus;
  incidentAt: Date;
  reportedAt: Date;
  incidentDescription: string;
  incidentLocationJson: Record<string, unknown>;
  estimatedAmount: string;
  severityScore: number;
  complexityScore: number;
  route: ClaimRoute | null;
  priority: number | null;
  assignedTo: string | null;
  siuReferred: boolean;
  siuDisposition: null;
  injuryInvolved: boolean;
  liabilityDisputed: boolean;
  policeReportPresent: boolean;
  policeReportNumber: string | null;
  fraudBand: FraudBand;
  fraudInputs: FraudInputs;
  vehicleAcv?: number;
  policyActive: boolean;
};

const MEDIAN_AMOUNTS: Partial<Record<ClaimType, number>> = {
  collision: 3200,
  theft: 8500,
  glass: 650,
  water_damage: 12000,
  storm: 9000,
  fire: 45000,
  burglary: 6000,
};

function fraudInputsForBand(
  band: FraudBand,
  claimType: ClaimType,
): FraudInputs {
  const base: FraudInputs = {
    days_since_policy_start: 365,
    days_to_report: 1,
    claimant_prior_claims_12m: 0,
    amount_vs_coverage_ratio: 0.3,
    narrative_inconsistency: 0,
    doc_anomaly: 0,
    incident_time_band: "day",
    police_report_present: true,
    claim_type: claimType,
  };

  switch (band) {
    case "medium":
      return { ...base, days_since_policy_start: 10 };
    case "high":
      return {
        ...base,
        days_since_policy_start: 10,
        claimant_prior_claims_12m: 2,
        narrative_inconsistency: 0.7,
      };
    case "critical":
      return {
        ...base,
        days_since_policy_start: 10,
        days_to_report: 30,
        claimant_prior_claims_12m: 2,
        narrative_inconsistency: 0.7,
        doc_anomaly: 0.7,
      };
    default:
      return base;
  }
}

function triageScores(status: ClaimStatus, index: number) {
  if (status === "draft") {
    return { severityScore: 15 + (index % 10), complexityScore: 10 + (index % 8) };
  }
  if (index % 11 === 0) {
    return { severityScore: 55, complexityScore: 45 };
  }
  if (index % 17 === 0) {
    return { severityScore: 20, complexityScore: 20, injuryInvolved: true };
  }
  return { severityScore: 18 + (index % 15), complexityScore: 12 + (index % 12) };
}

export function generateClaims(
  slots: ClaimSlot[],
  policies: SeedPolicy[],
  adjusterIds: string[],
): SeedClaim[] {
  faker.seed(42);
  const autoPolicies = policies.filter((p) => p.lineOfBusiness === "auto");
  const propertyPolicies = policies.filter((p) => p.lineOfBusiness === "property");

  return slots.map((slot) => {
    const policyPool =
      slot.lineOfBusiness === "auto" ? autoPolicies : propertyPolicies;
    const policy = policyPool[slot.index % policyPool.length];
    const median = MEDIAN_AMOUNTS[slot.claimType] ?? 5000;
    const amount = Math.round(
      median * faker.number.float({ min: 0.6, max: 1.8, fractionDigits: 2 }),
    );
    const incidentAt = faker.date.between({
      from: "2025-07-01",
      to: "2026-06-30",
    });
    const fraudInputs = fraudInputsForBand(slot.fraudBand, slot.claimType);
    const reportDelayDays =
      slot.fraudBand === "critical" ? fraudInputs.days_to_report : faker.number.int({ min: 0, max: 3 });
    const reportedAt = new Date(incidentAt);
    reportedAt.setDate(reportedAt.getDate() + reportDelayDays);

    const scores = triageScores(slot.status, slot.index);
    const injuryInvolved = "injuryInvolved" in scores && scores.injuryInvolved === true;
    const liabilityDisputed = slot.index % 23 === 0 && slot.status !== "draft";

    return {
      id: deterministicId("claim", slot.index),
      claimNumber: `CLM-2026-${String(slot.index + 1).padStart(6, "0")}`,
      policyId: policy.id,
      lineOfBusiness: slot.lineOfBusiness,
      claimType: slot.claimType,
      status: slot.status,
      incidentAt,
      reportedAt,
      incidentDescription: `${slot.claimType.replaceAll("_", " ")} incident reported near ${faker.location.city()}.`,
      incidentLocationJson: {
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode(),
      },
      estimatedAmount: amount.toFixed(2),
      severityScore: scores.severityScore,
      complexityScore: scores.complexityScore,
      route: null,
      priority: null,
      assignedTo: slot.status === "draft" ? null : adjusterIds[slot.index % adjusterIds.length],
      siuReferred: false,
      siuDisposition: null,
      injuryInvolved,
      liabilityDisputed,
      policeReportPresent: fraudInputs.police_report_present,
      policeReportNumber:
        fraudInputs.police_report_present ? `PR-${slot.index + 1000}` : null,
      fraudBand: slot.fraudBand,
      fraudInputs,
      vehicleAcv: slot.lineOfBusiness === "auto" ? 18000 + slot.index * 120 : undefined,
      policyActive: policy.status === "active",
    };
  });
}

export function evaluateReserveFormula(
  formula: string,
  estimatedAmount: number,
  vehicleAcv: number | undefined,
  injuryFactor: number,
  injuryBase: number,
): number {
  if (formula.includes("reserve.injury_factor")) {
    return estimatedAmount * injuryFactor + injuryBase;
  }
  if (formula.startsWith("min(")) {
    const acv = vehicleAcv ?? estimatedAmount;
    return Math.min(estimatedAmount, acv);
  }
  const match = formula.match(/estimated_amount \* ([0-9.]+)/);
  if (match) {
    return estimatedAmount * Number(match[1]);
  }
  return estimatedAmount;
}
