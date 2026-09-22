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
import {
  formatSlaRemaining,
  priorityLabel,
  slaElapsedRatio,
  taskTypeLabel,
} from "@/lib/ui/task-labels";
import { slaVisualTone } from "@/lib/ui/sla-visual";
import { updateAgentRunOutcome } from "./append-only";
import { assertTaskResolutionReason, updateTask } from "./tasks";

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
  slaTone: "ok" | "warning" | "danger";
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

function breachStateForSla(sla: SlaFields): "ok" | "warning" | "breached" {
  if (!sla.dueAt) {
    return "ok";
  }
  if (sla.status === "breached") {
    return "breached";
  }
  const ratio = slaElapsedRatio(sla.startedAt, sla.dueAt);
  const tone = slaVisualTone({
    status: sla.status ?? "running",
    elapsedRatio: ratio,
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
  now = new Date(),
): QueueTaskRow {
  const breachState = breachStateForSla(row.sla);
  const elapsedRatio = slaElapsedRatio(row.sla.startedAt, row.sla.dueAt, now);
  const slaTone = slaVisualTone({
    status: row.sla.status ?? "running",
    elapsedRatio,
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
    slaRemainingLabel: formatSlaRemaining(row.sla.dueAt, now),
    slaTone,
    breachState,
    slaDueAt: row.sla.dueAt,
    payloadJson: row.task.payloadJson ?? null,
    createdAt: row.task.createdAt,
  };
}

function breachStateSqlFilter(
  breachState: NonNullable<QueueTaskFilters["breachState"]>,
  now = new Date(),
): SQL {
  const nowMs = now.getTime();
  const warningThreshold = sql`${nowMs} + (${slaTimers.dueAt} - ${slaTimers.startedAt}) * 0.25`;

  if (breachState === "breached") {
    return (
      or(eq(slaTimers.status, "breached"), lt(slaTimers.dueAt, now)) ?? sql`0 = 1`
    );
  }

  if (breachState === "warning") {
    return (
      and(
        sql`${slaTimers.dueAt} IS NOT NULL`,
        gt(slaTimers.dueAt, now),
        ne(slaTimers.status, "breached"),
        lt(slaTimers.dueAt, warningThreshold),
      ) ?? sql`0 = 1`
    );
  }

  return (
    or(
      isNull(slaTimers.dueAt),
      eq(slaTimers.status, "met"),
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

async function fetchQueueRows(
  db: Db,
  queue: TaskQueue,
  filters: QueueTaskFilters,
  cursor: string | undefined,
  limit: number,
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
    conditions.push(breachStateSqlFilter(filters.breachState));
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
    mapQueueTaskRow({
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
      },
    }),
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

  const result = await fetchQueueRows(db, queue, filters, cursor, limit);
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

  const mapped = mapQueueTaskRow({
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
    },
  });

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
