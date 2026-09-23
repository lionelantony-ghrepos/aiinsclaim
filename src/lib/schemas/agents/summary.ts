import { z } from "zod";

export const SummaryAgentInputSchema = z.object({
  claimSnapshot: z.object({
    claimId: z.string(),
    claimNumber: z.string(),
    status: z.string(),
    lineOfBusiness: z.string(),
    claimType: z.string(),
    estimatedAmount: z.number(),
    incidentDescription: z.string().nullable(),
    severityScore: z.number().nullable(),
    complexityScore: z.number().nullable(),
    fraudBand: z.string().nullable(),
    siuReferred: z.boolean(),
    reserveTotal: z.number(),
  }),
  recentEvents: z.array(
    z.object({
      at: z.string(),
      kind: z.string(),
      description: z.string(),
    }),
  ),
  previousSummary: z.string().nullable(),
});

export const SummaryAgentOutputSchema = z.object({
  summaryMd: z.string().max(2000),
  keyFacts: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .max(10),
});

export type SummaryAgentInput = z.infer<typeof SummaryAgentInputSchema>;
export type SummaryAgentOutput = z.infer<typeof SummaryAgentOutputSchema>;
