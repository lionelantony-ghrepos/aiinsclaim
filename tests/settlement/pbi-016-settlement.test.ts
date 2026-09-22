import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import {
  claims,
  fraudScores,
  notifications,
  payments,
  settlements,
  tasks,
} from "@/lib/db/schema";
import { DENIAL_REASON_CODES } from "@/lib/schemas/denial";
import { getParameter } from "@/lib/rules/params";
import { computeSettlementTotal } from "@/lib/settlement-math";
import {
  approveSettlement,
  closeClaim,
  denyClaim,
  issuePayment,
  proposeSettlement,
} from "@/lib/settlement/service";
import { resolveTaskDb } from "@/lib/db/queries/tasks-queue";
import { seedClaimTransitions } from "../../seed/loaders/transitions";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  insertSettlementClaim,
  insertStaffUser,
} from "../helpers/pbi-016-fixtures";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-016 settlement math (pure)", () => {
  it("sums items and subtracts deductible in cents", () => {
    expect(
      computeSettlementTotal(
        [{ amount: "1000.00" }, { amount: "250.50" }],
        "100.00",
      ),
    ).toBe("1150.50");
    expect(computeSettlementTotal([{ amount: "50.00" }], "75.00")).toBe("0.00");
    expect(
      computeSettlementTotal([{ amount: "10.10" }, { amount: "0.05" }], "0.05"),
    ).toBe("10.10");
  });
});

describe("PBI-016 DenialReasonEnum matches seeded parameter", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("schema denial codes equal denial.reason_codes seed", async () => {
    const param = await getParameter(isolated.db, "denial.reason_codes");
    expect(param.valueJson).toEqual([...DENIAL_REASON_CODES]);
  });
});

