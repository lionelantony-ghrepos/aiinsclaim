import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { insertAuditLog } from "@/lib/db/queries/append-only";
import { insertTask } from "@/lib/db/queries/tasks";
import {
  claims,
  notifications,
  slaTimers,
  tasks,
  users,
  type SlaStatus,
} from "@/lib/db/schema";
import { evaluateRuleSet } from "@/lib/rules";
import { getParameter } from "@/lib/rules/params";
import { resolveAdjusterId } from "@/lib/triage/assign";
import { slaSweepElapsedRatio } from "./elapsed";

const SWEEP_STATUSES: SlaStatus[] = ["running", "breached"];

const ESCALATION_TIERS = [
  { breachCount: 1, paramKey: "sla.esc.warning_ratio" },
  { breachCount: 2, paramKey: "sla.esc.breach_ratio" },
  { breachCount: 3, paramKey: "sla.esc.reassign_ratio" },
  { breachCount: 4, paramKey: "sla.esc.critical_ratio" },
] as const;

export type SlaSweepSummary = {
  scanned: number;
  escalated: number;
};

async function loadEscalationThresholds(db: Db, asOf: Date) {
  const tiers: { breachCount: number; ratio: number }[] = [];
  for (const tier of ESCALATION_TIERS) {
    const param = await getParameter(db, tier.paramKey, asOf);
    tiers.push({
      breachCount: tier.breachCount,
      ratio: Number(param.valueJson),
    });
  }
  return tiers;
}

function targetBreachCount(
  elapsedRatio: number,
  tiers: { breachCount: number; ratio: number }[],
): number {
  let target = 0;
  for (const tier of tiers) {
    if (elapsedRatio >= tier.ratio) {
      target = tier.breachCount;
    }
  }
  return target;
}

async function findSupervisorUserId(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "supervisor"), eq(users.isActive, true)))
    .orderBy(asc(users.id))
    .limit(1);
  return row?.id ?? null;
}

async function resolveNotifyUserId(
  db: Db,
  timer: typeof slaTimers.$inferSelect,
): Promise<string | null> {
  if (timer.taskId) {
    const [task] = await db
      .select({ assignedTo: tasks.assignedTo })
      .from(tasks)
      .where(eq(tasks.id, timer.taskId))
      .limit(1);
    if (task?.assignedTo) {
      return task.assignedTo;
    }
  }

  const [claim] = await db
    .select({ assignedTo: claims.assignedTo })
    .from(claims)
    .where(eq(claims.id, timer.claimId))
    .limit(1);
  if (claim?.assignedTo) {
    return claim.assignedTo;
  }

  return findSupervisorUserId(db);
}

async function insertSlaNotification(
  db: Db,
  params: {
    userId: string;
    claimId: string;
    taskId?: string | null;
    kind: string;
    title: string;
    bodyMd: string;
  },
) {
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: params.userId,
    claimId: params.claimId,
    taskId: params.taskId ?? null,
    kind: params.kind,
    title: params.title,
    bodyMd: params.bodyMd,
    deliveryStatus: "not_applicable",
  });
}

