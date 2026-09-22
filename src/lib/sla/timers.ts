import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  claims,
  slaTimers,
  tasks,
  type ClaimStatus,
  type Lob,
  type SlaStatus,
  type TaskType,
} from "@/lib/db/schema";
import { evaluateRuleSet } from "@/lib/rules";
import {
  slaTriggerForStatus,
  slaTriggerForTimerCode,
  TIMER_CODE_BY_CLAIM_STATUS,
} from "./constants";
import { resolveSlaDurationMs } from "./duration";

const OPEN_SLA_STATUSES: SlaStatus[] = ["running", "paused"];

export type StartSlaTimerOptions = {
  claimId: string;
  trigger: string;
  lineOfBusiness?: Lob;
  taskType?: TaskType;
  taskId?: string;
  now?: Date;
};

async function hasOpenTimer(
  db: Db,
  claimId: string,
  timerCode: string,
  taskId?: string | null,
): Promise<boolean> {
  const conditions = [
    eq(slaTimers.claimId, claimId),
    eq(slaTimers.timerCode, timerCode),
    inArray(slaTimers.status, OPEN_SLA_STATUSES),
  ];

  if (timerCode === "task_completion" && taskId) {
    conditions.push(eq(slaTimers.taskId, taskId));
  }

  const [row] = await db
    .select({ id: slaTimers.id })
    .from(slaTimers)
    .where(and(...conditions))
    .limit(1);

  return Boolean(row);
}

export async function startSlaTimerForTrigger(
  db: Db,
  options: StartSlaTimerOptions,
): Promise<string | null> {
  const now = options.now ?? new Date();

  const inputs: Record<string, unknown> = { trigger: options.trigger };
  if (options.lineOfBusiness) {
    inputs.line_of_business = options.lineOfBusiness;
  }
  if (options.taskType) {
    inputs.task_type = options.taskType;
  }

  const result = await evaluateRuleSet(db, "BR-SLA-001", inputs, {
    claimId: options.claimId,
    actor: "system:sla",
    asOf: now,
  });

  const timerCode =
    typeof result.outputs.timer_code === "string"
      ? result.outputs.timer_code
      : null;
  if (!timerCode) {
    return null;
  }

  if (
    await hasOpenTimer(db, options.claimId, timerCode, options.taskId ?? null)
  ) {
    return null;
  }

  const durationMs = await resolveSlaDurationMs(
    db,
    result.outputs,
    options.taskType,
    now,
  );
  const dueAt = new Date(now.getTime() + durationMs);
  const timerId = crypto.randomUUID();

  await db.insert(slaTimers).values({
    id: timerId,
    claimId: options.claimId,
    taskId: options.taskId ?? null,
    timerCode,
    startedAt: now,
    dueAt,
    status: "running",
  });

  return timerId;
}

export async function markTimerMetByCode(
  db: Db,
  claimId: string,
  timerCode: string,
  now?: Date,
): Promise<void> {
  const at = now ?? new Date();
  await db
    .update(slaTimers)
    .set({ status: "met", updatedAt: at })
    .where(
      and(
        eq(slaTimers.claimId, claimId),
        eq(slaTimers.timerCode, timerCode),
        inArray(slaTimers.status, OPEN_SLA_STATUSES),
      ),
    );
}

export async function markTaskCompletionTimerMet(
  db: Db,
  taskId: string,
  now?: Date,
): Promise<void> {
  const at = now ?? new Date();
  await db
    .update(slaTimers)
    .set({ status: "met", updatedAt: at })
    .where(
      and(
        eq(slaTimers.taskId, taskId),
        eq(slaTimers.timerCode, "task_completion"),
        inArray(slaTimers.status, OPEN_SLA_STATUSES),
      ),
    );
}

