import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { canAccessQueue, queuesForRole } from "@/lib/auth/scope";
import type { Db } from "@/lib/db/client";
import {
  auditLog,
  claims,
  notifications,
  slaTimers,
  tasks,
  users,
  type AgentRunOutcome,
  type ClaimStatus,
  type ClaimType,
  type SlaStatus,
  type TaskQueue,
  type TaskResolution,
  type TaskStatus,
  type TaskType,
  type UserRole,
} from "@/lib/db/schema";
import type { QueueTaskFilters } from "@/lib/schemas/tasks";
import { getParameter } from "@/lib/rules/params";
import {
  priorityLabel,
  slaDisplayElapsedRatio,
  slaDisplayRemainingLabel,
  taskTypeLabel,
} from "@/lib/ui/task-labels";
import { slaVisualTone } from "@/lib/ui/sla-visual";
import { updateAgentRunOutcome } from "./append-only";
import { assertTaskResolutionReason, updateTask } from "./tasks";
import {
  resolveApproveSettlementTask,
  resolveDenyConfirmationTask,
} from "@/lib/settlement/service";

export type QueueTaskRow = {
  id: string;
  claimId: string;
  claimNumber: string;
  claimType: ClaimType;
  claimStatus: ClaimStatus;
  type: TaskType;
  queue: TaskQueue;
  priority: number;
  status: TaskStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  title: string;
  priorityLabel: string;
  slaRemainingLabel: string;
  slaTone: "ok" | "warning" | "danger" | "paused";
  breachState: "ok" | "warning" | "breached";
  slaDueAt: Date | null;
  payloadJson: Record<string, unknown> | null;
  createdAt: Date;
};

export type TaskWithClaim = QueueTaskRow & {
  resolution: TaskResolution | null;
  resolutionReason: string | null;
};

type SlaFields = {
  dueAt: Date | null;
  startedAt: Date | null;
  status: SlaStatus | null;
  pausedAt: Date | null;
};

function encodeCursor(priority: number, slaDueAt: Date | null, id: string): string {
  return `${priority}|${slaDueAt?.getTime() ?? "null"}|${id}`;
}

function decodeCursor(cursor: string) {
  const [priorityRaw, dueRaw, id] = cursor.split("|");
  return {
    priority: Number(priorityRaw),
    slaDueAt: dueRaw === "null" ? null : new Date(Number(dueRaw)),
    id,
  };
}

function breachStateForSla(
  sla: SlaFields,
  warningRatio: number,
  now = new Date(),
): "ok" | "warning" | "breached" {
  if (!sla.dueAt) {
    return "ok";
  }
  if (sla.status === "breached") {
    return "breached";
  }
  const timer = {
    status: sla.status ?? "running",
    pausedAt: sla.pausedAt,
  };
  const ratio = slaDisplayElapsedRatio(
    sla.startedAt,
    sla.dueAt,
    timer,
    now,
  );
  const tone = slaVisualTone({
    status: timer.status,
    elapsedRatio: ratio,
    warningRatio,
  });
  if (tone === "danger") {
    return "breached";
  }
  if (tone === "warning") {
    return "warning";
  }
  return "ok";
}

function mapQueueTaskRow(
  row: {
    task: typeof tasks.$inferSelect;
    claim: { claimNumber: string; claimType: ClaimType; status: ClaimStatus };
    assigneeName: string | null;
    sla: SlaFields;
  },
  warningRatio: number,
  now = new Date(),
): QueueTaskRow {
  const timer = {
    status: row.sla.status ?? "running",
    pausedAt: row.sla.pausedAt,
  };
  const breachState = breachStateForSla(row.sla, warningRatio, now);
  const elapsedRatio = slaDisplayElapsedRatio(
    row.sla.startedAt,
    row.sla.dueAt,
    timer,
    now,
  );
  const slaTone = slaVisualTone({
    status: timer.status,
    elapsedRatio,
    warningRatio,
  });

  return {
    id: row.task.id,
    claimId: row.task.claimId,
    claimNumber: row.claim.claimNumber,
    claimType: row.claim.claimType,
    claimStatus: row.claim.status,
    type: row.task.type,
    queue: row.task.queue,
    priority: row.task.priority,
    status: row.task.status,
    assignedTo: row.task.assignedTo,
    assignedToName: row.assigneeName,
    title: taskTypeLabel(row.task.type),
    priorityLabel: priorityLabel(row.task.priority),
    slaRemainingLabel: slaDisplayRemainingLabel(row.sla.dueAt, timer, now),
    slaTone,
    breachState,
    slaDueAt: row.sla.dueAt,
    payloadJson: row.task.payloadJson ?? null,
    createdAt: row.task.createdAt,
  };
}

