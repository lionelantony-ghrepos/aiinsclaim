import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  ClaimPartyRole,
  ClaimRoute,
  ClaimStatus,
  ClaimType,
  Lob,
  SiuDisposition,
} from "./enums";
import { parties, policies, users } from "./identity";

export const sequences = sqliteTable("sequences", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const claims = sqliteTable("claims", {
  id: text("id").primaryKey(),
  claimNumber: text("claim_number").notNull().unique(),
  policyId: text("policy_id")
    .notNull()
    .references(() => policies.id),
  lineOfBusiness: text("line_of_business").$type<Lob>().notNull(),
  claimType: text("claim_type").$type<ClaimType>().notNull(),
  status: text("status").$type<ClaimStatus>().notNull().default("draft"),
  incidentAt: integer("incident_at", { mode: "timestamp_ms" }).notNull(),
  reportedAt: integer("reported_at", { mode: "timestamp_ms" }).notNull(),
  incidentDescription: text("incident_description"),
  incidentLocationJson: text("incident_location_json", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  estimatedAmount: text("estimated_amount"),
  severityScore: integer("severity_score"),
  complexityScore: integer("complexity_score"),
  route: text("route").$type<ClaimRoute>(),
  priority: integer("priority"),
  assignedTo: text("assigned_to").references(() => users.id),
  siuReferred: integer("siu_referred", { mode: "boolean" })
    .notNull()
    .default(false),
  siuDisposition: text("siu_disposition").$type<SiuDisposition>(),
  injuryInvolved: integer("injury_involved", { mode: "boolean" })
    .notNull()
    .default(false),
  liabilityDisputed: integer("liability_disputed", { mode: "boolean" })
    .notNull()
    .default(false),
  policeReportPresent: integer("police_report_present", { mode: "boolean" })
    .notNull()
    .default(false),
  policeReportNumber: text("police_report_number"),
  summaryMd: text("summary_md"),
  denialReasonCode: text("denial_reason_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const claimParties = sqliteTable("claim_parties", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  partyId: text("party_id")
    .notNull()
    .references(() => parties.id),
  role: text("role").$type<ClaimPartyRole>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const claimItems = sqliteTable("claim_items", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  itemType: text("item_type").notNull(),
  description: text("description").notNull(),
  vehicleJson: text("vehicle_json", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  claimedAmount: text("claimed_amount"),
  assessedAmount: text("assessed_amount"),
  assessmentStatus: text("assessment_status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const claimTransitions = sqliteTable("claim_transitions", {
  id: text("id").primaryKey(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").$type<ClaimStatus>().notNull(),
  triggerLabel: text("trigger_label").notNull(),
  guardCode: text("guard_code"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const claimStateHistory = sqliteTable("claim_state_history", {
  id: text("id").primaryKey(),
  claimId: text("claim_id")
    .notNull()
    .references(() => claims.id),
  fromStatus: text("from_status").$type<ClaimStatus>(),
  toStatus: text("to_status").$type<ClaimStatus>().notNull(),
  triggeredBy: text("triggered_by").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason"),
  ruleAuditId: text("rule_audit_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
