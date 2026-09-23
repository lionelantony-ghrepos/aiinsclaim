import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { evaluateRuleSet } from "@/lib/rules";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-012 BR-FRAUD-001 golden tests", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("TC-012-01 worked example → score 65, band high, reason codes", async () => {
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
  });

  it("TC-012-02 banding boundaries (0, 25, 50, 75)", async () => {
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
    expect(low.outputs.fraud_score).toBe(0);
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
      {
        ...base,
        days_since_policy_start: 10,
        claimant_prior_claims_12m: 2,
        narrative_inconsistency: 0.7,
      },
      { asOf: "2026-06-01", dryRun: true },
    );
    expect(high.outputs.fraud_score).toBe(65);
    expect(high.outputs.fraud_band).toBe("high");

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

  it("TC-012-06 agent band in output is ignored — band from rules only", async () => {
    const result = await evaluateRuleSet(isolated.db, "BR-FRAUD-001", {
      days_since_policy_start: 365,
      days_to_report: 0,
      claimant_prior_claims_12m: 0,
      amount_vs_coverage_ratio: 0.1,
      narrative_inconsistency: 0,
      doc_anomaly: 0,
      incident_time_band: "day",
      police_report_present: true,
      claim_type: "glass",
      fraud_band: "critical",
    }, { asOf: "2026-06-01", dryRun: true });

    expect(result.outputs.fraud_band).toBe("low");
    expect(result.outputs.fraud_score).toBe(0);
  });
});