function breachStateSqlFilter(
  breachState: NonNullable<QueueTaskFilters["breachState"]>,
  warningRatio: number,
  now = new Date(),
): SQL {
  const nowMs = now.getTime();
  const remainingFraction = 1 - warningRatio;
  const warningThreshold = sql`${nowMs} + (${slaTimers.dueAt} - ${slaTimers.startedAt}) * ${remainingFraction}`;

  if (breachState === "breached") {
    return (
      or(
        eq(slaTimers.status, "breached"),
        and(lt(slaTimers.dueAt, now), ne(slaTimers.status, "paused")),
      ) ?? sql`0 = 1`
    );
  }

  if (breachState === "warning") {
    return (
      and(
        sql`${slaTimers.dueAt} IS NOT NULL`,
        gt(slaTimers.dueAt, now),
        ne(slaTimers.status, "breached"),
        ne(slaTimers.status, "paused"),
        lt(slaTimers.dueAt, warningThreshold),
      ) ?? sql`0 = 1`
    );
  }

  return (
    or(
      isNull(slaTimers.dueAt),
      eq(slaTimers.status, "met"),
      eq(slaTimers.status, "paused"),
      and(
        gt(slaTimers.dueAt, now),
        ne(slaTimers.status, "breached"),
        sql`${slaTimers.dueAt} >= ${warningThreshold}`,
      ),
    ) ?? sql`0 = 1`
  );
}

function cursorPredicate(cursor: string) {
  const decoded = decodeCursor(cursor);
  const dueMs = decoded.slaDueAt?.getTime() ?? null;

  if (dueMs === null) {
    return or(
      lt(tasks.priority, decoded.priority),
      and(
        eq(tasks.priority, decoded.priority),
        gt(tasks.id, decoded.id),
      ),
    );
  }

  return or(
    lt(tasks.priority, decoded.priority),
    and(
      eq(tasks.priority, decoded.priority),
      or(
        gt(slaTimers.dueAt, new Date(dueMs)),
        and(eq(slaTimers.dueAt, new Date(dueMs)), gt(tasks.id, decoded.id)),
        sql`${slaTimers.dueAt} IS NULL`,
      ),
    ),
  );
}

async function loadSlaWarningRatio(db: Db, asOf = new Date()) {
  const param = await getParameter(db, "sla.esc.warning_ratio", asOf);
  return Number(param.valueJson);
}

async function fetchQueueRows(
  db: Db,
  queue: TaskQueue,
  filters: QueueTaskFilters,
  cursor: string | undefined,
  limit: number,
  warningRatio: number,
) {
  const conditions = [
    eq(tasks.queue, queue),
    inArray(tasks.status, ["open", "in_progress"]),
  ];

  if (filters.type) {
    conditions.push(eq(tasks.type, filters.type));
  }
  if (filters.claimType) {
    conditions.push(eq(claims.claimType, filters.claimType));
  }
  if (filters.breachState) {
    conditions.push(breachStateSqlFilter(filters.breachState, warningRatio));
  }
  if (cursor) {
    conditions.push(cursorPredicate(cursor)!);
  }

  const rows = await db
    .select({
      task: tasks,
      claimNumber: claims.claimNumber,
      claimType: claims.claimType,
      claimStatus: claims.status,
      assigneeName: users.displayName,
      slaDueAt: slaTimers.dueAt,
      slaStartedAt: slaTimers.startedAt,
      slaStatus: slaTimers.status,
      slaPausedAt: slaTimers.pausedAt,
    })
    .from(tasks)
    .innerJoin(claims, eq(claims.id, tasks.claimId))
    .leftJoin(users, eq(users.id, tasks.assignedTo))
    .leftJoin(slaTimers, eq(slaTimers.id, tasks.slaTimerId))
    .where(and(...conditions))
    .orderBy(
      desc(tasks.priority),
      sql`CASE WHEN ${slaTimers.dueAt} IS NULL THEN 1 ELSE 0 END`,
      asc(slaTimers.dueAt),
      asc(tasks.id),
    )
    .limit(limit + 1);

  const mapped = rows.map((row) =>
    mapQueueTaskRow(
      {
        task: row.task,
        claim: {
          claimNumber: row.claimNumber,
          claimType: row.claimType,
          status: row.claimStatus,
        },
        assigneeName: row.assigneeName,
        sla: {
          dueAt: row.slaDueAt,
          startedAt: row.slaStartedAt,
          status: row.slaStatus,
          pausedAt: row.slaPausedAt,
        },
      },
      warningRatio,
    ),
  );

  const page = mapped.slice(0, limit);
  const nextCursor =
    mapped.length > limit
      ? encodeCursor(
          page[page.length - 1]!.priority,
          page[page.length - 1]!.slaDueAt,
          page[page.length - 1]!.id,
        )
      : null;

  return { items: page, nextCursor };
}

