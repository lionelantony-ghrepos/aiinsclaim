import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  AgentRunOutcome,
  AgentRunStatus,
  DocStatus,
  DocType,
  FraudBand,
  HitPolicy,
  ParameterValueType,
  PaymentMethod,
  PaymentStatus,
  ReserveKind,
  ReserveSource,
  SettlementStatus,
  RuleActionType,
  RuleOperator,
  RuleVersionStatus,
  SlaStatus,
  TaskQueue,
  TaskResolution,
  TaskStatus,
  TaskType,
} from "./enums";
import { users } from "./identity";
import { claims } from "./claims";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  docType: text("doc_type").$type<DocType>().notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").$type<DocStatus>().notNull().default("uploaded"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  claimId: text("claim_id").references(() => claims.id),
  documentId: text("document_id").references(() => documents.id),
  promptVersion: text("prompt_version"),
  model: text("model"),
  inputJson: text("input_json", { mode: "json" }).$type<Record<string, unknown>>(),
  outputJson: text("output_json", { mode: "json" }).$type<Record<string, unknown>>(),
  confidence: text("confidence"),
  status: text("status").$type<AgentRunStatus>().notNull(),
  latencyMs: integer("latency_ms"),
  outcome: text("outcome").$type<AgentRunOutcome>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const extractions = sqliteTable("extractions", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id),
  agentRunId: text("agent_run_id")
    .notNull()
    .references(() => agentRuns.id),
  fieldsJson: text("fields_json", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  confidenceJson: text("confidence_json", { mode: "json" })
    .$type<Record<string, number>>()
    .notNull(),
  minConfidence: text("min_confidence").notNull(),
  verifiedBy: text("verified_by").references(() => users.id),
  applied: integer("applied", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const slaTimers = sqliteTable("sla_timers", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  taskId: text("task_id"),
  timerCode: text("timer_code").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
  pausedAt: integer("paused_at", { mode: "timestamp_ms" }),
  breachCount: integer("breach_count").notNull().default(0),
  status: text("status").$type<SlaStatus>().notNull().default("running"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  type: text("type").$type<TaskType>().notNull(),
  queue: text("queue").$type<TaskQueue>().notNull(),
  priority: integer("priority").notNull().default(3),
  status: text("status").$type<TaskStatus>().notNull().default("open"),
  assignedTo: text("assigned_to").references(() => users.id),
  payloadJson: text("payload_json", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  resolution: text("resolution").$type<TaskResolution>(),
  resolutionReason: text("resolution_reason"),
  slaTimerId: text("sla_timer_id").references(() => slaTimers.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const ruleSets = sqliteTable("rule_sets", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  hitPolicy: text("hit_policy").$type<HitPolicy>().notNull().default("first"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const ruleSetVersions = sqliteTable("rule_set_versions", {
  id: text("id").primaryKey(),
  ruleSetId: text("rule_set_id")
    .notNull()
    .references(() => ruleSets.id),
  version: integer("version").notNull(),
  status: text("status").$type<RuleVersionStatus>().notNull().default("draft"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  changeNote: text("change_note"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const rules = sqliteTable("rules", {
  id: text("id").primaryKey(),
  versionId: text("version_id")
    .notNull()
    .references(() => ruleSetVersions.id),
  rowOrder: integer("row_order").notNull(),
  label: text("label").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const ruleConditions = sqliteTable("rule_conditions", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id")
    .notNull()
    .references(() => rules.id),
  inputKey: text("input_key").notNull(),
  operator: text("operator").$type<RuleOperator>().notNull(),
  valueJson: text("value_json", { mode: "json" }).$type<unknown>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const ruleActions = sqliteTable("rule_actions", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id")
    .notNull()
    .references(() => rules.id),
  actionType: text("action_type").$type<RuleActionType>().notNull(),
  paramsJson: text("params_json", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const ruleAuditLog = sqliteTable("rule_audit_log", {
  id: text("id").primaryKey(),
  versionId: text("version_id")
    .notNull()
    .references(() => ruleSetVersions.id),
  claimId: text("claim_id").references(() => claims.id),
  inputsJson: text("inputs_json", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  outputsJson: text("outputs_json", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  matchedRuleIds: text("matched_rule_ids", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  actor: text("actor").notNull(),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const parameters = sqliteTable("parameters", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  valueJson: text("value_json", { mode: "json" }).$type<unknown>().notNull(),
  valueType: text("value_type").$type<ParameterValueType>().notNull(),
  description: text("description"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  updatedBy: text("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const fraudScores = sqliteTable("fraud_scores", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  agentRunId: text("agent_run_id").references(() => agentRuns.id),
  score: integer("score").notNull(),
  band: text("band").$type<FraudBand>().notNull(),
  reasonCodes: text("reason_codes", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  signalsJson: text("signals_json", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  ruleAuditId: text("rule_audit_id").references(() => ruleAuditLog.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const reserves = sqliteTable("reserves", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  kind: text("kind").$type<ReserveKind>().notNull(),
  amount: text("amount").notNull(),
  setBy: text("set_by")
    .notNull()
    .references(() => users.id),
  source: text("source").$type<ReserveSource>().notNull(),
  supersedesId: text("supersedes_id"),
  approvalTaskId: text("approval_task_id").references(() => tasks.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type SettlementItemRow = {
  claimItemId: string;
  amount: string;
};

export const settlements = sqliteTable("settlements", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  itemsJson: text("items_json", { mode: "json" })
    .$type<SettlementItemRow[]>()
    .notNull(),
  deductibleApplied: text("deductible_applied").notNull(),
  totalAmount: text("total_amount").notNull(),
  note: text("note"),
  status: text("status").$type<SettlementStatus>().notNull().default("proposed"),
  proposedBy: text("proposed_by")
    .notNull()
    .references(() => users.id),
  authorityRuleAuditId: text("authority_rule_audit_id").references(
    () => ruleAuditLog.id,
  ),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  payeePartyId: text("payee_party_id").notNull(),
  amount: text("amount").notNull(),
  method: text("method").$type<PaymentMethod>().notNull(),
  status: text("status").$type<PaymentStatus>().notNull().default("pending"),
  reference: text("reference"),
  approvedBy: text("approved_by").references(() => users.id),
  authorityRuleAuditId: text("authority_rule_audit_id").references(
    () => ruleAuditLog.id,
  ),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  claimId: text("claim_id").references(() => claims.id),
  taskId: text("task_id").references(() => tasks.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull(),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  beforeJson: text("before_json", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  afterJson: text("after_json", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  at: integer("at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
