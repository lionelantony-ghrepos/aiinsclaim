import { z } from "zod";
import {
  CLAIM_TYPES,
  FRAUD_BANDS,
  LOB_VALUES,
  CLAIM_ROUTES,
} from "@/lib/db/schema";

export const BR_CODES = [
  "BR-TRIAGE-001",
  "BR-STP-001",
  "BR-FRAUD-001",
  "BR-ASSIGN-001",
  "BR-RESERVE-001",
  "BR-AUTH-001",
  "BR-SLA-001",
  "BR-ESC-001",
  "BR-DOC-001",
] as const;

export type BrCode = (typeof BR_CODES)[number];

export const brTriageInputsSchema = z.object({
  line_of_business: z.enum(LOB_VALUES),
  estimated_amount: z.number(),
  injury_involved: z.boolean(),
  liability_disputed: z.boolean(),
  severity_score: z.number().min(0).max(100),
  complexity_score: z.number().min(0).max(100),
  policy_active: z.boolean(),
});

export const brStpInputsSchema = z.object({
  route: z.enum(CLAIM_ROUTES),
  fraud_band: z.enum(FRAUD_BANDS),
  all_required_docs_extracted: z.boolean(),
  extraction_min_confidence: z.number().min(0).max(1),
  claimant_prior_claims_12m: z.number().int().min(0),
  estimated_amount: z.number(),
});

export const brFraudInputsSchema = z.object({
  days_since_policy_start: z.number().int().min(0),
  days_to_report: z.number().int().min(0),
  claimant_prior_claims_12m: z.number().int().min(0),
  amount_vs_coverage_ratio: z.number().min(0),
  narrative_inconsistency: z.number().min(0).max(1),
  doc_anomaly: z.number().min(0).max(1),
  incident_time_band: z.enum(["day", "night"]),
  police_report_present: z.boolean(),
  claim_type: z.enum(CLAIM_TYPES),
});

export const brAssignInputsSchema = z.object({
  route: z.enum(CLAIM_ROUTES),
  line_of_business: z.enum(LOB_VALUES),
  injury_involved: z.boolean(),
  queue_workloads: z.record(z.string(), z.number()).optional(),
  adjuster_specialties: z.record(z.string(), z.array(z.string())).optional(),
});

export const brReserveInputsSchema = z.object({
  line_of_business: z.enum(LOB_VALUES),
  claim_type: z.enum(CLAIM_TYPES),
  estimated_amount: z.number(),
  injury_involved: z.boolean(),
  vehicle_acv: z.number().optional(),
});

export const brAuthInputsSchema = z.object({
  settlement_amount: z.number(),
  approver_role: z.string(),
  approver_authority_level: z.number().int().min(1).max(4),
  fraud_band: z.enum(FRAUD_BANDS),
  siu_referred: z.boolean(),
  siu_disposition: z.enum(["open", "cleared", "confirmed_fraud"]).optional(),
});

export const brSlaInputsSchema = z.object({
  trigger: z.string(),
  from_status: z.string().optional(),
  to_status: z.string().optional(),
  line_of_business: z.enum(LOB_VALUES).optional(),
  task_type: z.string().optional(),
});

export const brEscInputsSchema = z.object({
  breach_count: z.number().int().min(1),
});

export const brDocInputsSchema = z.object({
  line_of_business: z.enum(LOB_VALUES),
  claim_type: z.enum(CLAIM_TYPES),
  estimated_amount: z.number().optional(),
});

const inputSchemas: Record<BrCode, z.ZodType<Record<string, unknown>>> = {
  "BR-TRIAGE-001": brTriageInputsSchema,
  "BR-STP-001": brStpInputsSchema,
  "BR-FRAUD-001": brFraudInputsSchema,
  "BR-ASSIGN-001": brAssignInputsSchema,
  "BR-RESERVE-001": brReserveInputsSchema,
  "BR-AUTH-001": brAuthInputsSchema,
  "BR-SLA-001": brSlaInputsSchema,
  "BR-ESC-001": brEscInputsSchema,
  "BR-DOC-001": brDocInputsSchema,
};

export function validateRuleInputs(
  code: BrCode,
  inputs: unknown,
): Record<string, unknown> {
  const schema = inputSchemas[code];
  const result = schema.safeParse(inputs);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

export function getInputSchema(code: BrCode) {
  return inputSchemas[code];
}
