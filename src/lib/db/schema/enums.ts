export const USER_ROLES = [
  "claimant",
  "intake_agent",
  "adjuster",
  "supervisor",
  "siu_analyst",
  "admin",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const LOB_VALUES = ["auto", "property"] as const;
export type Lob = (typeof LOB_VALUES)[number];

export const POLICY_STATUSES = ["active", "lapsed", "cancelled"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const PARTY_TYPES = ["person", "organization"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const CLAIM_TYPES = [
  "collision",
  "theft",
  "glass",
  "water_damage",
  "fire",
  "storm",
  "burglary",
  "other",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_STATUSES = [
  "draft",
  "submitted",
  "in_triage",
  "in_assessment",
  "pending_info",
  "in_settlement",
  "approved",
  "paid",
  "closed",
  "denied",
  "withdrawn",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_ROUTES = [
  "green_lane",
  "standard",
  "complex",
  "supervisor",
] as const;
export type ClaimRoute = (typeof CLAIM_ROUTES)[number];

export const SIU_DISPOSITIONS = ["open", "cleared", "confirmed_fraud"] as const;
export type SiuDisposition = (typeof SIU_DISPOSITIONS)[number];

export const CLAIM_PARTY_ROLES = [
  "claimant",
  "insured",
  "witness",
  "third_party",
  "repairer",
  "medical_provider",
] as const;
export type ClaimPartyRole = (typeof CLAIM_PARTY_ROLES)[number];

export const CLAIM_ITEM_TYPES = [
  "vehicle",
  "dwelling",
  "contents",
  "other",
] as const;
export type ClaimItemType = (typeof CLAIM_ITEM_TYPES)[number];

export const ASSESSMENT_STATUSES = ["pending", "assessed", "disputed"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const TRIGGERED_BY = ["user", "agent", "rule", "system"] as const;
export type TriggeredBy = (typeof TRIGGERED_BY)[number];

export const DOC_TYPES = [
  "photo",
  "police_report",
  "repair_estimate",
  "invoice",
  "contractor_report",
  "fire_report",
  "inventory",
  "ownership_proof",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_STATUSES = [
  "uploaded",
  "extracting",
  "extracted",
  "verification_pending",
  "verified",
  "rejected",
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const TASK_TYPES = [
  "verify_extraction",
  "review_triage",
  "review_fraud",
  "assess_claim",
  "approve_settlement",
  "escalation",
  "siu_review",
  "request_info",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_QUEUES = [
  "intake",
  "adjusting",
  "supervision",
  "siu",
] as const;
export type TaskQueue = (typeof TASK_QUEUES)[number];

export const TASK_STATUSES = [
  "open",
  "in_progress",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_RESOLUTIONS = ["accepted", "overridden", "rejected"] as const;
export type TaskResolution = (typeof TASK_RESOLUTIONS)[number];

export const SLA_STATUSES = ["running", "paused", "met", "breached"] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

export const HIT_POLICIES = ["first", "all", "collect_sum"] as const;
export type HitPolicy = (typeof HIT_POLICIES)[number];

export const RULE_VERSION_STATUSES = ["draft", "active", "retired"] as const;
export type RuleVersionStatus = (typeof RULE_VERSION_STATUSES)[number];

export const RULE_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "between",
  "contains",
  "is_null",
] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export const RULE_ACTION_TYPES = [
  "set_output",
  "route",
  "create_task",
  "set_flag",
  "add_score",
  "require_approval",
] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

export const PARAMETER_VALUE_TYPES = [
  "number",
  "string",
  "boolean",
  "duration",
] as const;
export type ParameterValueType = (typeof PARAMETER_VALUE_TYPES)[number];

export const FRAUD_BANDS = ["low", "medium", "high", "critical"] as const;
export type FraudBand = (typeof FRAUD_BANDS)[number];

export const RESERVE_KINDS = ["indemnity", "expense"] as const;
export type ReserveKind = (typeof RESERVE_KINDS)[number];

export const RESERVE_SOURCES = ["agent_suggested", "manual"] as const;
export type ReserveSource = (typeof RESERVE_SOURCES)[number];

export const PAYMENT_METHODS = ["ach_mock", "check_mock"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["pending", "issued", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SETTLEMENT_STATUSES = [
  "proposed",
  "pending_approval",
  "approved",
  "rejected",
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const AGENT_RUN_STATUSES = [
  "ok",
  "schema_retry",
  "failed",
  "timeout",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const AGENT_RUN_OUTCOMES = [
  "accepted",
  "overridden",
  "auto_applied",
] as const;
export type AgentRunOutcome = (typeof AGENT_RUN_OUTCOMES)[number];
