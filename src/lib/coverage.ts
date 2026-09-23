import type { ClaimType, Lob } from "@/lib/db/schema";

export type CoverageEntry = {
  limit: number;
  deductible: number;
};

export type CoverageInput = {
  lineOfBusiness: Lob;
  claimType: ClaimType;
  estimatedAmount: number;
};

export type CoverageResult = {
  coverageKey: string;
  limit: number;
  deductible: number;
  estimatedAmount: number;
  coveredAmount: number;
  payableEstimate: number;
  withinLimit: boolean;
};

function toCoverageEntry(value: unknown): CoverageEntry {
  if (typeof value !== "object" || value === null) {
    return { limit: 0, deductible: 0 };
  }
  const record = value as Record<string, unknown>;
  const limit = Number(record.limit);
  const deductible = Number(record.deductible ?? 0);
  return {
    limit: Number.isFinite(limit) && limit >= 0 ? limit : 0,
    deductible:
      Number.isFinite(deductible) && deductible >= 0 ? deductible : 0,
  };
}

function coverageKeyFor(
  lineOfBusiness: Lob,
  claimType: ClaimType,
): string {
  if (lineOfBusiness === "auto") {
    switch (claimType) {
      case "collision":
        return "collision";
      case "theft":
      case "glass":
        return "comprehensive";
      default:
        return "liability";
    }
  }
  switch (claimType) {
    case "burglary":
      return "contents";
    default:
      return "dwelling";
  }
}

/**
 * Pure coverage evaluation: match a claim to its policy coverage entry and
 * compute limit/deductible math. No DB, no parameters — display only.
 */
export function evaluateCoverage(
  claim: CoverageInput,
  coverageJson: Record<string, unknown>,
): CoverageResult {
  const coverageKey = coverageKeyFor(claim.lineOfBusiness, claim.claimType);
  const entry = toCoverageEntry(coverageJson[coverageKey]);
  const estimatedAmount =
    Number.isFinite(claim.estimatedAmount) && claim.estimatedAmount >= 0
      ? claim.estimatedAmount
      : 0;
  const coveredAmount = Math.min(estimatedAmount, entry.limit);
  const payableEstimate = Math.max(0, coveredAmount - entry.deductible);
  return {
    coverageKey,
    limit: entry.limit,
    deductible: entry.deductible,
    estimatedAmount,
    coveredAmount,
    payableEstimate,
    withinLimit: estimatedAmount <= entry.limit,
  };
}
