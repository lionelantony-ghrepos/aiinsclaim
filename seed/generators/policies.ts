import { faker } from "@faker-js/faker";
import type { Lob, PolicyStatus } from "@/lib/db/schema";
import { POLICY_DISTRIBUTION } from "./distributions";
import { deterministicId } from "../lib/deterministic-id";

export type SeedPolicy = {
  id: string;
  policyNumber: string;
  holderPartyId: string;
  lineOfBusiness: Lob;
  status: PolicyStatus;
  effectiveFrom: string;
  effectiveTo: string;
  coverageJson: Record<string, unknown>;
};

function coverageForLob(lob: Lob) {
  if (lob === "auto") {
    return {
      collision: { limit: 50000, deductible: 500 },
      comprehensive: { limit: 50000, deductible: 250 },
      liability: { limit: 100000 },
      rental: { limit: 1500 },
    };
  }
  return {
    dwelling: { limit: 350000, deductible: 1000 },
    contents: { limit: 75000, deductible: 500 },
    liability: { limit: 300000 },
    loss_of_use: { limit: 50000 },
  };
}

export function generatePolicies(holderPartyIds: string[]): SeedPolicy[] {
  faker.seed(42);

  const lobSlots: Lob[] = [
    ...Array.from({ length: POLICY_DISTRIBUTION.auto }, () => "auto" as const),
    ...Array.from({ length: POLICY_DISTRIBUTION.property }, () => "property" as const),
  ];

  const statusSlots: PolicyStatus[] = [
    ...Array.from({ length: POLICY_DISTRIBUTION.active }, () => "active" as const),
    ...Array.from({ length: POLICY_DISTRIBUTION.lapsed }, () => "lapsed" as const),
    ...Array.from({ length: POLICY_DISTRIBUTION.cancelled }, () => "cancelled" as const),
  ];

  return lobSlots.map((lineOfBusiness, index) => {
    const prefix = lineOfBusiness === "auto" ? "POL-AUTO" : "POL-PROP";
    const effectiveFrom = faker.date.between({
      from: "2024-01-01",
      to: "2025-06-01",
    });
    const effectiveTo = faker.date.between({
      from: "2026-06-01",
      to: "2027-12-31",
    });

    return {
      id: deterministicId("policy", index),
      policyNumber: `${prefix}-${String(index + 1).padStart(6, "0")}`,
      holderPartyId: holderPartyIds[index],
      lineOfBusiness,
      status: statusSlots[index],
      effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: effectiveTo.toISOString().slice(0, 10),
      coverageJson: coverageForLob(lineOfBusiness),
    };
  });
}
