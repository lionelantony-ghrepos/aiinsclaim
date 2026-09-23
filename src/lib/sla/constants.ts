import type { ClaimStatus } from "@/lib/db/schema";

/** BR-SLA-001 timer_code owned by each claim stage (for met-on-exit). */
export const TIMER_CODE_BY_CLAIM_STATUS: Partial<Record<ClaimStatus, string>> = {
  submitted: "acknowledge_claimant",
  in_triage: "complete_triage",
  in_assessment: "complete_assessment",
  in_settlement: "issue_decision",
  approved: "issue_payment",
};

export const TIMER_CODE_LABELS: Record<string, string> = {
  acknowledge_claimant: "Acknowledge claimant",
  complete_triage: "Complete triage",
  complete_assessment: "Complete assessment",
  issue_decision: "Issue decision",
  issue_payment: "Issue payment",
  task_completion: "Task completion",
};

export function timerCodeLabel(code: string): string {
  return TIMER_CODE_LABELS[code] ?? code.replaceAll("_", " ");
}

export function slaTriggerForTimerCode(
  timerCode: string,
  lineOfBusiness: "auto" | "property",
): string | null {
  switch (timerCode) {
    case "acknowledge_claimant":
      return "claim_submitted";
    case "complete_triage":
      return "claim_in_triage";
    case "complete_assessment":
      return lineOfBusiness === "auto"
        ? "claim_in_assessment_auto"
        : "claim_in_assessment_property";
    case "issue_decision":
      return "claim_in_settlement";
    case "issue_payment":
      return "claim_approved";
    case "task_completion":
      return "task_created";
    default:
      return null;
  }
}

export function slaTriggerForStatus(
  status: ClaimStatus,
  lineOfBusiness: "auto" | "property",
): string | null {
  switch (status) {
    case "submitted":
      return "claim_submitted";
    case "in_triage":
      return "claim_in_triage";
    case "in_assessment":
      return lineOfBusiness === "auto"
        ? "claim_in_assessment_auto"
        : "claim_in_assessment_property";
    case "in_settlement":
      return "claim_in_settlement";
    case "approved":
      return "claim_approved";
    default:
      return null;
  }
}
