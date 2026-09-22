import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { runTriageAgent } from "@/lib/agents/triage";
import { agentRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { insertBaseClaim } from "../helpers/pbi-007-fixtures";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-011 AGT-TRIAGE agent contract", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("returns schema-valid scores and logs agent_run", async () => {
    const { claimId } = await insertBaseClaim(isolated.db, {
      estimatedAmount: "1800.00",
    });
    const output = await runTriageAgent(isolated.db, {
      claimSnapshot: {
        claimId,
        claimType: "collision",
        lineOfBusiness: "auto",
        estimatedAmount: 1800,
        injuryInvolved: false,
        liabilityDisputed: false,
        incidentDescription: "Minor bumper damage.",
      },
      extractedFields: {},
      policyCoverageSummary: {
        active: true,
        lineOfBusiness: "auto",
      },
      priorClaimCounts: { claims12m: 0 },
    });

    expect(output.agentFailed).toBe(false);
    expect(output.output?.severityScore).toBeLessThan(30);
    expect(output.output?.complexityScore).toBeLessThan(30);

    const [run] = await isolated.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, output.agentRunId));
    expect(run?.agentId).toBe("AGT-TRIAGE");
    expect(run?.status).toBe("ok");
  });
});
