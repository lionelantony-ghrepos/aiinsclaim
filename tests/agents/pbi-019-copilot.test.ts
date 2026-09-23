import { describe, expect, it } from "vitest";
import {
  applyCopilotRowLimit,
  CopilotQueryRejectedError,
  validateCopilotSql,
} from "@/lib/agents/copilot";

describe("PBI-019 AGT-COPILOT", () => {
  it("TC-019-01 accepts only approved reporting views", () => {
    const sql =
      "SELECT claim_number, status FROM vw_claims_reporting ORDER BY claim_number";

    expect(() => validateCopilotSql(sql)).not.toThrow();
    expect(() =>
      validateCopilotSql("SELECT * FROM claims"),
    ).toThrow(CopilotQueryRejectedError);
  });

  it("TC-019-02 refuses mutation-seeking prompts expressed as SQL", () => {
    expect(() =>
      validateCopilotSql("DELETE FROM vw_claims_reporting"),
    ).toThrow("Only read-only SELECT queries are allowed.");
    expect(() =>
      validateCopilotSql(
        "SELECT * FROM vw_claims_reporting; DELETE FROM vw_claims_reporting",
      ),
    ).toThrow("Mutation-seeking queries are refused.");
  });

  it("TC-019-03 clamps an oversized limit and adds one when absent", () => {
    expect(
      applyCopilotRowLimit(
        "SELECT * FROM vw_claims_reporting LIMIT 999999",
        500,
      ),
    ).toContain("LIMIT 500");
    expect(
      applyCopilotRowLimit("SELECT * FROM vw_claims_reporting", 500),
    ).toMatch(/LIMIT 500$/);
  });
});
