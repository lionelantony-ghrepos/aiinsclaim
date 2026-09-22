import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { insertTask, updateTask } from "@/lib/db/queries/tasks";
import {
  auditLog,
  claims,
  notifications,
  slaTimers,
  tasks,
  users,
} from "@/lib/db/schema";
import * as dbModule from "@/lib/db";
import {
  assertSweepSecret,
  durationTotalMs,
  handleClaimTransitionSla,
  pausePendingInfoTimers,
  resumePausedTimers,
  runSlaSweep,
  startSlaTimerForTrigger,
  SweepUnauthorizedError,
} from "@/lib/sla";
import { resolveParameterValue } from "@/lib/rules/params";
import { slaDisplayElapsedRatio } from "@/lib/ui/task-labels";
import { seedClaimTransitions } from "../../seed/loaders/transitions";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import { insertMinimalClaim } from "../helpers/pbi-004-fixtures";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

const BASE_TIME = new Date("2026-06-15T08:00:00Z");
async function seedStaffUsers(db: IsolatedDb["db"]) {
  const now = BASE_TIME;
  const adjusterId = crypto.randomUUID();
  const supervisorId = crypto.randomUUID();
  const suffix = adjusterId.slice(0, 8);
  await db.insert(users).values([
    {
      id: adjusterId,
      email: `adj-${suffix}@test.local`,
      passwordHash: "x",
      displayName: "Adjuster One",
      role: "adjuster",
      specialties: ["auto"],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: supervisorId,
      email: `sup-${suffix}@test.local`,
      passwordHash: "x",
      displayName: "Supervisor One",
      role: "supervisor",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  return { adjusterId, supervisorId };
}

async function insertRunningTimer(
  db: IsolatedDb["db"],
  params: {
    claimId: string;
    timerCode: string;
    durationMs: number;
    taskId?: string;
    assignedTo?: string;
    now?: Date;
  },
) {
  const now = params.now ?? BASE_TIME;
  const startedAt = now;
  const dueAt = new Date(now.getTime() + params.durationMs);
  const timerId = crypto.randomUUID();

  await db.insert(slaTimers).values({
    id: timerId,
    claimId: params.claimId,
    taskId: params.taskId ?? null,
    timerCode: params.timerCode,
    startedAt,
    dueAt,
    status: "running",
  });

  if (params.taskId && params.assignedTo) {
    await db
      .update(tasks)
      .set({ assignedTo: params.assignedTo })
      .where(eq(tasks.id, params.taskId));
  } else if (params.assignedTo) {
    await db
      .update(claims)
      .set({ assignedTo: params.assignedTo })
      .where(eq(claims.id, params.claimId));
  }

  return { timerId, startedAt, dueAt };
}

describe("PBI-014 SLA timers and escalation", () => {
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

  it("TC-014-01 BR-SLA-001 triggers start timers with param-driven dueAt", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    const now = BASE_TIME;

    const cases = [
      {
        trigger: "claim_submitted",
        paramKey: "sla.ack_hours",
        timerCode: "acknowledge_claimant",
      },
      {
        trigger: "claim_in_triage",
        paramKey: "sla.triage_hours",
        timerCode: "complete_triage",
      },
      {
        trigger: "claim_in_assessment_auto",
        paramKey: "sla.assess_days.auto",
        timerCode: "complete_assessment",
      },
      {
        trigger: "claim_in_settlement",
        paramKey: "sla.settle_days",
        timerCode: "issue_decision",
      },
    ] as const;

    for (const testCase of cases) {
      const { claimId: caseClaimId } = await insertMinimalClaim(isolated.db);
      const duration = await resolveParameterValue(
        isolated.db,
        testCase.paramKey,
        now,
      );
      const durationMs = durationTotalMs(duration);

      await startSlaTimerForTrigger(isolated.db, {
        claimId: caseClaimId,
        trigger: testCase.trigger,
        lineOfBusiness: "auto",
        now,
      });

      const [timer] = await isolated.db
        .select()
        .from(slaTimers)
        .where(
          and(
            eq(slaTimers.claimId, caseClaimId),
            eq(slaTimers.timerCode, testCase.timerCode),
          ),
        );

      expect(timer).toBeDefined();
      expect(timer!.startedAt.getTime()).toBe(now.getTime());
      expect(timer!.dueAt.getTime()).toBe(now.getTime() + durationMs);
    }

    const taskDuration = await resolveParameterValue(
      isolated.db,
      "sla.task.review_triage",
      now,
    );
    const taskDurationMs = durationTotalMs(taskDuration);
    const taskId = crypto.randomUUID();
    await insertTask(isolated.db, {
      id: taskId,
      claimId,
      type: "review_triage",
      queue: "adjusting",
    });

    const [taskTimer] = await isolated.db
      .select()
      .from(slaTimers)
      .where(
        and(eq(slaTimers.claimId, claimId), eq(slaTimers.taskId, taskId)),
      );

    expect(taskTimer?.timerCode).toBe("task_completion");
    expect(taskTimer!.dueAt.getTime()).toBe(
      taskTimer!.startedAt.getTime() + taskDurationMs,
    );
  });

  it("TC-014-02 assessment timer pauses and resumes; issue_decision does not pause", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    const now = BASE_TIME;

    await startSlaTimerForTrigger(isolated.db, {
      claimId,
      trigger: "claim_in_assessment_auto",
      lineOfBusiness: "auto",
      now,
    });

    await startSlaTimerForTrigger(isolated.db, {
      claimId,
      trigger: "claim_in_settlement",
      lineOfBusiness: "auto",
      now,
    });

    const pauseAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    await pausePendingInfoTimers(isolated.db, claimId, pauseAt);

    const [assessmentTimer] = await isolated.db
      .select()
      .from(slaTimers)
      .where(
        and(
          eq(slaTimers.claimId, claimId),
          eq(slaTimers.timerCode, "complete_assessment"),
        ),
      );
    const [decisionTimer] = await isolated.db
      .select()
      .from(slaTimers)
      .where(
        and(
          eq(slaTimers.claimId, claimId),
          eq(slaTimers.timerCode, "issue_decision"),
        ),
      );

    expect(assessmentTimer?.status).toBe("paused");
    expect(assessmentTimer?.pausedAt?.getTime()).toBe(pauseAt.getTime());
    expect(decisionTimer?.status).toBe("running");

    const originalDueAt = assessmentTimer!.dueAt.getTime();
    const resumeAt = new Date(pauseAt.getTime() + 3 * 60 * 60 * 1000);
    await resumePausedTimers(isolated.db, claimId, resumeAt);

    const [resumed] = await isolated.db
      .select()
      .from(slaTimers)
      .where(eq(slaTimers.id, assessmentTimer!.id));

    expect(resumed?.status).toBe("running");
    expect(resumed?.pausedAt).toBeNull();
    expect(resumed!.dueAt.getTime()).toBe(originalDueAt + 3 * 60 * 60 * 1000);
  });

  it("TC-014-03 escalation tiers fire at 75/100/150/200%", async () => {
    await isolated.db.delete(slaTimers);
    const { claimId } = await insertMinimalClaim(isolated.db);
    const { adjusterId, supervisorId } = await seedStaffUsers(isolated.db);

    const durationMs = 10 * 60 * 60 * 1000;
    const taskId = crypto.randomUUID();
    await isolated.db.insert(tasks).values({
      id: taskId,
      claimId,
      type: "assess_claim",
      queue: "adjusting",
      priority: 2,
      status: "open",
      assignedTo: adjusterId,
    });

    const { timerId } = await insertRunningTimer(isolated.db, {
      claimId,
      timerCode: "complete_assessment",
      durationMs,
      taskId,
      assignedTo: adjusterId,
    });

    const sweepAt75 = new Date(BASE_TIME.getTime() + durationMs * 0.76);
    await runSlaSweep(isolated.db, { now: sweepAt75 });

    const warnRows = await isolated.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.claimId, claimId),
          eq(notifications.kind, "sla_warning"),
        ),
      );
    expect(warnRows).toHaveLength(1);

    const sweepAt100 = new Date(BASE_TIME.getTime() + durationMs * 1.01);
    await runSlaSweep(isolated.db, { now: sweepAt100 });

    const breachRows = await isolated.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.claimId, claimId),
          eq(notifications.kind, "sla_breach"),
        ),
      );
    expect(breachRows.length).toBeGreaterThanOrEqual(1);

    const [taskAfterBreach] = await isolated.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    expect(taskAfterBreach?.priority).toBe(3);

    const sweepAt150 = new Date(BASE_TIME.getTime() + durationMs * 1.51);
    await runSlaSweep(isolated.db, { now: sweepAt150 });

    const escalationAt150 = await isolated.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.claimId, claimId), eq(tasks.type, "escalation")));
    expect(escalationAt150.length).toBeGreaterThanOrEqual(1);

    const sweepAt200 = new Date(BASE_TIME.getTime() + durationMs * 2.01);
    await runSlaSweep(isolated.db, { now: sweepAt200 });

    const criticalTasks = await isolated.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.claimId, claimId),
          eq(tasks.type, "escalation"),
          eq(tasks.priority, 5),
        ),
      );
    expect(criticalTasks.length).toBeGreaterThanOrEqual(1);
    expect(criticalTasks.some((t) => t.assignedTo === supervisorId)).toBe(true);

    const [timerRow] = await isolated.db
      .select()
      .from(slaTimers)
      .where(eq(slaTimers.id, timerId));
    expect(timerRow?.breachCount).toBe(4);
  });

  it("TC-014-04 second sweep is idempotent", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);

    const durationMs = 10 * 60 * 60 * 1000;
    await insertRunningTimer(isolated.db, {
      claimId,
      timerCode: "complete_triage",
      durationMs,
    });

    const sweepAt = new Date(BASE_TIME.getTime() + durationMs * 2.5);
    await runSlaSweep(isolated.db, { now: sweepAt });

    const timerRows = await isolated.db
      .select({ id: slaTimers.id })
      .from(slaTimers)
      .where(eq(slaTimers.claimId, claimId));
    const timerIds = timerRows.map((row) => row.id);

    const countClaimNotifs = async () => {
      const rows = await isolated.db
        .select()
        .from(notifications)
        .where(eq(notifications.claimId, claimId));
      return rows.length;
    };

    const countClaimAudits = async () => {
      if (timerIds.length === 0) return 0;
      const rows = await isolated.db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "sla_escalation"),
            eq(auditLog.entity, "sla_timers"),
          ),
        );
      return rows.filter((row) => timerIds.includes(row.entityId)).length;
    };

    const countClaimEsc = async () => {
      const rows = await isolated.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.claimId, claimId), eq(tasks.type, "escalation")));
      return rows.length;
    };

    const notifAfterFirst = await countClaimNotifs();
    const auditAfterFirst = await countClaimAudits();
    const escAfterFirst = await countClaimEsc();

    await runSlaSweep(isolated.db, { now: sweepAt });

    expect(await countClaimNotifs()).toBe(notifAfterFirst);
    expect(await countClaimAudits()).toBe(auditAfterFirst);
    expect(await countClaimEsc()).toBe(escAfterFirst);
  });

  it("TC-014-05 sweep endpoint and admin action are secured", async () => {
    expect(() => assertSweepSecret(null, "secret")).toThrow(
      SweepUnauthorizedError,
    );
    expect(() => assertSweepSecret("wrong", "secret")).toThrow(
      SweepUnauthorizedError,
    );
    expect(() => assertSweepSecret("secret", "secret")).not.toThrow();

    vi.stubEnv("SWEEP_SECRET", "test-sweep-secret");
    vi.spyOn(dbModule, "getDb").mockReturnValue(isolated.db);
    const { POST } = await import("@/app/api/sweep/sla/route");

    const noHeader = new Request("http://localhost/api/sweep/sla", {
      method: "POST",
    });
    const noHeaderRes = await POST(noHeader);
    expect(noHeaderRes.status).toBe(401);
    expect(await noHeaderRes.json()).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });

    const wrongHeader = new Request("http://localhost/api/sweep/sla", {
      method: "POST",
      headers: { "x-sweep-secret": "wrong" },
    });
    expect((await POST(wrongHeader)).status).toBe(401);

    const okHeader = new Request("http://localhost/api/sweep/sla", {
      method: "POST",
      headers: { "x-sweep-secret": "test-sweep-secret" },
    });
    const okRes = await POST(okHeader);
    expect(okRes.status).toBe(200);
    expect((await okRes.json()).ok).toBe(true);

    vi.doMock("@/lib/auth/session", () => ({
      requireRole: vi.fn().mockRejectedValue(new Error("UNAUTHORIZED")),
    }));
    const { runSlaSweepAction: rejectedAction } = await import(
      "@/app/(app)/(admin)/sla/actions"
    );
    const rejected = await rejectedAction();
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.code).toBe("UNAUTHORIZED");
    }

    vi.resetModules();
  });

  it("starts issue_payment on claim_approved and property assessment duration", async () => {
    const now = BASE_TIME;

    const { claimId: approvedClaimId } = await insertMinimalClaim(isolated.db);
    const payDuration = await resolveParameterValue(
      isolated.db,
      "sla.pay_days",
      now,
    );
    await startSlaTimerForTrigger(isolated.db, {
      claimId: approvedClaimId,
      trigger: "claim_approved",
      lineOfBusiness: "auto",
      now,
    });
    const [payTimer] = await isolated.db
      .select()
      .from(slaTimers)
      .where(
        and(
          eq(slaTimers.claimId, approvedClaimId),
          eq(slaTimers.timerCode, "issue_payment"),
        ),
      );
    expect(payTimer?.dueAt.getTime()).toBe(
      now.getTime() + durationTotalMs(payDuration),
    );

    const { claimId: propertyClaimId } = await insertMinimalClaim(isolated.db);
    await isolated.db
      .update(claims)
      .set({ lineOfBusiness: "property", claimType: "water_damage" })
      .where(eq(claims.id, propertyClaimId));

    const propertyDuration = await resolveParameterValue(
      isolated.db,
      "sla.assess_days.property",
      now,
    );
    await startSlaTimerForTrigger(isolated.db, {
      claimId: propertyClaimId,
      trigger: "claim_in_assessment_property",
      lineOfBusiness: "property",
      now,
    });
    const [propertyTimer] = await isolated.db
      .select()
      .from(slaTimers)
      .where(
        and(
          eq(slaTimers.claimId, propertyClaimId),
          eq(slaTimers.timerCode, "complete_assessment"),
        ),
      );
    expect(propertyTimer?.dueAt.getTime()).toBe(
      now.getTime() + durationTotalMs(propertyDuration),
    );
  });

  it("does not duplicate an open timer on second start", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    const now = BASE_TIME;

    await startSlaTimerForTrigger(isolated.db, {
      claimId,
      trigger: "claim_submitted",
      lineOfBusiness: "auto",
      now,
    });
    await startSlaTimerForTrigger(isolated.db, {
      claimId,
      trigger: "claim_submitted",
      lineOfBusiness: "auto",
      now,
    });

    const rows = await isolated.db
      .select()
      .from(slaTimers)
      .where(
        and(
          eq(slaTimers.claimId, claimId),
          eq(slaTimers.timerCode, "acknowledge_claimant"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("running");
  });

  it("marks stage timer met when leaving owning stage", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    const now = BASE_TIME;

    await startSlaTimerForTrigger(isolated.db, {
      claimId,
      trigger: "claim_in_triage",
      lineOfBusiness: "auto",
      now,
    });

    await handleClaimTransitionSla(isolated.db, {
      claimId,
      fromStatus: "in_triage",
      toStatus: "in_assessment",
      lineOfBusiness: "auto",
      now,
    });

    const [triageTimer] = await isolated.db
      .select()
      .from(slaTimers)
      .where(
        and(
          eq(slaTimers.claimId, claimId),
          eq(slaTimers.timerCode, "complete_triage"),
        ),
      );
    expect(triageTimer?.status).toBe("met");
  });

  it("marks task_completion met when task is done or cancelled", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    const taskId = crypto.randomUUID();
    await insertTask(isolated.db, {
      id: taskId,
      claimId,
      type: "review_triage",
      queue: "adjusting",
    });

    await updateTask(isolated.db, taskId, { status: "done" });
    const [doneTimer] = await isolated.db
      .select()
      .from(slaTimers)
      .where(eq(slaTimers.taskId, taskId));
    expect(doneTimer?.status).toBe("met");

    const cancelTaskId = crypto.randomUUID();
    await insertTask(isolated.db, {
      id: cancelTaskId,
      claimId,
      type: "assess_claim",
      queue: "adjusting",
    });
    await updateTask(isolated.db, cancelTaskId, { status: "cancelled" });
    const [cancelTimer] = await isolated.db
      .select()
      .from(slaTimers)
      .where(eq(slaTimers.taskId, cancelTaskId));
    expect(cancelTimer?.status).toBe("met");
  });

  it("freezes paused timer display elapsed ratio while clock advances", () => {
    const startedAt = new Date("2026-06-15T08:00:00Z");
    const dueAt = new Date("2026-06-16T08:00:00Z");
    const pausedAt = new Date("2026-06-15T14:00:00Z");
    const timer = { status: "paused" as const, pausedAt };

    const ratioAtPause = slaDisplayElapsedRatio(
      startedAt,
      dueAt,
      timer,
      pausedAt,
    );
    const ratioLater = slaDisplayElapsedRatio(
      startedAt,
      dueAt,
      timer,
      new Date("2026-06-15T20:00:00Z"),
    );

    expect(ratioLater).toBe(ratioAtPause);
    expect(ratioLater).toBeCloseTo(0.25, 5);
  });
});
