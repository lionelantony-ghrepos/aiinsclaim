import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runReserveAgent } from "@/lib/agents/reserve";
import type { IsolatedDb } from "@/lib/db/isolated";
import {
  agentRuns,
  claimItems,
  claims,
  parties,
  policies,
  users,
} from "@/lib/db/schema";
import type { ClaimType, Lob } from "@/lib/db/schema";
import { evaluateExpenseReserve, evaluateReserveFormula } from "@/lib/reserve-math";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-015 reserve math (pure)", () => {
  it("injury formula uses factor and base", () => {
    expect(evaluateReserveFormula("estimated_amount * reserve.injury_factor + reserve.injury_base", 5000, undefined, 1.5, 10000)).toBe(17500);
  });
  it("min() formula caps at ACV", () => {
    expect(evaluateReserveFormula("min(estimated_amount, vehicle_acv) * 1.0", 8500, 6000, 1.5, 10000)).toBe(6000);
    expect(evaluateReserveFormula("min(estimated_amount, vehicle_acv) * 1.0", 8500, undefined, 1.5, 10000)).toBe(8500);
  });
  it("multiplier formulas scale the estimate", () => {
    expect(evaluateReserveFormula("estimated_amount * 1.1", 3200, undefined, 1.5, 10000)).toBeCloseTo(3520, 5);
    expect(evaluateReserveFormula("estimated_amount * 1.4", 45000, undefined, 1.5, 10000)).toBe(63000);
  });
  it("expense reserve applies the rule pct", () => {
    expect(evaluateExpenseReserve(3520, 5)).toBeCloseTo(176, 5);
    expect(evaluateExpenseReserve(17500, 15)).toBe(2625);
  });
});

