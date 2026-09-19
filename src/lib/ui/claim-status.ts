import type { ClaimStatus } from "@/lib/db/schema/enums";

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_triage: "Triage",
  in_assessment: "Assessment",
  pending_info: "Pending info",
  in_settlement: "Settlement",
  approved: "Approved",
  paid: "Paid",
  closed: "Closed",
  denied: "Denied",
  withdrawn: "Withdrawn",
};

export type StatusRampToken =
  | "draft"
  | "triage"
  | "assessment"
  | "settlement"
  | "paid"
  | "denied";

export function statusRampToken(status: ClaimStatus): StatusRampToken {
  switch (status) {
    case "draft":
    case "submitted":
    case "withdrawn":
      return "draft";
    case "in_triage":
    case "pending_info":
      return "triage";
    case "in_assessment":
      return "assessment";
    case "in_settlement":
    case "approved":
      return "settlement";
    case "paid":
    case "closed":
      return "paid";
    case "denied":
      return "denied";
  }
}

export const STATUS_RAMP_CLASS: Record<StatusRampToken, string> = {
  draft: "text-status-draft",
  triage: "text-status-triage",
  assessment: "text-status-assessment",
  settlement: "text-status-settlement",
  paid: "text-status-paid",
  denied: "text-status-denied",
};
