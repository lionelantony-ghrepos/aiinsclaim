import { z } from "zod";

/**
 * Canonical denial reason codes — must stay identical to seeded
 * `denial.reason_codes` parameter (see seed/definitions/parameters.ts).
 * Runtime actions also validate against the parameter list.
 */
export const DENIAL_REASON_CODES = [
  "COVERAGE_EXCLUDED",
  "POLICY_LAPSED",
  "FRAUD_CONFIRMED",
  "EXCLUSION_APPLIES",
  "OTHER",
] as const;

export const DenialReasonEnum = z.enum(DENIAL_REASON_CODES);
export type DenialReasonCode = z.infer<typeof DenialReasonEnum>;
