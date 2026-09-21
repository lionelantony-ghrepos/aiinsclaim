import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { ruleAuditLog } from "@/lib/db/schema";
import {
  evaluateRuleSet,
  NoActiveVersionError,
  RuleValidationError,
} from "@/lib/rules";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-006 rules engine golden tests", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("TC-006-01 BR-TRIAGE-001 worked example → green_lane", async () => {
    const result = await evaluateRuleSet(isolated.db, "BR-TRIAGE-001", {
      line_of_business: "auto",
      estimated_amount: 1800,
      injury_involved: false,
      liability_disputed: false,
      severity_score: 22,
      complexity_score: 15,
      policy_active: true,
    }, { asOf: "2026-06-01", actor: "test:triage" });

    expect(result.outputs.route).toBe("green_lane");
    expect(result.outputs.priority).toBe(2);
    expect(result.outputs.target_queue).toBeNull();
    expect(result.matchedRuleIds).toHaveLength(1);
    expect(result.auditId).toBeDefined();
  });

  it("TC-006-01 BR-STP-001 worked example → STP pass", async () => {
    const result = await evaluateRuleSet(isolated.db, "BR-STP-001", {
      route: "green_lane",
      fraud_band: "low",
      all_required_docs_extracted: true,
      extraction_min_confidence: 0.94,
      claimant_prior_claims_12m: 0,
      estimated_amount: 1800,
    }, { asOf: "2026-06-01", actor: "test:stp" });

    expect(result.outputs.stp_allowed).toBe(true);
    expect(result.outputs.reason_code).toBe("STP-PASS");
  });

  it("TC-006-01 BR-FRAUD-001 worked example → high band score 65", async () => {
    const result = await evaluateRuleSet(isolated.db, "BR-FRAUD-001", {
      days_since_policy_start: 12,
      days_to_report: 0,
      claimant_prior_claims_12m: 2,
      amount_vs_coverage_ratio: 0.5,
      narrative_inconsistency: 0.7,
      doc_anomaly: 0,
      incident_time_band: "day",
      police_report_present: true,
      claim_type: "collision",
    }, { asOf: "2026-06-01", actor: "test:fraud" });

    expect(result.outputs.fraud_score).toBe(65);
    expect(result.outputs.fraud_band).toBe("high");
    expect(result.outputs.reason_codes).toEqual([
      "NEW_POLICY",
      "FREQUENCY",
      "NARRATIVE",
    ]);
    expect(result.outputs.block_stp).toBe(true);
    expect(result.outputs.tasks).toEqual([
      { type: "review_fraud", queue: "siu", priority: 4 },
    ]);
  });

  it("TC-006-01 BR-FRAUD-001 banding boundaries", async () => {
    const base = {
      days_since_policy_start: 365,
      days_to_report: 0,
      claimant_prior_claims_12m: 0,
      amount_vs_coverage_ratio: 0.1,
      narrative_inconsistency: 0,
      doc_anomaly: 0,
      incident_time_band: "day" as const,
      police_report_present: true,
      claim_type: "glass" as const,
    };

    const low = await evaluateRuleSet(
      isolated.db,
      "BR-FRAUD-001",
      base,
      { asOf: "2026-06-01", dryRun: true },
    );
    expect(low.outputs.fraud_band).toBe("low");

    const medium = await evaluateRuleSet(
      isolated.db,
      "BR-FRAUD-001",
      { ...base, days_since_policy_start: 10 },
      { asOf: "2026-06-01", dryRun: true },
    );
    expect(medium.outputs.fraud_score).toBe(25);
    expect(medium.outputs.fraud_band).toBe("medium");

    const high = await evaluateRuleSet(
      isolated.db,
      "BR-FRAUD-001",
      { ...base, days_since_policy_start: 10, claimant_prior_claims_12m: 2 },
      { asOf: "2026-06-01", dryRun: true },
    );
    expect(high.outputs.fraud_score).toBe(45);
    expect(high.outputs.fraud_band).toBe("medium");

    const highBand = await evaluateRuleSet(
      isolated.db,
      "BR-FRAUD-001",
      {
        ...base,
        days_since_policy_start: 10,
        claimant_prior_claims_12m: 2,
        narrative_inconsistency: 0.7,
      },
      { asOf: "2026-06-01", dryRun: true },
    );
    expect(highBand.outputs.fraud_score).toBe(65);
    expect(highBand.outputs.fraud_band).toBe("high");

    const critical = await evaluateRuleSet(
      isolated.db,
      "BR-FRAUD-001",
      {
        ...base,
        days_since_policy_start: 10,
        days_to_report: 30,
        claimant_prior_claims_12m: 2,
        amount_vs_coverage_ratio: 0.95,
        narrative_inconsistency: 0.8,
        doc_anomaly: 0.7,
      },
      { asOf: "2026-06-01", dryRun: true },
    );
    expect(critical.outputs.fraud_score).toBeGreaterThanOrEqual(75);
    expect(critical.outputs.fraud_band).toBe("critical");
  });

  it("TC-006-01 BR-AUTH-001 worked example → require_next_level", async () => {
    const result = await evaluateRuleSet(isolated.db, "BR-AUTH-001", {
      settlement_amount: 32000,
      approver_role: "adjuster",
      approver_authority_level: 2,
      fraud_band: "low",
      siu_referred: false,
    }, { asOf: "2026-06-01", actor: "test:auth" });

    expect(result.outputs.decision).toBe("require_next_level");
    expect(result.outputs.tasks).toEqual([
      { type: "approve_settlement", queue: "supervision" },
    ]);
  });

  it("TC-006-04 writes rule_audit_log on successful evaluation", async () => {
    const before = await isolated.db
      .select({ total: count() })
      .from(ruleAuditLog);

    const result = await evaluateRuleSet(
      isolated.db,
      "BR-STP-001",
      {
        route: "green_lane",
        fraud_band: "low",
        all_required_docs_extracted: true,
        extraction_min_confidence: 0.95,
        claimant_prior_claims_12m: 0,
        estimated_amount: 1000,
      },
      { asOf: "2026-06-01", actor: "user:test-user" },
    );

    const after = await isolated.db
      .select({ total: count() })
      .from(ruleAuditLog);

    expect(after[0].total).toBe((before[0]?.total ?? 0) + 1);
    expect(result.auditId).toBeDefined();

    const [auditRow] = await isolated.db
      .select()
      .from(ruleAuditLog)
      .where(eq(ruleAuditLog.id, result.auditId!));

    expect(auditRow.actor).toBe("user:test-user");
    expect(auditRow.inputsJson.estimated_amount).toBe(1000);
    expect(auditRow.outputsJson.stp_allowed).toBe(true);
    expect(auditRow.matchedRuleIds).toEqual(result.matchedRuleIds);
    expect(auditRow.versionId).toBe(result.versionId);
  });

  it("TC-006-03 invalid inputs throw RuleValidationError without audit row", async () => {
    const before = await isolated.db
      .select({ total: count() })
      .from(ruleAuditLog);

    await expect(
      evaluateRuleSet(isolated.db, "BR-TRIAGE-001", {
        line_of_business: "auto",
        estimated_amount: "not-a-number",
      }),
    ).rejects.toBeInstanceOf(RuleValidationError);

    const after = await isolated.db
      .select({ total: count() })
      .from(ruleAuditLog);

    expect(after[0].total).toBe(before[0]?.total ?? 0);
  });

  it("TC-006-06 no active version as-of date throws NoActiveVersionError", async () => {
    await expect(
      evaluateRuleSet(
        isolated.db,
        "BR-TRIAGE-001",
        {
          line_of_business: "auto",
          estimated_amount: 1800,
          injury_involved: false,
          liability_disputed: false,
          severity_score: 22,
          complexity_score: 15,
          policy_active: true,
        },
        { asOf: "2025-01-01" },
      ),
    ).rejects.toBeInstanceOf(NoActiveVersionError);
  });

  it("TC-006-05 hit policy first stops after first match", async () => {
    const result = await evaluateRuleSet(
      isolated.db,
      "BR-TRIAGE-001",
      {
        line_of_business: "auto",
        estimated_amount: 50000,
        injury_involved: true,
        liability_disputed: true,
        severity_score: 80,
        complexity_score: 80,
        policy_active: true,
      },
      { asOf: "2026-06-01", dryRun: true },
    );

    expect(result.outputs.route).toBe("complex");
    expect(result.outputs.priority).toBe(5);
    expect(result.matchedRuleIds).toHaveLength(1);
  });

  it("TC-006-05 hit policy all fires every matching row", async () => {
    const result = await evaluateRuleSet(
      isolated.db,
      "BR-SLA-001",
      { trigger: "claim_submitted" },
      { asOf: "2026-06-01", dryRun: true },
    );

    expect(result.outputs.timer_code).toBe("acknowledge_claimant");
    expect(result.matchedRuleIds).toHaveLength(1);
  });
});
