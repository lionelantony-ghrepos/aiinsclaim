import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import * as gateway from "@/lib/agents/gateway";
import { runFraudAgent } from "@/lib/agents/fraud";
import { agentRuns } from "@/lib/db/schema";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { insertBaseClaim } from "../helpers/pbi-007-fixtures";
import fraudHighSignals from "../fixtures/gateway/fraud-high-signals.json";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-012 AGT-FRAUD agent contract", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-012-03 signals include validated evidence and agent_run logged", async () => {
    vi.spyOn(gateway, "callAiGateway").mockResolvedValue({
      output: fraudHighSignals,
      model: "mock:fixture",
      latencyMs: 1,
    });

    const narrative =
      "Timeline contradicts police report timestamp in the incident account.";
    const { claimId } = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      incidentDescription: narrative,
    });

    const result = await runFraudAgent(isolated.db, {
      claimId,
      narrative,
      extractedDocFields: {},
      incidentFacts: {
        claimType: "collision",
        lineOfBusiness: "auto",
        incidentAt: new Date().toISOString(),
        policeReportPresent: true,
        estimatedAmount: 5000,
      },
      timelineFacts: {
        daysSincePolicyStart: 12,
        daysToReport: 0,
        priorClaims12m: 2,
        amountVsCoverageRatio: 0.5,
        incidentTimeBand: "day",
      },
    });

    expect(result.agentFailed).toBe(false);
    expect(result.output?.narrativeInconsistency).toBe(0.7);
    expect(result.output?.evidence.length).toBeGreaterThan(0);
    expect(result.output?.evidence[0]?.source).toBe("narrative");

    const [run] = await isolated.db
      .select()
      .from(agentRuns)
      .where(
        and(eq(agentRuns.id, result.agentRunId), eq(agentRuns.agentId, "AGT-FRAUD")),
      );
    expect(run?.status).toBe("ok");
  });

  it("rejects agent output that includes fraud_band", async () => {
    vi.spyOn(gateway, "callAiGateway").mockResolvedValue({
      output: {
        ...fraudHighSignals,
        fraud_band: "critical",
      },
      model: "mock:bad",
      latencyMs: 1,
    });

    const { claimId } = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      incidentDescription: "Timeline contradicts police report timestamp.",
    });

    const result = await runFraudAgent(isolated.db, {
      claimId,
      narrative: "Timeline contradicts police report timestamp.",
      extractedDocFields: {},
      incidentFacts: {
        claimType: "collision",
        lineOfBusiness: "auto",
        incidentAt: new Date().toISOString(),
        policeReportPresent: true,
        estimatedAmount: 5000,
      },
      timelineFacts: {
        daysSincePolicyStart: 12,
        daysToReport: 0,
        priorClaims12m: 0,
        amountVsCoverageRatio: 0.5,
        incidentTimeBand: "day",
      },
    });

    expect(result.agentFailed).toBe(true);
    expect(result.output).toBeNull();
  });

});
