import { z } from "zod";
import { ASSESSMENT_STATUSES } from "@/lib/db/schema/enums";
import { Money } from "./claims";

export const ConfirmReserveSchema = z.object({
  claimId: z.uuid(),
  indemnityAmount: Money,
  expenseAmount: Money,
  sourceAgentRunId: z.uuid().optional(),
});

export const UpdateItemAssessmentSchema = z.object({
  claimItemId: z.uuid(),
  assessedAmount: Money.nullable().optional(),
  assessmentStatus: z.enum(ASSESSMENT_STATUSES),
});

export const RequestInfoSchema = z.object({
  claimId: z.uuid(),
  note: z.string().min(10).max(2000),
});

export const CompleteAssessmentSchema = z.object({
  claimId: z.uuid(),
});

export const SuggestReserveSchema = z.object({
  claimId: z.uuid(),
});

export type ConfirmReserveInput = z.infer<typeof ConfirmReserveSchema>;
export type UpdateItemAssessmentInput = z.infer<
  typeof UpdateItemAssessmentSchema
>;
export type RequestInfoInput = z.infer<typeof RequestInfoSchema>;
export type CompleteAssessmentInput = z.infer<typeof CompleteAssessmentSchema>;
export type SuggestReserveInput = z.infer<typeof SuggestReserveSchema>;