describe("PBI-015 AGT-RESERVE golden rows (TC-015-03)", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  async function insertReserveClaim(opts: {
    lob: Lob;
    claimType: ClaimType;
    estimatedAmount: string;
    injuryInvolved?: boolean;
    vehicleAcv?: number;
  }) {
    const now = new Date();
    const userId = crypto.randomUUID();
    const partyId = crypto.randomUUID();
    const policyId = crypto.randomUUID();
    const claimId = crypto.randomUUID();
    await isolated.db.insert(users).values({
      id: userId,
      email: `reserve-${claimId.slice(0, 8)}@test.local`,
      passwordHash: "x",
      displayName: "Reserve Fixture User",
      role: "claimant",
      createdAt: now,
      updatedAt: now,
    });
    await isolated.db.insert(parties).values({
      id: partyId,
      partyType: "person",
      fullName: "Reserve Fixture Holder",
      userId,
      createdAt: now,
      updatedAt: now,
    });
    await isolated.db.insert(policies).values({
      id: policyId,
      policyNumber: `POL-${policyId.slice(0, 8)}`,
      holderPartyId: partyId,
      lineOfBusiness: opts.lob,
      status: "active",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      coverageJson: {},
      createdAt: now,
      updatedAt: now,
    });
    await isolated.db.insert(claims).values({
      id: claimId,
      claimNumber: `CLM-2026-${claimId.replaceAll("-", "").slice(0, 6)}`,
      policyId,
      lineOfBusiness: opts.lob,
      claimType: opts.claimType,
      status: "in_assessment",
      incidentAt: now,
      reportedAt: now,
      incidentDescription: "Reserve golden fixture",
      estimatedAmount: opts.estimatedAmount,
      injuryInvolved: opts.injuryInvolved ?? false,
      createdAt: now,
      updatedAt: now,
    });
    if (opts.vehicleAcv !== undefined) {
      await isolated.db.insert(claimItems).values({
        id: crypto.randomUUID(),
        claimId,
        itemType: "vehicle",
        description: "Fixture vehicle",
        vehicleJson: { acv: opts.vehicleAcv },
        createdAt: now,
        updatedAt: now,
      });
    }
    return claimId;
  }

  it("injury row: est * factor + base with 15% expense", async () => {
    const claimId = await insertReserveClaim({
      lob: "auto",
      claimType: "collision",
      estimatedAmount: "5000.00",
      injuryInvolved: true,
    });
    const { suggestion, agentRunId } = await runReserveAgent(isolated.db, claimId, {
      actor: "test:reserve",
    });
    expect(suggestion.indemnityAmount).toBe("17500.00");
    expect(suggestion.expensePct).toBe(15);
    expect(suggestion.expenseAmount).toBe("2625.00");
    expect(suggestion.ruleAuditId).toBeTruthy();
    expect(suggestion.rationale).toContain("BR-RESERVE-001");
    expect(agentRunId).toBeTruthy();
  });

  it("auto collision row: est * 1.1 with 5% expense", async () => {
    const claimId = await insertReserveClaim({
      lob: "auto",
      claimType: "collision",
      estimatedAmount: "3200.00",
    });
    const { suggestion } = await runReserveAgent(isolated.db, claimId, {
      actor: "test:reserve",
    });
    expect(suggestion.indemnityAmount).toBe("3520.00");
    expect(suggestion.expensePct).toBe(5);
    expect(suggestion.expenseAmount).toBe("176.00");
  });

  it("auto theft row: min(est, acv) with 5% expense", async () => {
    const withoutAcv = await insertReserveClaim({
      lob: "auto",
      claimType: "theft",
      estimatedAmount: "8500.00",
    });
    const plain = await runReserveAgent(isolated.db, withoutAcv, {
      actor: "test:reserve",
    });
    expect(plain.suggestion.indemnityAmount).toBe("8500.00");
    expect(plain.suggestion.expenseAmount).toBe("425.00");

    const withAcv = await insertReserveClaim({
      lob: "auto",
      claimType: "theft",
      estimatedAmount: "8500.00",
      vehicleAcv: 6000,
    });
    const capped = await runReserveAgent(isolated.db, withAcv, {
      actor: "test:reserve",
    });
    expect(capped.suggestion.indemnityAmount).toBe("6000.00");
    expect(capped.suggestion.expenseAmount).toBe("300.00");
  });

  it("property water row: est * 1.25 with 10% expense", async () => {
    const claimId = await insertReserveClaim({
      lob: "property",
      claimType: "water_damage",
      estimatedAmount: "12000.00",
    });
    const { suggestion } = await runReserveAgent(isolated.db, claimId, {
      actor: "test:reserve",
    });
    expect(suggestion.indemnityAmount).toBe("15000.00");
    expect(suggestion.expensePct).toBe(10);
    expect(suggestion.expenseAmount).toBe("1500.00");
  });

  it("property fire row: est * 1.4 with 12% expense", async () => {
    const claimId = await insertReserveClaim({
      lob: "property",
      claimType: "fire",
      estimatedAmount: "45000.00",
    });
    const { suggestion } = await runReserveAgent(isolated.db, claimId, {
      actor: "test:reserve",
    });
    expect(suggestion.indemnityAmount).toBe("63000.00");
    expect(suggestion.expensePct).toBe(12);
    expect(suggestion.expenseAmount).toBe("7560.00");
  });

  it("property storm row: est * 1.15 with 8% expense", async () => {
    const claimId = await insertReserveClaim({
      lob: "property",
      claimType: "storm",
      estimatedAmount: "9000.00",
    });
    const { suggestion } = await runReserveAgent(isolated.db, claimId, {
      actor: "test:reserve",
    });
    expect(suggestion.indemnityAmount).toBe("10350.00");
    expect(suggestion.expensePct).toBe(8);
    expect(suggestion.expenseAmount).toBe("828.00");
  });

  it("default row: est * 1.1 with 8% expense", async () => {
    const claimId = await insertReserveClaim({
      lob: "auto",
      claimType: "glass",
      estimatedAmount: "650.00",
    });
    const { suggestion } = await runReserveAgent(isolated.db, claimId, {
      actor: "test:reserve",
    });
    expect(suggestion.indemnityAmount).toBe("715.00");
    expect(suggestion.expensePct).toBe(8);
    expect(suggestion.expenseAmount).toBe("57.20");
  });

  it("logs an AGT-RESERVE agent run per suggestion", async () => {
    const claimId = await insertReserveClaim({
      lob: "auto",
      claimType: "collision",
      estimatedAmount: "2000.00",
    });
    const { agentRunId } = await runReserveAgent(isolated.db, claimId, {
      actor: "test:reserve",
    });
    const [run] = await isolated.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, agentRunId));
    expect(run?.agentId).toBe("AGT-RESERVE");
    expect(run?.claimId).toBe(claimId);
    expect(run?.status).toBe("ok");
  });
});
