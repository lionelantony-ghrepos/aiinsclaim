import { z } from "zod";

export const COMMS_DRAFT_TYPES = [
  "acknowledgement",
  "information_request",
  "decision_letter",
] as const;
export type CommsDraftType = (typeof COMMS_DRAFT_TYPES)[number];

export const COMMS_TONES = ["professional", "warm", "concise"] as const;
export const CommsToneSchema = z.enum(COMMS_TONES);

export const COMMS_READING_LEVELS = ["plain", "standard", "detailed"] as const;
export const CommsReadingLevelSchema = z.enum(COMMS_READING_LEVELS);

export const COMMS_TEMPLATES = [
  {
    id: "acknowledgement-v1",
    draftType: "acknowledgement",
    label: "Acknowledgement",
  },
  {
    id: "information-request-v1",
    draftType: "information_request",
    label: "Information request",
  },
  {
    id: "decision-letter-v1",
    draftType: "decision_letter",
    label: "Decision letter",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  draftType: CommsDraftType;
  label: string;
}>;

const CommsClaimFactsSchema = z.object({
  claimId: z.string().min(1),
  claimNumber: z.string().min(1),
  lineOfBusiness: z.string().min(1),
  claimType: z.string().min(1),
  denialReasonCode: z.string().nullable(),
});

const CommsTemplateSchema = z.object({
  templateId: z.string().min(1),
  subject: z.string().min(1).max(200),
  bodyMd: z.string().min(1).max(6000),
});

const CommsInputBaseSchema = z.object({
  claimFacts: CommsClaimFactsSchema,
  claimSummaryMd: z.string().max(2000),
  template: CommsTemplateSchema,
  context: z.object({ locale: z.string().min(1) }),
  tone: CommsToneSchema,
  readingLevel: CommsReadingLevelSchema,
});

export const CommsAgentInputSchema = z.discriminatedUnion("draftType", [
  CommsInputBaseSchema.extend({
    draftType: z.literal("acknowledgement"),
  }),
  CommsInputBaseSchema.extend({
    draftType: z.literal("information_request"),
  }),
  CommsInputBaseSchema.extend({
    draftType: z.literal("decision_letter"),
    claimFacts: CommsClaimFactsSchema.extend({
      denialReasonCode: z.string().min(1),
    }),
  }),
]);

export const CommsDraftSchema = z.object({
  draftType: z.enum(COMMS_DRAFT_TYPES),
  subject: z.string().min(1).max(200),
  bodyMd: z.string().min(1).max(6000),
  templateId: z.string().min(1),
  readingLevel: CommsReadingLevelSchema,
  tone: CommsToneSchema,
});

export const CommsAgentOutputSchema = CommsDraftSchema.omit({ draftType: true });

export const CommsDraftRequestSchema = z.object({
  claimId: z.string().min(1),
  draftType: z.enum(COMMS_DRAFT_TYPES),
  templateId: z.string().min(1),
  tone: CommsToneSchema.default("professional"),
  readingLevel: CommsReadingLevelSchema.default("plain"),
});

export const CommsUpdateDraftSchema = CommsDraftSchema.extend({
  claimId: z.string().min(1),
  outboxId: z.string().min(1).optional(),
  agentRunId: z.string().min(1).optional(),
});

export const CommsSendSchema = z.object({
  claimId: z.string().min(1),
  outboxId: z.string().min(1),
});

export const CommsManualReviewTaskRoutingSchema = z.object({
  type: z.literal("assess_claim"),
  queue: z.literal("adjusting"),
  priority: z.number().int().positive(),
});

export type CommsAgentInput = z.infer<typeof CommsAgentInputSchema>;
export type CommsAgentOutput = z.infer<typeof CommsAgentOutputSchema>;
export type CommsDraft = z.infer<typeof CommsDraftSchema>;
