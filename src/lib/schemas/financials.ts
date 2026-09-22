import { z } from "zod";
import { ASSESSMENT_STATUSES, PAYMENT_METHODS } from "@/lib/db/schema/enums";
import { Money } from "./claims";
import { DenialReasonEnum } from "./denial";

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

export const ProposeSettlementSchema = z.object({
  claimId: z.uuid(),
  items: z
    .array(
      z.object({
        claimItemId: z.uuid(),
        amount: Money,
      }),
    )
    .min(1),
  deductibleApplied: Money,
  note: z.string().max(2000).optional(),
});

export const ApproveSettlementSchema = z.object({
  claimId: z.uuid(),
  settlementId: z.uuid(),
});

export const IssuePaymentSchema = z.object({
  claimId: z.uuid(),
  settlementId: z.uuid(),
  method: z.enum(PAYMENT_METHODS),
});

export const CloseClaimSchema = z.object({
  claimId: z.uuid(),
});

export const DenyClaimSchema = z.object({
  claimId: z.uuid(),
  reasonCode: DenialReasonEnum,
  note: z.string().min(10).max(2000),
});

export type ConfirmReserveInput = z.infer<typeof ConfirmReserveSchema>;
export type UpdateItemAssessmentInput = z.infer<
  typeof UpdateItemAssessmentSchema
>;
export type RequestInfoInput = z.infer<typeof RequestInfoSchema>;
export type CompleteAssessmentInput = z.infer<typeof CompleteAssessmentSchema>;
export type SuggestReserveInput = z.infer<typeof SuggestReserveSchema>;
export type ProposeSettlementInput = z.infer<typeof ProposeSettlementSchema>;
export type ApproveSettlementInput = z.infer<typeof ApproveSettlementSchema>;
export type IssuePaymentInput = z.infer<typeof IssuePaymentSchema>;
export type CloseClaimInput = z.infer<typeof CloseClaimSchema>;
export type DenyClaimInput = z.infer<typeof DenyClaimSchema>;

export { DenialReasonEnum, DENIAL_REASON_CODES } from "./denial";
export type { DenialReasonCode } from "./denial";
