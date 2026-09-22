import type {
  HitPolicy,
  RuleActionType,
  RuleOperator,
} from "@/lib/db/schema";

export type RuleConditionDef = {
  inputKey: string;
  operator: RuleOperator;
  valueJson: unknown;
};

export type RuleActionDef = {
  actionType: RuleActionType;
  paramsJson: Record<string, unknown>;
};

export type RuleDef = {
  label: string;
  conditions: RuleConditionDef[];
  actions: RuleActionDef[];
};

export type RuleSetDef = {
  code: string;
  name: string;
  hitPolicy: HitPolicy;
  rules: RuleDef[];
};

const param = (key: string) => ({ $param: key });

export const RULE_SET_DEFINITIONS: RuleSetDef[] = [
  {
    code: "BR-TRIAGE-001",
    name: "Claim Triage & Routing",
    hitPolicy: "first",
    rules: [
      {
        label: "Inactive policy",
        conditions: [{ inputKey: "policy_active", operator: "eq", valueJson: false }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              route: "supervisor",
              target_queue: "supervision",
              priority: 5,
            },
          },
        ],
      },
      {
        label: "Injury involved",
        conditions: [{ inputKey: "injury_involved", operator: "eq", valueJson: true }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { route: "complex", target_queue: "adjusting", priority: 5 },
          },
        ],
      },
      {
        label: "Liability disputed",
        conditions: [{ inputKey: "liability_disputed", operator: "eq", valueJson: true }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { route: "complex", target_queue: "adjusting", priority: 4 },
          },
        ],
      },
      {
        label: "Green lane candidate",
        conditions: [
          {
            inputKey: "estimated_amount",
            operator: "lte",
            valueJson: param("triage.green_max_amount"),
          },
          { inputKey: "severity_score", operator: "lt", valueJson: 30 },
          { inputKey: "complexity_score", operator: "lt", valueJson: 30 },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { route: "green_lane", target_queue: null, priority: 2 },
          },
        ],
      },
      {
        label: "Standard route",
        conditions: [
          {
            inputKey: "estimated_amount",
            operator: "lte",
            valueJson: param("triage.standard_max_amount"),
          },
          { inputKey: "complexity_score", operator: "lt", valueJson: 60 },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { route: "standard", target_queue: "adjusting", priority: 3 },
          },
        ],
      },
      {
        label: "High amount complex",
        conditions: [
          {
            inputKey: "estimated_amount",
            operator: "gt",
            valueJson: param("triage.standard_max_amount"),
          },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { route: "complex", target_queue: "adjusting", priority: 4 },
          },
        ],
      },
      {
        label: "Default standard",
        conditions: [],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { route: "standard", target_queue: "adjusting", priority: 3 },
          },
        ],
      },
    ],
  },
  {
    code: "BR-STP-001",
    name: "Straight-Through Processing Gate",
    hitPolicy: "first",
    rules: [
      {
        label: "Fraud band block",
        conditions: [{ inputKey: "fraud_band", operator: "neq", valueJson: "low" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { stp_allowed: false, reason_code: "STP-BLOCK-FRAUD" },
          },
        ],
      },
      {
        label: "Missing docs",
        conditions: [
          { inputKey: "all_required_docs_extracted", operator: "eq", valueJson: false },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { stp_allowed: false, reason_code: "STP-BLOCK-DOCS" },
          },
        ],
      },
      {
        label: "Low confidence",
        conditions: [
          {
            inputKey: "extraction_min_confidence",
            operator: "lt",
            valueJson: param("stp.min_extraction_confidence"),
          },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { stp_allowed: false, reason_code: "STP-BLOCK-CONFIDENCE" },
          },
        ],
      },
      {
        label: "Frequency block",
        conditions: [
          {
            inputKey: "claimant_prior_claims_12m",
            operator: "gt",
            valueJson: param("stp.max_prior_claims"),
          },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { stp_allowed: false, reason_code: "STP-BLOCK-FREQUENCY" },
          },
        ],
      },
      {
        label: "Amount block",
        conditions: [
          {
            inputKey: "estimated_amount",
            operator: "gt",
            valueJson: param("stp.max_amount"),
          },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { stp_allowed: false, reason_code: "STP-BLOCK-AMOUNT" },
          },
        ],
      },
      {
        label: "STP pass",
        conditions: [],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { stp_allowed: true, reason_code: "STP-PASS" },
          },
        ],
      },
    ],
  },
  {
    code: "BR-FRAUD-001",
    name: "Fraud Scoring",
    hitPolicy: "collect_sum",
    rules: [
      {
        label: "New policy",
        conditions: [
          {
            inputKey: "days_since_policy_start",
            operator: "lt",
            valueJson: param("fraud.new_policy_days"),
          },
        ],
        actions: [
          { actionType: "add_score", paramsJson: { points: 25, reason_code: "NEW_POLICY" } },
        ],
      },
      {
        label: "Late reporting",
        conditions: [
          {
            inputKey: "days_to_report",
            operator: "gt",
            valueJson: param("fraud.late_report_days"),
          },
        ],
        actions: [
          { actionType: "add_score", paramsJson: { points: 15, reason_code: "LATE_REPORT" } },
        ],
      },
      {
        label: "Frequency",
        conditions: [
          {
            inputKey: "claimant_prior_claims_12m",
            operator: "gte",
            valueJson: param("fraud.frequency_threshold"),
          },
        ],
        actions: [
          { actionType: "add_score", paramsJson: { points: 20, reason_code: "FREQUENCY" } },
        ],
      },
      {
        label: "Limit-hugging",
        conditions: [
          {
            inputKey: "amount_vs_coverage_ratio",
            operator: "gt",
            valueJson: param("fraud.limit_hug_ratio"),
          },
        ],
        actions: [
          { actionType: "add_score", paramsJson: { points: 15, reason_code: "LIMIT_HUG" } },
        ],
      },
      {
        label: "Narrative inconsistency",
        conditions: [
          {
            inputKey: "narrative_inconsistency",
            operator: "gt",
            valueJson: param("fraud.narrative_threshold"),
          },
        ],
        actions: [
          { actionType: "add_score", paramsJson: { points: 20, reason_code: "NARRATIVE" } },
        ],
      },
      {
        label: "Document anomaly",
        conditions: [
          {
            inputKey: "doc_anomaly",
            operator: "gt",
            valueJson: param("fraud.doc_anomaly_threshold"),
          },
        ],
        actions: [
          { actionType: "add_score", paramsJson: { points: 25, reason_code: "DOC_ANOMALY" } },
        ],
      },
      {
        label: "No police report",
        conditions: [
          { inputKey: "claim_type", operator: "in", valueJson: ["collision", "theft"] },
          { inputKey: "police_report_present", operator: "eq", valueJson: false },
        ],
        actions: [
          { actionType: "add_score", paramsJson: { points: 10, reason_code: "NO_POLICE" } },
        ],
      },
      {
        label: "Night incident theft",
        conditions: [
          { inputKey: "incident_time_band", operator: "eq", valueJson: "night" },
          { inputKey: "claim_type", operator: "eq", valueJson: "theft" },
        ],
        actions: [
          { actionType: "add_score", paramsJson: { points: 5, reason_code: "NIGHT_THEFT" } },
        ],
      },
      {
        label: "Band low",
        conditions: [{ inputKey: "total_score", operator: "between", valueJson: [0, 24] }],
        actions: [{ actionType: "set_output", paramsJson: { fraud_band: "low" } }],
      },
      {
        label: "Band medium",
        conditions: [{ inputKey: "total_score", operator: "between", valueJson: [25, 49] }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { fraud_band: "medium" },
          },
          {
            actionType: "set_flag",
            paramsJson: { fraud_flagged: true },
          },
        ],
      },
      {
        label: "Band high",
        conditions: [{ inputKey: "total_score", operator: "between", valueJson: [50, 74] }],
        actions: [
          { actionType: "set_output", paramsJson: { fraud_band: "high", block_stp: true } },
          {
            actionType: "create_task",
            paramsJson: { type: "review_fraud", queue: "siu", priority: 4 },
          },
        ],
      },
      {
        label: "Band critical",
        conditions: [{ inputKey: "total_score", operator: "gte", valueJson: 75 }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { fraud_band: "critical", block_stp: true, hold_settlement: true },
          },
          { actionType: "set_flag", paramsJson: { siu_referred: true } },
          {
            actionType: "create_task",
            paramsJson: { type: "siu_review", queue: "siu", priority: 5 },
          },
        ],
      },
    ],
  },
  {
    code: "BR-ASSIGN-001",
    name: "Adjuster Assignment",
    hitPolicy: "first",
    rules: [
      {
        label: "Complex injury BI specialty",
        conditions: [
          { inputKey: "route", operator: "eq", valueJson: "complex" },
          { inputKey: "injury_involved", operator: "eq", valueJson: true },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              assignment_strategy: "least_loaded",
              specialty: "bodily_injury",
            },
          },
        ],
      },
      {
        label: "Complex LOB specialty",
        conditions: [{ inputKey: "route", operator: "eq", valueJson: "complex" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              assignment_strategy: "least_loaded",
              specialty_from: "line_of_business",
            },
          },
        ],
      },
      {
        label: "Standard round-robin",
        conditions: [{ inputKey: "route", operator: "eq", valueJson: "standard" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              assignment_strategy: "round_robin",
              pool: "line_of_business",
            },
          },
        ],
      },
      {
        label: "Supervisor queue",
        conditions: [{ inputKey: "route", operator: "eq", valueJson: "supervisor" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { assignment_strategy: "supervision_queue", assigned: false },
          },
        ],
      },
    ],
  },
  {
    code: "BR-RESERVE-001",
    name: "Initial Reserve Setting",
    hitPolicy: "first",
    rules: [
      {
        label: "Injury reserve",
        conditions: [{ inputKey: "injury_involved", operator: "eq", valueJson: true }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              reserve_amount_formula: "estimated_amount * reserve.injury_factor + reserve.injury_base",
              expense_reserve_pct: 15,
            },
          },
        ],
      },
      {
        label: "Auto collision",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "auto" },
          { inputKey: "claim_type", operator: "eq", valueJson: "collision" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              reserve_amount_formula: "estimated_amount * 1.1",
              expense_reserve_pct: 5,
            },
          },
        ],
      },
      {
        label: "Auto theft",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "auto" },
          { inputKey: "claim_type", operator: "eq", valueJson: "theft" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              reserve_amount_formula: "min(estimated_amount, vehicle_acv) * 1.0",
              expense_reserve_pct: 5,
            },
          },
        ],
      },
      {
        label: "Property water damage",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "property" },
          { inputKey: "claim_type", operator: "eq", valueJson: "water_damage" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              reserve_amount_formula: "estimated_amount * 1.25",
              expense_reserve_pct: 10,
            },
          },
        ],
      },
      {
        label: "Property fire",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "property" },
          { inputKey: "claim_type", operator: "eq", valueJson: "fire" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              reserve_amount_formula: "estimated_amount * 1.4",
              expense_reserve_pct: 12,
            },
          },
        ],
      },
      {
        label: "Property storm",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "property" },
          { inputKey: "claim_type", operator: "eq", valueJson: "storm" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              reserve_amount_formula: "estimated_amount * 1.15",
              expense_reserve_pct: 8,
            },
          },
        ],
      },
      {
        label: "Default reserve",
        conditions: [],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              reserve_amount_formula: "estimated_amount * 1.1",
              expense_reserve_pct: 8,
            },
          },
        ],
      },
    ],
  },
  {
    code: "BR-AUTH-001",
    name: "Settlement Authority Matrix",
    hitPolicy: "first",
    rules: [
      {
        label: "SIU hold",
        conditions: [
          { inputKey: "siu_referred", operator: "eq", valueJson: true },
          { inputKey: "siu_disposition", operator: "neq", valueJson: "cleared" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { decision: "block", reason: "SIU hold" },
          },
        ],
      },
      {
        label: "High fraud requires supervisor",
        conditions: [
          { inputKey: "fraud_band", operator: "in", valueJson: ["high", "critical"] },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { decision: "require_next_level", reason: "Fraud band escalation" },
          },
        ],
      },
      {
        label: "Level 1 authority",
        conditions: [
          {
            inputKey: "settlement_amount",
            operator: "lte",
            valueJson: param("auth.level1_max"),
          },
          { inputKey: "approver_authority_level", operator: "gte", valueJson: 1 },
        ],
        actions: [{ actionType: "set_output", paramsJson: { decision: "allow" } }],
      },
      {
        label: "Level 2 authority",
        conditions: [
          {
            inputKey: "settlement_amount",
            operator: "lte",
            valueJson: param("auth.level2_max"),
          },
          { inputKey: "approver_authority_level", operator: "gte", valueJson: 2 },
        ],
        actions: [{ actionType: "set_output", paramsJson: { decision: "allow" } }],
      },
      {
        label: "Level 3 authority",
        conditions: [
          {
            inputKey: "settlement_amount",
            operator: "lte",
            valueJson: param("auth.level3_max"),
          },
          { inputKey: "approver_authority_level", operator: "gte", valueJson: 3 },
        ],
        actions: [{ actionType: "set_output", paramsJson: { decision: "allow" } }],
      },
      {
        label: "Level 4 unlimited",
        conditions: [
          {
            inputKey: "settlement_amount",
            operator: "gt",
            valueJson: param("auth.level3_max"),
          },
          { inputKey: "approver_authority_level", operator: "eq", valueJson: 4 },
        ],
        actions: [{ actionType: "set_output", paramsJson: { decision: "allow" } }],
      },
      {
        label: "Default require next level",
        conditions: [],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { decision: "require_next_level" },
          },
          {
            actionType: "create_task",
            paramsJson: { type: "approve_settlement", queue: "supervision" },
          },
        ],
      },
    ],
  },
  {
    code: "BR-SLA-001",
    name: "SLA Timer Definitions",
    hitPolicy: "all",
    rules: [
      {
        label: "Acknowledge claimant",
        conditions: [{ inputKey: "trigger", operator: "eq", valueJson: "claim_submitted" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              timer_code: "acknowledge_claimant",
              duration: param("sla.ack_hours"),
              pause_in_pending_info: false,
            },
          },
        ],
      },
      {
        label: "Complete triage",
        conditions: [{ inputKey: "trigger", operator: "eq", valueJson: "claim_in_triage" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              timer_code: "complete_triage",
              duration: param("sla.triage_hours"),
              pause_in_pending_info: false,
            },
          },
        ],
      },
      {
        label: "Complete auto assessment",
        conditions: [{ inputKey: "trigger", operator: "eq", valueJson: "claim_in_assessment_auto" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              timer_code: "complete_assessment",
              duration: param("sla.assess_days.auto"),
              pause_in_pending_info: true,
            },
          },
        ],
      },
      {
        label: "Complete property assessment",
        conditions: [
          { inputKey: "trigger", operator: "eq", valueJson: "claim_in_assessment_property" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              timer_code: "complete_assessment",
              duration: param("sla.assess_days.property"),
              pause_in_pending_info: true,
            },
          },
        ],
      },
      {
        label: "Issue decision",
        conditions: [{ inputKey: "trigger", operator: "eq", valueJson: "claim_in_settlement" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              timer_code: "issue_decision",
              duration: param("sla.settle_days"),
              pause_in_pending_info: false,
            },
          },
        ],
      },
      {
        label: "Issue payment",
        conditions: [{ inputKey: "trigger", operator: "eq", valueJson: "claim_approved" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              timer_code: "issue_payment",
              duration: param("sla.pay_days"),
              pause_in_pending_info: false,
            },
          },
        ],
      },
      {
        label: "Task completion",
        conditions: [{ inputKey: "trigger", operator: "eq", valueJson: "task_created" }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              timer_code: "task_completion",
              duration_from_task_type: true,
              pause_in_pending_info: false,
            },
          },
        ],
      },
    ],
  },
  {
    code: "BR-ESC-001",
    name: "Escalation on SLA Breach",
    hitPolicy: "first",
    rules: [
      {
        label: "Warning at 75%",
        conditions: [{ inputKey: "breach_count", operator: "eq", valueJson: 1 }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: { action: "notify_assignee", channel: "notification" },
          },
        ],
      },
      {
        label: "Breach at 100%",
        conditions: [{ inputKey: "breach_count", operator: "eq", valueJson: 2 }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              action: "notify_assignee_and_supervisor",
              priority_bump: 1,
            },
          },
        ],
      },
      {
        label: "Reassign at 150%",
        conditions: [{ inputKey: "breach_count", operator: "eq", valueJson: 3 }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              action: "reassign",
              reassign_rule: "BR-ASSIGN-001",
            },
          },
          {
            actionType: "create_task",
            paramsJson: { type: "escalation", queue: "supervision" },
          },
        ],
      },
      {
        label: "Critical escalation at 200%",
        conditions: [{ inputKey: "breach_count", operator: "gte", valueJson: 4 }],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              action: "escalate_ops_dashboard",
              priority: 5,
              queue: "supervision",
            },
          },
        ],
      },
    ],
  },
  {
    code: "BR-DOC-001",
    name: "Required Documents Matrix",
    hitPolicy: "all",
    rules: [
      {
        label: "Auto collision docs",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "auto" },
          { inputKey: "claim_type", operator: "eq", valueJson: "collision" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              fnol_required: [
                "incident_description",
                { doc: "photos", min: param("doc.min_photos") },
                "driver_details",
              ],
              settlement_required: [
                "repair_estimate",
                {
                  doc: "police_report",
                  when_amount_gt: param("doc.police_report_amount"),
                },
              ],
            },
          },
        ],
      },
      {
        label: "Auto theft docs",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "auto" },
          { inputKey: "claim_type", operator: "eq", valueJson: "theft" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              fnol_required: ["incident_description", "police_report_number"],
              settlement_required: ["police_report_document", "ownership_proof"],
            },
          },
        ],
      },
      {
        label: "Auto glass docs",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "auto" },
          { inputKey: "claim_type", operator: "eq", valueJson: "glass" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              fnol_required: ["incident_description", { doc: "photo", min: 1 }],
              settlement_required: ["repair_invoice"],
            },
          },
        ],
      },
      {
        label: "Property water damage docs",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "property" },
          { inputKey: "claim_type", operator: "eq", valueJson: "water_damage" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              fnol_required: ["incident_description", { doc: "photos", min: 3 }],
              settlement_required: [
                "contractor_report",
                "repair_estimate",
              ],
            },
          },
        ],
      },
      {
        label: "Property fire docs",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "property" },
          { inputKey: "claim_type", operator: "eq", valueJson: "fire" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              fnol_required: ["incident_description", "fire_service_reference"],
              settlement_required: [
                "fire_report",
                "contents_inventory",
                "repair_estimate",
              ],
            },
          },
        ],
      },
      {
        label: "Property storm docs",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "property" },
          { inputKey: "claim_type", operator: "eq", valueJson: "storm" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              fnol_required: [
                "incident_description",
                { doc: "photos", min: 3 },
                "incident_date_in_storm_window",
              ],
              settlement_required: ["repair_estimate"],
            },
          },
        ],
      },
      {
        label: "Property burglary docs",
        conditions: [
          { inputKey: "line_of_business", operator: "eq", valueJson: "property" },
          { inputKey: "claim_type", operator: "eq", valueJson: "burglary" },
        ],
        actions: [
          {
            actionType: "set_output",
            paramsJson: {
              fnol_required: ["incident_description", "police_report_number"],
              settlement_required: [
                "police_report",
                "stolen_items_inventory",
              ],
            },
          },
        ],
      },
    ],
  },
];
