import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { agentRuns, auditLog, notifications, slaTimers, tasks, users } from "@/lib/db/schema";
import {
  bulkReassignDb,
  listQueueTasks,
  resolveTaskDb,
} from "@/lib/db/queries/tasks-queue";
import { ResolveTaskSchema } from "@/lib/schemas/tasks";
import { insertMinimalClaim } from "../helpers/pbi-004-fixtures";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { insertTask } from "@/lib/db/queries/tasks";
import { seedRulesAndParameters } from "../../seed/loaders/rules";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-013 queue helpers", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("TC-013-01 orders tasks by priority desc then sla due asc", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);

    const slaLow = crypto.randomUUID();
    const slaHigh = crypto.randomUUID();
    const now = new Date("2026-06-15T12:00:00Z");

    await isolated.db.insert(slaTimers).values([
      {
        id: slaLow,
        claimId,
        timerCode: "task_review",
        startedAt: new Date(now.getTime() - 60_000),
        dueAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
        status: "running",
      },
      {
        id: slaHigh,
        claimId,
        timerCode: "task_review",
        startedAt: new Date(now.getTime() - 60_000),
        dueAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        status: "running",
      },
    ]);

    await insertTask(isolated.db, {
      id: crypto.randomUUID(),
      claimId,
      type: "review_triage",
      queue: "adjusting",
      priority: 3,
      slaTimerId: slaLow,
    });
    await insertTask(isolated.db, {
      id: crypto.randomUUID(),
      claimId,
      type: "assess_claim",
      queue: "adjusting",
      priority: 5,
      slaTimerId: slaHigh,
    });
    await insertTask(isolated.db, {
      id: crypto.randomUUID(),
      claimId,
      type: "escalation",
      queue: "adjusting",
      priority: 5,
      slaTimerId: slaLow,
    });

    const result = await listQueueTasks(
      isolated.db,
      "adjusting",
      {},
      undefined,
      25,
      "adjuster",
    );

    expect(result.forbidden).toBe(false);
    expect(result.items.map((item) => item.priority)).toEqual([5, 5, 3]);
    expect(result.items[0]!.slaDueAt!.getTime()).toBeLessThan(
      result.items[1]!.slaDueAt!.getTime(),
    );
  });

  it("TC-013-02 scopes adjuster to adjusting queue only", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    await insertTask(isolated.db, {
      claimId,
      type: "siu_review",
      queue: "siu",
      priority: 3,
    });

    const forbidden = await listQueueTasks(
      isolated.db,
      "siu",
      {},
      undefined,
      25,
      "adjuster",
    );
    expect(forbidden.forbidden).toBe(true);
    expect(forbidden.items).toEqual([]);
  });

  it("TC-013-03 resolveTaskDb accepted updates agent run outcome", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    const agentRunId = crypto.randomUUID();
    await isolated.db.insert(agentRuns).values({
      id: agentRunId,
      agentId: "AGT-TRIAGE",
      claimId,
      status: "ok",
    });

    const task = await insertTask(isolated.db, {
      claimId,
      type: "review_triage",
      queue: "adjusting",
      priority: 4,
      payloadJson: {
        agentRunId,
        title: "Proposal",
        summary: "Review",
        confidencePercent: 80,
        reasonCodes: ["TEST"],
      },
    });

    const result = await resolveTaskDb(
      isolated.db,
      task.id,
      "accepted",
      undefined,
      undefined,
      "actor-1",
    );
    expect(result.ok).toBe(true);

    const [updatedTask] = await isolated.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(updatedTask?.resolution).toBe("accepted");
    expect(updatedTask?.status).toBe("done");

    const [updatedRun] = await isolated.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, agentRunId));
    expect(updatedRun?.outcome).toBe("accepted");
  });

  it("TC-013-04 ResolveTaskSchema rejects override without reason", () => {
    const parsed = ResolveTaskSchema.safeParse({
      taskId: crypto.randomUUID(),
      resolution: "overridden",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message === "REASON_REQUIRED")).toBe(
        true,
      );
    }
  });

  it("TC-013-05 bulkReassignDb updates assignee, notifications, and audit log", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    const actorId = crypto.randomUUID();
    const assigneeId = crypto.randomUUID();
    const now = new Date();

    await isolated.db.insert(users).values([
      {
        id: actorId,
        email: `actor-${actorId}@test.local`,
        passwordHash: "x",
        displayName: "Supervisor Actor",
        role: "supervisor",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: assigneeId,
        email: `assignee-${assigneeId}@test.local`,
        passwordHash: "x",
        displayName: "Adjuster Assignee",
        role: "adjuster",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const task = await insertTask(isolated.db, {
      claimId,
      type: "review_triage",
      queue: "adjusting",
      priority: 4,
      assignedTo: null,
    });

    const result = await bulkReassignDb(
      isolated.db,
      [task.id],
      assigneeId,
      actorId,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.count).toBe(1);
    }

    const [updatedTask] = await isolated.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(updatedTask?.assignedTo).toBe(assigneeId);

    const taskNotifications = await isolated.db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.taskId, task.id), eq(notifications.userId, assigneeId)),
      );
    expect(taskNotifications).toHaveLength(1);
    expect(taskNotifications[0]?.kind).toBe("task_reassigned");

    const auditRows = await isolated.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entity, "task"), eq(auditLog.entityId, task.id)),
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.action).toBe("bulk_reassign_task");
    expect(auditRows[0]?.actor).toBe(actorId);
    expect(auditRows[0]?.afterJson).toEqual({ assignedTo: assigneeId });
  });
});
