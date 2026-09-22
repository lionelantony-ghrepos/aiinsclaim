import { z } from "zod";
import { CLAIM_TYPES, LOB_VALUES } from "@/lib/db/schema";

export const TriageAgentInputSchema = z.object({
  claimSnapshot: z.object({
    claimId: z.string(),
    claimType: z.enum(CLAIM_TYPES),
    lineOfBusiness: z.enum(LOB_VALUES),
    estimatedAmount: z.number(),
    injuryInvolved: z.boolean(),
    liabilityDisputed: z.boolean(),
    incidentDescription: z.string().nullable(),
  }),
  extractedFields: z.record(z.string(), z.unknown()).optional(),
  policyCoverageSummary: z.object({
    active: z.boolean(),
    lineOfBusiness: z.enum(LOB_VALUES),
  }),
  priorClaimCounts: z.object({
    claims12m: z.number().int().min(0),
  }),
});

export const TriageAgentOutputSchema = z.object({
  severityScore: z.number().min(0).max(100),
  complexityScore: z.number().min(0).max(100),
  reasonCodes: z.array(z.string()),
  keyRisks: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type TriageAgentInput = z.infer<typeof TriageAgentInputSchema>;
export type TriageAgentOutput = z.infer<typeof TriageAgentOutputSchema>;