export async function listQueueTasks(
  db: Db,
  queue: TaskQueue,
  filters: QueueTaskFilters,
  cursor: string | undefined,
  limit: number,
  userRole: UserRole,
) {
  if (!canAccessQueue(userRole, queue)) {
    return { items: [], nextCursor: null, forbidden: true as const };
  }

  const warningRatio = await loadSlaWarningRatio(db);
  const result = await fetchQueueRows(
    db,
    queue,
    filters,
    cursor,
    limit,
    warningRatio,
  );
  return { ...result, forbidden: false as const };
}

export async function getTaskWithClaim(
  db: Db,
  taskId: string,
  userRole: UserRole,
) {
  const [row] = await db
    .select({
      task: tasks,
      claimNumber: claims.claimNumber,
      claimType: claims.claimType,
      claimStatus: claims.status,
      assigneeName: users.displayName,
      slaDueAt: slaTimers.dueAt,
      slaStartedAt: slaTimers.startedAt,
      slaStatus: slaTimers.status,
      slaPausedAt: slaTimers.pausedAt,
    })
    .from(tasks)
    .innerJoin(claims, eq(claims.id, tasks.claimId))
    .leftJoin(users, eq(users.id, tasks.assignedTo))
    .leftJoin(slaTimers, eq(slaTimers.id, tasks.slaTimerId))
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!row) {
    return null;
  }

  if (!canAccessQueue(userRole, row.task.queue)) {
    return { forbidden: true as const };
  }

  const warningRatio = await loadSlaWarningRatio(db);

  const mapped = mapQueueTaskRow(
    {
      task: row.task,
      claim: {
        claimNumber: row.claimNumber,
        claimType: row.claimType,
        status: row.claimStatus,
      },
      assigneeName: row.assigneeName,
      sla: {
        dueAt: row.slaDueAt,
        startedAt: row.slaStartedAt,
        status: row.slaStatus,
        pausedAt: row.slaPausedAt,
      },
    },
    warningRatio,
  );

  return {
    forbidden: false as const,
    task: {
      ...mapped,
      resolution: row.task.resolution ?? null,
      resolutionReason: row.task.resolutionReason ?? null,
    } satisfies TaskWithClaim,
  };
}

function agentOutcomeForResolution(
  resolution: TaskResolution,
): AgentRunOutcome | null {
  if (resolution === "accepted") {
    return "accepted";
  }
  if (resolution === "overridden" || resolution === "rejected") {
    return "overridden";
  }
  return null;
}

