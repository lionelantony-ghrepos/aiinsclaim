import { z } from "zod";

export const FraudAgentInputSchema = z.object({
  claimId: z.string(),
  narrative: z.string(),
  extractedDocFields: z.record(z.string(), z.unknown()),
  incidentFacts: z.object({
    claimType: z.string(),
    lineOfBusiness: z.string(),
    incidentAt: z.string(),
    policeReportPresent: z.boolean(),
    estimatedAmount: z.number(),
  }),
  timelineFacts: z.object({
    daysSincePolicyStart: z.number().int().min(0),
    daysToReport: z.number().int().min(0),
    priorClaims12m: z.number().int().min(0),
    amountVsCoverageRatio: z.number().min(0),
    incidentTimeBand: z.enum(["day", "night"]),
  }),
});
export type FraudAgentInput = z.infer<typeof FraudAgentInputSchema>;

export const FraudEvidenceSchema = z.object({
  signal: z.enum(["NARRATIVE_INCONSISTENCY", "DOC_ANOMALY"]),
  quote: z.string().max(500),
  source: z.string(),
});
export type FraudEvidence = z.infer<typeof FraudEvidenceSchema>;

export const FraudAgentOutputSchema = z.object({
  narrativeInconsistency: z.number().min(0).max(1),
  docAnomaly: z.number().min(0).max(1),
  evidence: z.array(FraudEvidenceSchema),
  confidence: z.number().min(0).max(1),
});
export type FraudAgentOutput = z.infer<typeof FraudAgentOutputSchema>;

export const SetSiuDispositionSchema = z.object({
  claimId: z.string(),
  disposition: z.enum(["open", "cleared", "confirmed_fraud"]),
  reason: z.string().max(500).optional(),
});
export type SetSiuDispositionInput = z.infer<typeof SetSiuDispositionSchema>;