async function escalationTaskExists(
  db: Db,
  slaTimerId: string,
  breachCount: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.type, "escalation"),
        sql`json_extract(${tasks.payloadJson}, '$.slaTimerId') = ${slaTimerId}`,
        sql`json_extract(${tasks.payloadJson}, '$.breach_count') = ${breachCount}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function executeEscalationTier(
  db: Db,
  timer: typeof slaTimers.$inferSelect,
  breachCount: number,
  outputs: Record<string, unknown>,
  now: Date,
): Promise<boolean> {
  const action =
    typeof outputs.action === "string" ? outputs.action : "unknown";
  const supervisorId = await findSupervisorUserId(db);

  if (action === "notify_assignee") {
    const assigneeId = await resolveNotifyUserId(db, timer);
    if (!assigneeId) {
      return false;
    }
    await insertSlaNotification(db, {
      userId: assigneeId,
      claimId: timer.claimId,
      taskId: timer.taskId,
      kind: "sla_warning",
      title: "SLA warning",
      bodyMd: `SLA timer approaching breach for claim ${timer.claimId}.`,
    });
    await insertAuditLog(db, {
      actor: "system:sla-sweep",
      action: "sla_escalation",
      entity: "sla_timers",
      entityId: timer.id,
      afterJson: { breach_count: breachCount, action },
      at: now,
    });
    return true;
  }

  if (action === "notify_assignee_and_supervisor") {
    const assigneeId = await resolveNotifyUserId(db, timer);
    let notificationsInserted = 0;

    if (assigneeId) {
      await insertSlaNotification(db, {
        userId: assigneeId,
        claimId: timer.claimId,
        taskId: timer.taskId,
        kind: "sla_breach",
        title: "SLA breached",
        bodyMd: `SLA timer breached for claim ${timer.claimId}.`,
      });
      notificationsInserted += 1;
    }
    if (supervisorId && supervisorId !== assigneeId) {
      await insertSlaNotification(db, {
        userId: supervisorId,
        claimId: timer.claimId,
        taskId: timer.taskId,
        kind: "sla_breach",
        title: "SLA breached",
        bodyMd: `SLA timer breached for claim ${timer.claimId}.`,
      });
      notificationsInserted += 1;
    }

    let priorityBumped = false;
    if (timer.taskId && typeof outputs.priority_bump === "number") {
      const [task] = await db
        .select({ priority: tasks.priority })
        .from(tasks)
        .where(eq(tasks.id, timer.taskId))
        .limit(1);
      if (task) {
        await db
          .update(tasks)
          .set({
            priority: task.priority + outputs.priority_bump,
            updatedAt: now,
          })
          .where(eq(tasks.id, timer.taskId));
        priorityBumped = true;
      }
    }

    if (notificationsInserted === 0 && !priorityBumped) {
      return false;
    }

    await insertAuditLog(db, {
      actor: "system:sla-sweep",
      action: "sla_escalation",
      entity: "sla_timers",
      entityId: timer.id,
      afterJson: { breach_count: breachCount, action },
      at: now,
    });
    return true;
  }

  if (action === "reassign") {
    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, timer.claimId))
      .limit(1);
    if (claim) {
      const assignResult = await evaluateRuleSet(
        db,
        "BR-ASSIGN-001",
        {
          route: claim.route ?? "standard",
          line_of_business: claim.lineOfBusiness,
          injury_involved: claim.injuryInvolved,
        },
        { claimId: timer.claimId, actor: "system:sla-sweep" },
      );

      const newAssignee = await resolveAdjusterId(db, {
        claimId: timer.claimId,
        route: claim.route ?? "standard",
        lineOfBusiness: claim.lineOfBusiness,
        injuryInvolved: claim.injuryInvolved,
        assignOutputs: assignResult.outputs,
      });

      if (timer.taskId && newAssignee) {
        await db
          .update(tasks)
          .set({ assignedTo: newAssignee, updatedAt: now })
          .where(eq(tasks.id, timer.taskId));
      } else if (!timer.taskId && newAssignee) {
        await db
          .update(claims)
          .set({ assignedTo: newAssignee, updatedAt: now })
          .where(eq(claims.id, timer.claimId));
      }
    }

    if (!(await escalationTaskExists(db, timer.id, breachCount))) {
      const escalationAssignee =
        supervisorId &&
        (timer.taskId
          ? (await db
              .select({ assignedTo: tasks.assignedTo })
              .from(tasks)
              .where(eq(tasks.id, timer.taskId))
              .limit(1))[0]?.assignedTo !== supervisorId
          : true)
          ? supervisorId
          : null;

      await insertTask(db, {
        claimId: timer.claimId,
        type: "escalation",
        queue: "supervision",
        assignedTo: escalationAssignee,
        payloadJson: { slaTimerId: timer.id, breach_count: breachCount },
      });
    }
  }

  if (action === "escalate_ops_dashboard") {
    if (!(await escalationTaskExists(db, timer.id, breachCount))) {
      const rulePriority =
        typeof outputs.priority === "number" ? outputs.priority : undefined;

      await insertTask(db, {
        claimId: timer.claimId,
        type: "escalation",
        queue: "supervision",
        priority: rulePriority,
        assignedTo: supervisorId,
        payloadJson: { slaTimerId: timer.id, breach_count: breachCount },
      });
    }
  }

  await insertAuditLog(db, {
    actor: "system:sla-sweep",
    action: "sla_escalation",
    entity: "sla_timers",
    entityId: timer.id,
    afterJson: { breach_count: breachCount, action },
    at: now,
  });
  return true;
}

export async function runSlaSweep(
  db: Db,
  options: { now?: Date } = {},
): Promise<SlaSweepSummary> {
  const now = options.now ?? new Date();
  const tiers = await loadEscalationThresholds(db, now);
  const breachTier = tiers.find((tier) => tier.breachCount === 2);
  if (!breachTier) {
    throw new Error("Missing sla.esc.breach_ratio tier configuration");
  }
  const breachRatio = breachTier.ratio;

  const timers = await db
    .select()
    .from(slaTimers)
    .where(inArray(slaTimers.status, SWEEP_STATUSES));

  let escalated = 0;

  for (const timer of timers) {
    const elapsedRatio = slaSweepElapsedRatio(timer.startedAt, timer.dueAt, now);
    const target = targetBreachCount(elapsedRatio, tiers);

    if (elapsedRatio >= breachRatio && timer.status === "running") {
      await db
        .update(slaTimers)
        .set({ status: "breached", updatedAt: now })
        .where(eq(slaTimers.id, timer.id));
    }

    for (let step = timer.breachCount + 1; step <= target; step += 1) {
      const escResult = await evaluateRuleSet(
        db,
        "BR-ESC-001",
        { breach_count: step },
        { claimId: timer.claimId, actor: "system:sla-sweep", asOf: now },
      );

      const applied = await executeEscalationTier(
        db,
        timer,
        step,
        escResult.outputs,
        now,
      );

      if (!applied) {
        break;
      }

      await db
        .update(slaTimers)
        .set({ breachCount: step, updatedAt: now })
        .where(eq(slaTimers.id, timer.id));

      timer.breachCount = step;
      escalated += 1;
    }
  }

  return { scanned: timers.length, escalated };
}