export async function resolveTaskDb(
  db: Db,
  taskId: string,
  resolution: TaskResolution,
  resolutionReason: string | undefined,
  resultPayload: unknown,
  actorId: string,
) {
  assertTaskResolutionReason(resolution, resolutionReason);

  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!existing) {
    return { ok: false as const, code: "NOT_FOUND" as const };
  }

  if (existing.status === "done" || existing.status === "cancelled") {
    return { ok: false as const, code: "ALREADY_RESOLVED" as const };
  }

  const payload = (existing.payloadJson ?? {}) as Record<string, unknown>;
  const payloadKind =
    typeof payload.kind === "string" ? payload.kind : null;
  const settlementResolution =
    resolution === "accepted"
      ? ("accepted" as const)
      : resolution === "rejected" || resolution === "overridden"
        ? ("rejected" as const)
        : null;

  if (
    settlementResolution &&
    (existing.type === "approve_settlement" ||
      payloadKind === "deny_confirmation")
  ) {
    const [actor] = await db
      .select()
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);
    if (!actor) {
      return { ok: false as const, code: "NOT_FOUND" as const };
    }
    const sessionUser = {
      id: actor.id,
      email: actor.email,
      displayName: actor.displayName,
      role: actor.role,
      authorityLevel: actor.authorityLevel,
    };

    const sideEffect =
      existing.type === "approve_settlement"
        ? await resolveApproveSettlementTask(
            db,
            sessionUser,
            {
              id: existing.id,
              claimId: existing.claimId,
              payloadJson: existing.payloadJson,
            },
            settlementResolution,
            resolutionReason,
          )
        : await resolveDenyConfirmationTask(
            db,
            sessionUser,
            {
              id: existing.id,
              claimId: existing.claimId,
              payloadJson: existing.payloadJson,
            },
            settlementResolution,
            resolutionReason,
          );

    if (!sideEffect.ok) {
      return {
        ok: false as const,
        code: sideEffect.error.code as
          | "NOT_FOUND"
          | "ALREADY_RESOLVED"
          | "REASON_REQUIRED"
          | "APPROVAL_REQUIRED"
          | "SIU_HOLD"
          | "GUARD_FAILED"
          | "VALIDATION_FAILED"
          | "ILLEGAL_TRANSITION"
          | "FORBIDDEN",
        message: sideEffect.error.message,
      };
    }
  }

  const mergedPayload =
    resultPayload && typeof resultPayload === "object"
      ? { ...payload, result: resultPayload }
      : payload;

  const updated = await updateTask(db, taskId, {
    status: "done",
    resolution,
    resolutionReason: resolutionReason ?? null,
    payloadJson: mergedPayload,
  });

  const agentRunId =
    typeof payload.agentRunId === "string" ? payload.agentRunId : null;
  if (agentRunId) {
    const outcome = agentOutcomeForResolution(resolution);
    if (outcome) {
      await updateAgentRunOutcome(db, agentRunId, outcome);
    }
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actor: actorId,
    action: "resolve_task",
    entity: "task",
    entityId: taskId,
    beforeJson: {
      status: existing.status,
      resolution: existing.resolution,
    },
    afterJson: {
      status: updated?.status,
      resolution: updated?.resolution,
      resolutionReason: updated?.resolutionReason,
    },
  });

  return { ok: true as const, taskId };
}

export async function claimTaskDb(db: Db, taskId: string, userId: string) {
  const result = await db
    .update(tasks)
    .set({
      status: "in_progress",
      assignedTo: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.status, "open"),
        isNull(tasks.assignedTo),
      ),
    )
    .returning({ id: tasks.id });

  if (result.length === 0) {
    const [existing] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!existing) {
      return { ok: false as const, code: "NOT_FOUND" as const };
    }

    return { ok: false as const, code: "TASK_ALREADY_CLAIMED" as const };
  }

  return { ok: true as const, taskId };
}

export async function releaseTaskDb(db: Db, taskId: string, userId: string) {
  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!existing) {
    return { ok: false as const, code: "NOT_FOUND" as const };
  }

  if (existing.assignedTo !== userId) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  await db
    .update(tasks)
    .set({
      status: "open",
      assignedTo: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  return { ok: true as const, taskId };
}

export async function bulkReassignDb(
  db: Db,
  taskIds: string[],
  assignTo: string,
  actorId: string,
) {
  const [assignee] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, assignTo))
    .limit(1);

  if (!assignee) {
    return { ok: false as const, code: "ASSIGNEE_NOT_FOUND" as const };
  }

  const eligibleQueues = queuesForRole(assignee.role);

  const rows = await db
    .select({
      task: tasks,
      claimNumber: claims.claimNumber,
    })
    .from(tasks)
    .innerJoin(claims, eq(claims.id, tasks.claimId))
    .where(inArray(tasks.id, taskIds));

  if (rows.length !== taskIds.length) {
    return { ok: false as const, code: "NOT_FOUND" as const };
  }

  for (const row of rows) {
    if (!eligibleQueues.includes(row.task.queue)) {
      return { ok: false as const, code: "ASSIGNEE_INELIGIBLE" as const };
    }
  }

  await db
    .update(tasks)
    .set({ assignedTo: assignTo, updatedAt: new Date() })
    .where(inArray(tasks.id, taskIds));

  for (const row of rows) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      userId: assignTo,
      claimId: row.task.claimId,
      taskId: row.task.id,
      kind: "task_reassigned",
      title: "Task reassigned to you",
      bodyMd: `Claim **${row.claimNumber}** task (${row.task.type}) was reassigned by a supervisor.`,
      deliveryStatus: "not_applicable",
    });

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      actor: actorId,
      action: "bulk_reassign_task",
      entity: "task",
      entityId: row.task.id,
      beforeJson: { assignedTo: row.task.assignedTo },
      afterJson: { assignedTo: assignTo },
    });
  }

  return { ok: true as const, count: rows.length };
}

export async function listStaffAssignees(db: Db) {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(
      inArray(users.role, ["adjuster", "supervisor", "intake_agent", "siu_analyst"]),
    )
    .orderBy(asc(users.displayName));
}

export { encodeCursor, decodeCursor, breachStateForSla };
