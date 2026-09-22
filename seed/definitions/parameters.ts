import type { ParameterValueType } from "@/lib/db/schema";

export type ParameterDef = {
  key: string;
  valueJson: unknown;
  valueType: ParameterValueType;
  description: string;
};

export const PARAMETER_DEFINITIONS: ParameterDef[] = [
  {
    key: "triage.green_max_amount",
    valueJson: 2500,
    valueType: "number",
    description: "Max estimated amount for green-lane triage",
  },
  {
    key: "triage.standard_max_amount",
    valueJson: 25000,
    valueType: "number",
    description: "Max estimated amount for standard triage",
  },
  {
    key: "stp.min_extraction_confidence",
    valueJson: 0.9,
    valueType: "number",
    description: "Minimum extraction confidence for STP",
  },
  {
    key: "stp.max_prior_claims",
    valueJson: 1,
    valueType: "number",
    description: "Max prior claims in 12 months for STP",
  },
  {
    key: "stp.max_amount",
    valueJson: 2500,
    valueType: "number",
    description: "Max estimated amount for STP",
  },
  {
    key: "fraud.new_policy_days",
    valueJson: 30,
    valueType: "number",
    description: "Days since policy start considered new policy",
  },
  {
    key: "fraud.late_report_days",
    valueJson: 14,
    valueType: "number",
    description: "Days to report considered late",
  },
  {
    key: "fraud.frequency_threshold",
    valueJson: 2,
    valueType: "number",
    description: "Prior claims count triggering frequency signal",
  },
  {
    key: "fraud.limit_hug_ratio",
    valueJson: 0.9,
    valueType: "number",
    description: "Coverage ratio threshold for limit-hugging signal",
  },
  {
    key: "fraud.narrative_threshold",
    valueJson: 0.6,
    valueType: "number",
    description: "Narrative inconsistency threshold",
  },
  {
    key: "fraud.doc_anomaly_threshold",
    valueJson: 0.6,
    valueType: "number",
    description: "Document anomaly threshold",
  },
  {
    key: "assign.max_open_tasks",
    valueJson: 12,
    valueType: "number",
    description: "Max open tasks before adjuster is skipped",
  },
  {
    key: "reserve.injury_factor",
    valueJson: 1.5,
    valueType: "number",
    description: "Injury reserve multiplier",
  },
  {
    key: "reserve.injury_base",
    valueJson: 10000,
    valueType: "number",
    description: "Injury reserve base amount",
  },
  {
    key: "reserve.change_approval_pct",
    valueJson: 25,
    valueType: "number",
    description: "Reserve change requiring supervisor approval (%)",
  },
  {
    key: "auth.level1_max",
    valueJson: 5000,
    valueType: "number",
    description: "Level 1 settlement authority max",
  },
  {
    key: "auth.level2_max",
    valueJson: 25000,
    valueType: "number",
    description: "Level 2 settlement authority max",
  },
  {
    key: "auth.level3_max",
    valueJson: 100000,
    valueType: "number",
    description: "Level 3 settlement authority max",
  },
  {
    key: "sla.ack_hours",
    valueJson: "4h",
    valueType: "duration",
    description: "SLA to acknowledge claimant after submit",
  },
  {
    key: "sla.triage_hours",
    valueJson: "24h",
    valueType: "duration",
    description: "SLA to complete triage",
  },
  {
    key: "sla.assess_days.auto",
    valueJson: "7d",
    valueType: "duration",
    description: "SLA to complete auto assessment",
  },
  {
    key: "sla.assess_days.property",
    valueJson: "14d",
    valueType: "duration",
    description: "SLA to complete property assessment",
  },
  {
    key: "sla.settle_days",
    valueJson: "5d",
    valueType: "duration",
    description: "SLA to issue settlement decision",
  },
  {
    key: "sla.pay_days",
    valueJson: "2d",
    valueType: "duration",
    description: "SLA to issue payment after approval",
  },
  {
    key: "doc.min_photos",
    valueJson: 2,
    valueType: "number",
    description: "Minimum photos for auto collision FNOL",
  },
  {
    key: "doc.police_report_amount",
    valueJson: 10000,
    valueType: "number",
    description: "Amount threshold requiring police report",
  },
  {
    key: "doc.max_bytes",
    valueJson: 10485760,
    valueType: "number",
    description: "Maximum upload size in bytes",
  },
  {
    key: "doc.allowed_mimes",
    valueJson: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    valueType: "string",
    description: "Allowed MIME types for document upload",
  },
  {
    key: "doc.autoaccept_confidence",
    valueJson: 0.9,
    valueType: "number",
    description: "Auto-accept extraction confidence threshold",
  },
  {
    key: "ui.queue_poll_seconds",
    valueJson: 30,
    valueType: "number",
    description: "Staff queue poll interval",
  },
  {
    key: "ui.summary_debounce_s",
    valueJson: 60,
    valueType: "number",
    description: "Claim summary regeneration debounce",
  },
  {
    key: "copilot.max_rows",
    valueJson: 500,
    valueType: "number",
    description: "Max rows returned by claims copilot",
  },
];