describe("PBI-016 settlement authority & payments", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
    await seedClaimTransitions(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("TC-016-01 level-2 + 32000 → require_next_level creates approve_settlement task", async () => {
    const adjuster = await insertStaffUser(isolated.db, {
      role: "adjuster",
      authorityLevel: 2,
    });
    const fixture = await insertSettlementClaim(isolated.db, {
      assignedTo: adjuster.id,
      estimatedAmount: "32000.00",
    });
    // AC-016-01 Given: fraud band low (worked example BR-AUTH-001)
    await isolated.db.insert(fraudScores).values({
      id: crypto.randomUUID(),
      claimId: fixture.claimId,
      score: 10,
      band: "low",
      reasonCodes: [],
      signalsJson: {},
      createdAt: new Date(),
    });

    const proposed = await proposeSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      items: [{ claimItemId: fixture.itemId, amount: "32500.00" }],
      deductibleApplied: "500.00",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.data.totalAmount).toBe("32000.00");

    const approved = await approveSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      settlementId: proposed.data.settlementId,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.data.decision).toBe("routed");
    if (approved.data.decision !== "routed") return;
    expect(approved.data.message).toBe(
      "Above your authority — routed to supervision.",
    );

    const [task] = await isolated.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, approved.data.taskId));
    expect(task.type).toBe("approve_settlement");
    expect(task.queue).toBe("supervision");
    expect(task.status).toBe("open");

    const [claim] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(claim.status).toBe("in_settlement");

    const [settlement] = await isolated.db
      .select()
      .from(settlements)
      .where(eq(settlements.id, proposed.data.settlementId));
    expect(settlement.status).toBe("pending_approval");
  });

  it("TC-016-02 matching authority levels allow → approved", async () => {
    const cases: { level: number; amount: string; role: "adjuster" | "supervisor" | "admin" }[] = [
      { level: 1, amount: "5000.00", role: "adjuster" },
      { level: 2, amount: "25000.00", role: "adjuster" },
      { level: 3, amount: "100000.00", role: "supervisor" },
      { level: 4, amount: "150000.00", role: "admin" },
    ];

    for (const row of cases) {
      const user = await insertStaffUser(isolated.db, {
        role: row.role,
        authorityLevel: row.level,
      });
      const fixture = await insertSettlementClaim(isolated.db, {
        assignedTo: user.id,
        estimatedAmount: row.amount,
      });
      const proposed = await proposeSettlement(isolated.db, user, {
        claimId: fixture.claimId,
        items: [{ claimItemId: fixture.itemId, amount: row.amount }],
        deductibleApplied: "0.00",
      });
      expect(proposed.ok).toBe(true);
      if (!proposed.ok) continue;

      const result = await approveSettlement(isolated.db, user, {
        claimId: fixture.claimId,
        settlementId: proposed.data.settlementId,
      });
      expect(result.ok, `level ${row.level} amount ${row.amount}`).toBe(true);
      if (!result.ok) continue;
      expect(result.data.decision).toBe("allowed");

      const [claim] = await isolated.db
        .select()
        .from(claims)
        .where(eq(claims.id, fixture.claimId));
      expect(claim.status).toBe("approved");
    }
  });

  it("TC-016-03 SIU hold blocks approval with SIU_HOLD", async () => {
    const adjuster = await insertStaffUser(isolated.db, {
      role: "adjuster",
      authorityLevel: 2,
    });
    const fixture = await insertSettlementClaim(isolated.db, {
      assignedTo: adjuster.id,
      estimatedAmount: "1000.00",
      siuReferred: true,
      siuDisposition: "open",
    });
    const proposed = await proposeSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      items: [{ claimItemId: fixture.itemId, amount: "1000.00" }],
      deductibleApplied: "0.00",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const result = await approveSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      settlementId: proposed.data.settlementId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SIU_HOLD");

    const [claim] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(claim.status).toBe("in_settlement");
  });

  it("TC-016-04 issue payment then close with open-task gate", async () => {
    const adjuster = await insertStaffUser(isolated.db, {
      role: "adjuster",
      authorityLevel: 2,
    });
    const fixture = await insertSettlementClaim(isolated.db, {
      assignedTo: adjuster.id,
      estimatedAmount: "2000.00",
    });
    const proposed = await proposeSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      items: [{ claimItemId: fixture.itemId, amount: "2000.00" }],
      deductibleApplied: "0.00",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const approved = await approveSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      settlementId: proposed.data.settlementId,
    });
    expect(approved.ok).toBe(true);

    const paid = await issuePayment(isolated.db, adjuster, {
      claimId: fixture.claimId,
      settlementId: proposed.data.settlementId,
      method: "ach_mock",
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(paid.data.reference.startsWith("ACH-MOCK-")).toBe(true);

    const [payment] = await isolated.db
      .select()
      .from(payments)
      .where(eq(payments.id, paid.data.paymentId));
    expect(payment.status).toBe("issued");
    expect(payment.reference).toBe(paid.data.reference);

    const [paidClaim] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(paidClaim.status).toBe("paid");

    await isolated.db.insert(tasks).values({
      id: crypto.randomUUID(),
      claimId: fixture.claimId,
      type: "assess_claim",
      queue: "adjusting",
      priority: 3,
      status: "open",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const blocked = await closeClaim(isolated.db, adjuster, {
      claimId: fixture.claimId,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("GUARD_FAILED");
      expect(blocked.error.message).toMatch(/open task/i);
    }

    await isolated.db
      .update(tasks)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(tasks.claimId, fixture.claimId));

    const closed = await closeClaim(isolated.db, adjuster, {
      claimId: fixture.claimId,
    });
    expect(closed.ok).toBe(true);
    const [closedClaim] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(closedClaim.status).toBe("closed");
  });

  it("TC-016-05 denial requires reason, supervisor gate, then notifies", async () => {
    const adjuster = await insertStaffUser(isolated.db, {
      role: "adjuster",
      authorityLevel: 2,
    });
    const supervisor = await insertStaffUser(isolated.db, {
      role: "supervisor",
      authorityLevel: 3,
    });
    const fixture = await insertSettlementClaim(isolated.db, {
      assignedTo: adjuster.id,
      estimatedAmount: "4000.00",
    });

    const missingNote = await denyClaim(isolated.db, adjuster, {
      claimId: fixture.claimId,
      reasonCode: "COVERAGE_EXCLUDED",
      note: "short",
    });
    expect(missingNote.ok).toBe(false);
    if (!missingNote.ok) {
      expect(missingNote.error.code).toBe("REASON_REQUIRED");
    }

    const [unchanged] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(unchanged.status).toBe("in_settlement");
    expect(unchanged.denialReasonCode).toBeNull();

    const requested = await denyClaim(isolated.db, adjuster, {
      claimId: fixture.claimId,
      reasonCode: "COVERAGE_EXCLUDED",
      note: "Coverage exclusion confirmed after review of policy language.",
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;

    const [midClaim] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(midClaim.status).toBe("in_settlement");
    expect(midClaim.denialReasonCode).toBe("COVERAGE_EXCLUDED");

    const [denyTask] = await isolated.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, requested.data.taskId));
    expect(denyTask.type).toBe("escalation");
    expect((denyTask.payloadJson as { kind?: string }).kind).toBe(
      "deny_confirmation",
    );

    const pendingNotes = await isolated.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.claimId, fixture.claimId),
          eq(notifications.kind, "denial_pending"),
        ),
      );
    expect(pendingNotes.length).toBeGreaterThanOrEqual(1);

    const resolved = await resolveTaskDb(
      isolated.db,
      requested.data.taskId,
      "accepted",
      undefined,
      undefined,
      supervisor.id,
    );
    expect(resolved.ok).toBe(true);

    const [deniedClaim] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(deniedClaim.status).toBe("denied");

    const confirmedNotes = await isolated.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.claimId, fixture.claimId),
          eq(notifications.kind, "claim_denied"),
        ),
      );
    expect(confirmedNotes.length).toBeGreaterThanOrEqual(1);
  });

  it("supervisor accept of approve_settlement at level 3 allows 32000", async () => {
    const adjuster = await insertStaffUser(isolated.db, {
      role: "adjuster",
      authorityLevel: 2,
    });
    const supervisor = await insertStaffUser(isolated.db, {
      role: "supervisor",
      authorityLevel: 3,
    });
    const fixture = await insertSettlementClaim(isolated.db, {
      assignedTo: adjuster.id,
      estimatedAmount: "32000.00",
    });
    const proposed = await proposeSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      items: [{ claimItemId: fixture.itemId, amount: "32000.00" }],
      deductibleApplied: "0.00",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const routed = await approveSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      settlementId: proposed.data.settlementId,
    });
    expect(routed.ok).toBe(true);
    if (!routed.ok || routed.data.decision !== "routed") return;

    const resolved = await resolveTaskDb(
      isolated.db,
      routed.data.taskId,
      "accepted",
      undefined,
      undefined,
      supervisor.id,
    );
    expect(resolved.ok).toBe(true);

    const [claim] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(claim.status).toBe("approved");
  });

  it("second approve on pending 32k settlement does not create duplicate task", async () => {
    const adjuster = await insertStaffUser(isolated.db, {
      role: "adjuster",
      authorityLevel: 2,
    });
    const fixture = await insertSettlementClaim(isolated.db, {
      assignedTo: adjuster.id,
      estimatedAmount: "32000.00",
    });
    const proposed = await proposeSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      items: [{ claimItemId: fixture.itemId, amount: "32000.00" }],
      deductibleApplied: "0.00",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const first = await approveSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      settlementId: proposed.data.settlementId,
    });
    expect(first.ok).toBe(true);
    if (!first.ok || first.data.decision !== "routed") return;

    const second = await approveSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      settlementId: proposed.data.settlementId,
    });
    expect(second.ok).toBe(true);
    if (!second.ok || second.data.decision !== "routed") return;
    expect(second.data.taskId).toBe(first.data.taskId);

    const openTasks = await isolated.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.claimId, fixture.claimId),
          eq(tasks.type, "approve_settlement"),
          eq(tasks.status, "open"),
        ),
      );
    expect(openTasks).toHaveLength(1);
  });

  it("supervisor reject of approve_settlement requires reason and does not approve", async () => {
    const adjuster = await insertStaffUser(isolated.db, {
      role: "adjuster",
      authorityLevel: 2,
    });
    const supervisor = await insertStaffUser(isolated.db, {
      role: "supervisor",
      authorityLevel: 3,
    });
    const fixture = await insertSettlementClaim(isolated.db, {
      assignedTo: adjuster.id,
      estimatedAmount: "32000.00",
    });
    const proposed = await proposeSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      items: [{ claimItemId: fixture.itemId, amount: "32000.00" }],
      deductibleApplied: "0.00",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const routed = await approveSettlement(isolated.db, adjuster, {
      claimId: fixture.claimId,
      settlementId: proposed.data.settlementId,
    });
    expect(routed.ok).toBe(true);
    if (!routed.ok || routed.data.decision !== "routed") return;

    await expect(
      resolveTaskDb(
        isolated.db,
        routed.data.taskId,
        "rejected",
        undefined,
        undefined,
        supervisor.id,
      ),
    ).rejects.toThrow(/resolution_reason is required/i);

    const [stillOpen] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(stillOpen.status).toBe("in_settlement");

    const rejected = await resolveTaskDb(
      isolated.db,
      routed.data.taskId,
      "rejected",
      "Settlement amount is not justified by the assessment.",
      undefined,
      supervisor.id,
    );
    expect(rejected.ok).toBe(true);

    const [claim] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, fixture.claimId));
    expect(claim.status).not.toBe("approved");
    expect(claim.status).toBe("in_settlement");

    const [settlement] = await isolated.db
      .select()
      .from(settlements)
      .where(eq(settlements.id, proposed.data.settlementId));
    expect(settlement.status).toBe("rejected");
  });
});

describe("PBI-016 DenyClaimSchema validation", () => {
  it("rejects short note", async () => {
    const { DenyClaimSchema } = await import("@/lib/schemas/financials");
    const parsed = DenyClaimSchema.safeParse({
      claimId: crypto.randomUUID(),
      reasonCode: "COVERAGE_EXCLUDED",
      note: "too short",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown reason code", async () => {
    const { DenyClaimSchema } = await import("@/lib/schemas/financials");
    const parsed = DenyClaimSchema.safeParse({
      claimId: crypto.randomUUID(),
      reasonCode: "NOT_A_REAL_CODE",
      note: "This is a long enough denial note.",
    });
    expect(parsed.success).toBe(false);
  });
});
