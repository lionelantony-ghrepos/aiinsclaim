import type { ClaimStatus } from "@/lib/db/schema";

export type TransitionDefinition = {
  fromStatus: string;
  toStatus: ClaimStatus;
  triggerLabel: string;
  guardCode: string | null;
};

/** DESIGN §4.2 — DB-driven transition table (not hard-coded in app logic). */
export const TRANSITION_DEFINITIONS: TransitionDefinition[] = [
  {
    fromStatus: "draft",
    toStatus: "submitted",
    triggerLabel: "claimant/intake submits",
    guardCode: "BR-DOC-001",
  },
  {
    fromStatus: "submitted",
    toStatus: "in_triage",
    triggerLabel: "auto on submit",
    guardCode: null,
  },
  {
    fromStatus: "in_triage",
    toStatus: "in_assessment",
    triggerLabel: "triage decision",
    guardCode: "BR-TRIAGE-001",
  },
  {
    fromStatus: "in_triage",
    toStatus: "approved",
    triggerLabel: "green-lane STP",
    guardCode: "BR-STP-001",
  },
  {
    fromStatus: "in_assessment",
    toStatus: "pending_info",
    triggerLabel: "adjuster requests info",
    guardCode: "open_info_request",
  },
  {
    fromStatus: "pending_info",
    toStatus: "in_assessment",
    triggerLabel: "info received",
    guardCode: "info_received",
  },
  {
    fromStatus: "in_assessment",
    toStatus: "in_settlement",
    triggerLabel: "assessment complete",
    guardCode: "assessment_complete",
  },
  {
    fromStatus: "in_settlement",
    toStatus: "approved",
    triggerLabel: "settlement approved",
    guardCode: "BR-AUTH-001",
  },
  {
    fromStatus: "approved",
    toStatus: "paid",
    triggerLabel: "payment issued (mock)",
    guardCode: "payment_created",
  },
  {
    fromStatus: "paid",
    toStatus: "closed",
    triggerLabel: "closure checklist done",
    guardCode: "closure_checklist",
  },
  {
    fromStatus: "*",
    toStatus: "denied",
    triggerLabel: "denial decision",
    guardCode: "denial_approval",
  },
  {
    fromStatus: "draft",
    toStatus: "withdrawn",
    triggerLabel: "claimant withdraws",
    guardCode: null,
  },
  {
    fromStatus: "submitted",
    toStatus: "withdrawn",
    triggerLabel: "claimant withdraws",
    guardCode: null,
  },
];
