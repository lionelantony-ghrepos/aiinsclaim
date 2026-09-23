import { z } from "zod";
import { LOB_VALUES } from "@/lib/db/schema/enums";
import { FNOL_CLAIM_TYPES } from "@/lib/intake/constants";

export const IntakeHintSeverityEnum = z.enum(["info", "warning", "error"]);

export const IntakeChecklistStateSchema = z.object({
  requirement: z.string(),
  satisfied: z.boolean(),
});

export const IntakeAgentInputSchema = z.object({
  claimType: z.enum(FNOL_CLAIM_TYPES),
  lob: z.enum(LOB_VALUES),
  narrative: z.string().min(1).max(5000),
  enteredFields: z.record(z.string(), z.unknown()),
  checklistState: z.array(IntakeChecklistStateSchema).default([]),
});

export const IntakeCompletenessHintSchema = z.object({
  field: z.string(),
  hint: z.string(),
  severity: IntakeHintSeverityEnum,
});

export const IntakeAgentOutputSchema = z.object({
  summaryDraft: z.string().max(1200),
  completenessHints: z.array(IntakeCompletenessHintSchema),
  suggestedClaimType: z.enum(FNOL_CLAIM_TYPES).optional(),
  confidence: z.number().min(0).max(1),
});

export type IntakeAgentInput = z.infer<typeof IntakeAgentInputSchema>;
export type IntakeAgentOutput = z.infer<typeof IntakeAgentOutputSchema>;
export type IntakeCompletenessHint = z.infer<typeof IntakeCompletenessHintSchema>;
