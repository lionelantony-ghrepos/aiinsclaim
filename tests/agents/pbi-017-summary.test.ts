import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { emitMaterialChange, regenerateSummary } from "@/lib/agents/summary";
import { agentRuns, claims } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { insertBaseClaim } from "../helpers/pbi-007-fixtures";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

const EVENT_KINDS = [
  "state_change",
  "doc_applied",
  "fraud_band_change",
  "reserve_change",
  "settlement_change",
] as const;

describe("PBI-017 AGT-SUMMARY agent contract", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  // -----------------------------------------------------------------------
  // TC-017-01: Summary regenerates on each material change event kind
  // -----------------------------------------------------------------------
  describe("TC-017-01 summary regenerates on material change", () => {
    it.each(EVENT_KINDS)(
      "regenerates on %s event",
      async (kind) => {
        const { claimId } = await insertBaseClaim(isolated.db, {
          estimatedAmount: "8000.00",
          incidentDescription: "Rear-end collision at highway on-ramp.",
        });

        // Establish a known previous summary so we can confirm replacement
        await isolated.db
          .update(claims)
          .set({
            summaryMd: "previous summary",
            summaryStale: false,
            summaryGeneratedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(claims.id, claimId));

        // emitMaterialChange should not throw
        await emitMaterialChange(isolated.db, claimId, kind);

        const [updated] = await isolated.db
          .select()
          .from(claims)
          .where(eq(claims.id, claimId))
          .limit(1);

        // Summary must be replaced and non-empty
        expect(updated?.summaryMd).toBeTruthy();
        expect(updated?.summaryMd).not.toBe("previous summary");

        // summaryStale must be cleared
        expect(updated?.summaryStale).toBe(false);

        // summaryGeneratedAt must be set
        expect(updated?.summaryGeneratedAt).toBeInstanceOf(Date);

        // Word count ≤ 200
        const wordCount = (updated?.summaryMd ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean).length;
        expect(wordCount).toBeLessThanOrEqual(200);

        // An agent_run row must be written for this claim
        const runs = await isolated.db
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.claimId, claimId));
        expect(runs.length).toBeGreaterThanOrEqual(1);
        const summaryRun = runs.find((r) => r.agentId === "AGT-SUMMARY");
        expect(summaryRun).toBeDefined();
        expect(summaryRun?.status).toBe("ok");
      },
      60_000,
    );
  });

  // -----------------------------------------------------------------------
  // TC-017-03: Summary failure retains previous content with stale indicator
  // -----------------------------------------------------------------------
  describe("TC-017-03 summary failure retains previous with stale indicator", () => {
    it(
      "gateway failure keeps previous summary and marks stale",
      async () => {
        // Use a real claim for its supporting data (policy, party, etc.)
        const { policyId } = await insertBaseClaim(isolated.db, {});

        // Insert a claim whose ID contains 'gateway-fail' to trigger the
        // AGT-SUMMARY mock failure path in gateway.ts.
        const failClaimId = `gateway-fail-${crypto.randomUUID().slice(0, 8)}`;
        const now = new Date();
        await isolated.db.insert(claims).values({
          id: failClaimId,
          claimNumber: `CLM-FAIL-${failClaimId.slice(0, 8)}`,
          policyId,
          lineOfBusiness: "auto",
          claimType: "collision",
          status: "draft",
          incidentAt: now,
          reportedAt: now,
          summaryMd: "preserved previous summary",
          summaryStale: false,
          summaryGeneratedAt: null,
          createdAt: now,
          updatedAt: now,
        });

        // Should not throw — regenerateSummary absorbs gateway errors
        await expect(
          emitMaterialChange(isolated.db, failClaimId, "state_change"),
        ).resolves.toBeUndefined();

        const [updated] = await isolated.db
          .select()
          .from(claims)
          .where(eq(claims.id, failClaimId))
          .limit(1);

        // summaryMd must be preserved exactly
        expect(updated?.summaryMd).toBe("preserved previous summary");

        // summaryStale must be true
        expect(updated?.summaryStale).toBe(true);

        // An agent_run row is still written (status = failed)
        const runs = await isolated.db
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.claimId, failClaimId));
        expect(runs.length).toBeGreaterThanOrEqual(1);
        const failedRun = runs.find((r) => r.agentId === "AGT-SUMMARY");
        expect(failedRun).toBeDefined();
        expect(failedRun?.status).toBe("failed");
      },
      60_000,
    );
  });

  // -----------------------------------------------------------------------
  // TC-017-01 direct: regenerateSummary returns schema-valid output
  // -----------------------------------------------------------------------
  describe("TC-017-01 runSummaryAgent schema validation", () => {
    it("returns schema-valid summaryMd and keyFacts", async () => {
      const { claimId } = await insertBaseClaim(isolated.db, {
        estimatedAmount: "3500.00",
        incidentDescription: "Vehicle stolen from parking lot overnight.",
      });

      const { agentFailed, agentRunId } = await regenerateSummary(
        isolated.db,
        claimId,
        "test",
      );

      expect(agentFailed).toBe(false);
      expect(agentRunId).toBeTruthy();

      const [updated] = await isolated.db
        .select()
        .from(claims)
        .where(eq(claims.id, claimId))
        .limit(1);

      expect(updated?.summaryMd).toBeTruthy();
      expect(updated?.summaryStale).toBe(false);
    }, 60_000);
  });
});
