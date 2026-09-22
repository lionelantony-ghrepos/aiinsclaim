import { eq } from "drizzle-orm";
import { TaskResolutionReasonRequiredError } from "@/lib/auth/errors";
import type { Db } from "@/lib/db/client";
import {
  markTaskCompletionTimerMet,
  startSlaTimerForTask,
} from "@/lib/sla/timers";
import {
  tasks,
  type TaskQueue,
  type TaskResolution,
  type TaskStatus,
  type TaskType,
} from "@/lib/db/schema";

export function assertTaskResolutionReason(
  resolution: TaskResolution | null | undefined,
  resolutionReason: string | null | undefined,
) {
  if (resolution === "overridden" || resolution === "rejected") {
    if (!resolutionReason || resolutionReason.trim() === "") {
      throw new TaskResolutionReasonRequiredError();
    }
  }
}

export async function insertTask(
  db: Db,
  values: {
    id?: string;
    claimId: string;
    type: TaskType;
    queue: TaskQueue;
    priority?: number;
    status?: TaskStatus;
    assignedTo?: string | null;
    payloadJson?: Record<string, unknown> | null;
    resolution?: TaskResolution | null;
    resolutionReason?: string | null;
    slaTimerId?: string | null;
  },
) {
  assertTaskResolutionReason(values.resolution, values.resolutionReason);
  const [row] = await db
    .insert(tasks)
    .values({
      id: values.id ?? crypto.randomUUID(),
      claimId: values.claimId,
      type: values.type,
      queue: values.queue,
      priority: values.priority,
      status: values.status,
      assignedTo: values.assignedTo,
      payloadJson: values.payloadJson,
      resolution: values.resolution,
      resolutionReason: values.resolutionReason,
      slaTimerId: values.slaTimerId,
    })
    .returning();

  await startSlaTimerForTask(db, {
    claimId: values.claimId,
    taskId: row.id,
    taskType: values.type,
  });

  return row;
}

export async function updateTask(
  db: Db,
  id: string,
  values: {
    type?: TaskType;
    queue?: TaskQueue;
    priority?: number;
    status?: TaskStatus;
    assignedTo?: string | null;
    payloadJson?: Record<string, unknown> | null;
    resolution?: TaskResolution | null;
    resolutionReason?: string | null;
    slaTimerId?: string | null;
  },
) {
  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!existing) {
    return null;
  }

  const resolution =
    values.resolution !== undefined ? values.resolution : existing.resolution;
  const resolutionReason =
    values.resolutionReason !== undefined
      ? values.resolutionReason
      : existing.resolutionReason;

  assertTaskResolutionReason(resolution, resolutionReason);

  const [row] = await db
    .update(tasks)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning();

  if (
    row &&
    values.status &&
    (values.status === "done" || values.status === "cancelled") &&
    values.status !== existing.status
  ) {
    await markTaskCompletionTimerMet(db, id);
  }

  return row ?? null;
}
