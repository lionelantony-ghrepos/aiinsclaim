import type { ClaimStatus } from "@/lib/db/schema";

/** BR-SLA-001 timer_code owned by each claim stage (for met-on-exit). */
export const TIMER_CODE_BY_CLAIM_STATUS: Partial<Record<ClaimStatus, string>> = {
  submitted: "acknowledge_claimant",
  in_triage: "complete_triage",
  in_assessment: "complete_assessment",
  in_settlement: "issue_decision",
  approved: "issue_payment",
};

/** Timer codes that pause while claim is in pending_info (BR-SLA-001). */
export const PAUSE_IN_PENDING_INFO_TIMER_CODES = new Set(["complete_assessment"]);

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
