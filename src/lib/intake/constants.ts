import type { ClaimType, Lob } from "@/lib/db/schema/enums";

/** FNOL wizard claim types (excludes `other`). */
export const FNOL_CLAIM_TYPES = [
  "collision",
  "theft",
  "glass",
  "water_damage",
  "fire",
  "storm",
  "burglary",
] as const satisfies readonly ClaimType[];

export type FnolClaimType = (typeof FNOL_CLAIM_TYPES)[number];

export const FNOL_CLAIM_TYPE_LABELS: Record<FnolClaimType, string> = {
  collision: "Collision",
  theft: "Theft",
  glass: "Glass damage",
  water_damage: "Water damage",
  fire: "Fire",
  storm: "Storm / hail",
  burglary: "Burglary",
};

/** Default line of business for each FNOL claim type. */
export const FNOL_CLAIM_TYPE_LOB: Record<FnolClaimType, Lob> = {
  collision: "auto",
  theft: "auto",
  glass: "auto",
  water_damage: "property",
  fire: "property",
  storm: "property",
  burglary: "property",
};

export function lobForFnolClaimType(claimType: FnolClaimType): Lob {
  return FNOL_CLAIM_TYPE_LOB[claimType];
}

export function isFnolClaimType(value: string): value is FnolClaimType {
  return (FNOL_CLAIM_TYPES as readonly string[]).includes(value);
}
