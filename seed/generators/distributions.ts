import type { ClaimStatus, ClaimType, FraudBand, Lob } from "@/lib/db/schema";

export const STATUS_DISTRIBUTION: Record<ClaimStatus, number> = {
  draft: 8,
  submitted: 12,
  in_triage: 15,
  in_assessment: 30,
  pending_info: 8,
  in_settlement: 12,
  approved: 8,
  paid: 10,
  closed: 10,
  denied: 4,
  withdrawn: 3,
};

export const AUTO_CLAIM_TYPES: Record<Extract<ClaimType, "collision" | "theft" | "glass">, number> = {
  collision: 40,
  theft: 12,
  glass: 18,
};

export const PROPERTY_CLAIM_TYPES: Record<
  Extract<ClaimType, "water_damage" | "storm" | "fire" | "burglary">,
  number
> = {
  water_damage: 18,
  storm: 14,
  fire: 6,
  burglary: 12,
};

export const FRAUD_BAND_DISTRIBUTION: Record<FraudBand, number> = {
  low: 84,
  medium: 22,
  high: 10,
  critical: 4,
};

export const TOTAL_CLAIMS = 120;
export const TOTAL_AUTO = 70;
export const TOTAL_PROPERTY = 50;

export const USER_COUNTS = {
  admin: 1,
  supervisors: 2,
  adjusters: 4,
  intake: 1,
  siu: 1,
  claimants: 5,
} as const;

export const ENTITY_COUNTS = {
  users: 14,
  parties: 60,
  policies: 40,
  claims: 120,
  ruleSets: 9,
} as const;

export const POLICY_DISTRIBUTION = {
  auto: 25,
  property: 15,
  active: 34,
  lapsed: 4,
  cancelled: 2,
} as const;

export type ClaimSlot = {
  index: number;
  status: ClaimStatus;
  lineOfBusiness: Lob;
  claimType: ClaimType;
  fraudBand: FraudBand;
};

function expandDistribution<T extends string>(
  distribution: Record<T, number>,
): T[] {
  const items: T[] = [];
  for (const [key, count] of Object.entries(distribution) as [T, number][]) {
    for (let i = 0; i < count; i += 1) {
      items.push(key);
    }
  }
  return items;
}

export function buildClaimSlots(): ClaimSlot[] {
  const statuses = expandDistribution(STATUS_DISTRIBUTION);
  const autoTypes = expandDistribution(AUTO_CLAIM_TYPES);
  const propertyTypes = expandDistribution(PROPERTY_CLAIM_TYPES);
  const fraudBands = expandDistribution(FRAUD_BAND_DISTRIBUTION);

  const lobAndType: { lineOfBusiness: Lob; claimType: ClaimType }[] = [
    ...autoTypes.map((claimType) => ({
      lineOfBusiness: "auto" as const,
      claimType,
    })),
    ...propertyTypes.map((claimType) => ({
      lineOfBusiness: "property" as const,
      claimType,
    })),
  ];

  return statuses.map((status, index) => ({
    index,
    status,
    lineOfBusiness: lobAndType[index].lineOfBusiness,
    claimType: lobAndType[index].claimType,
    fraudBand: fraudBands[index],
  }));
}

export function documentsPerClaim(index: number): number {
  return 2 + (index % 4);
}