export async function pausePendingInfoTimers(
  db: Db,
  claimId: string,
  now?: Date,
): Promise<void> {
  const at = now ?? new Date();

  const [claim] = await db
    .select({ lineOfBusiness: claims.lineOfBusiness })
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) {
    return;
  }

  const running = await db
    .select()
    .from(slaTimers)
    .where(
      and(eq(slaTimers.claimId, claimId), eq(slaTimers.status, "running")),
    );

  for (const timer of running) {
    const trigger = slaTriggerForTimerCode(
      timer.timerCode,
      claim.lineOfBusiness,
    );
    if (!trigger) {
      continue;
    }

    const inputs: Record<string, unknown> = {
      trigger,
      line_of_business: claim.lineOfBusiness,
    };

    if (timer.timerCode === "task_completion" && timer.taskId) {
      const [task] = await db
        .select({ type: tasks.type })
        .from(tasks)
        .where(eq(tasks.id, timer.taskId))
        .limit(1);
      if (task) {
        inputs.task_type = task.type;
      }
    }

    const result = await evaluateRuleSet(db, "BR-SLA-001", inputs, {
      claimId,
      actor: "system:sla",
      asOf: at,
    });

    if (result.outputs.pause_in_pending_info === true) {
      await db
        .update(slaTimers)
        .set({ status: "paused", pausedAt: at, updatedAt: at })
        .where(eq(slaTimers.id, timer.id));
    }
  }
}

export async function resumePausedTimers(
  db: Db,
  claimId: string,
  now?: Date,
): Promise<void> {
  const at = now ?? new Date();
  const paused = await db
    .select()
    .from(slaTimers)
    .where(
      and(eq(slaTimers.claimId, claimId), eq(slaTimers.status, "paused")),
    );

  for (const timer of paused) {
    if (!timer.pausedAt) {
      continue;
    }
    const pauseDurationMs = at.getTime() - timer.pausedAt.getTime();
    const startedAt = new Date(timer.startedAt.getTime() + pauseDurationMs);
    const dueAt = new Date(timer.dueAt.getTime() + pauseDurationMs);
    await db
      .update(slaTimers)
      .set({
        status: "running",
        pausedAt: null,
        startedAt,
        dueAt,
        updatedAt: at,
      })
      .where(eq(slaTimers.id, timer.id));
  }
}

export async function handleClaimTransitionSla(
  db: Db,
  params: {
    claimId: string;
    fromStatus: ClaimStatus;
    toStatus: ClaimStatus;
    lineOfBusiness: Lob;
    now?: Date;
  },
): Promise<void> {
  const now = params.now ?? new Date();

  if (params.fromStatus === "pending_info") {
    await resumePausedTimers(db, params.claimId, now);
  }

  const leavingTimerCode = TIMER_CODE_BY_CLAIM_STATUS[params.fromStatus];
  if (
    leavingTimerCode &&
    !(
      params.fromStatus === "in_assessment" &&
      params.toStatus === "pending_info"
    )
  ) {
    await markTimerMetByCode(db, params.claimId, leavingTimerCode, now);
  }

  if (params.toStatus === "pending_info") {
    await pausePendingInfoTimers(db, params.claimId, now);
  }

  const trigger = slaTriggerForStatus(params.toStatus, params.lineOfBusiness);
  if (trigger) {
    await startSlaTimerForTrigger(db, {
      claimId: params.claimId,
      trigger,
      lineOfBusiness: params.lineOfBusiness,
      now,
    });
  }
}

export async function startSlaTimerForTask(
  db: Db,
  params: {
    claimId: string;
    taskId: string;
    taskType: TaskType;
    now?: Date;
  },
): Promise<string | null> {
  const [claim] = await db
    .select({ lineOfBusiness: claims.lineOfBusiness })
    .from(claims)
    .where(eq(claims.id, params.claimId))
    .limit(1);

  return startSlaTimerForTrigger(db, {
    claimId: params.claimId,
    trigger: "task_created",
    lineOfBusiness: claim?.lineOfBusiness,
    taskType: params.taskType,
    taskId: params.taskId,
    now: params.now,
  });
}

export async function listActiveSlaTimersForClaim(db: Db, claimId: string) {
  return db
    .select()
    .from(slaTimers)
    .where(
      and(
        eq(slaTimers.claimId, claimId),
        inArray(slaTimers.status, ["running", "paused", "breached"]),
      ),
    );
}
