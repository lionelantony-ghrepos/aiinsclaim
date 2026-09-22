"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { canAccessQueue } from "@/lib/auth/scope";
import { TaskResolutionReasonRequiredError } from "@/lib/auth/errors";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  bulkReassignDb,
  claimTaskDb,
  getTaskWithClaim,
  listQueueTasks,
  listStaffAssignees,
  releaseTaskDb,
  resolveTaskDb,
} from "@/lib/db/queries/tasks-queue";
import { resolveParameterValue } from "@/lib/rules/params";
import {
  BulkReassignSchema,
  ClaimTaskSchema,
  ListQueueSchema,
  ReleaseTaskSchema,
  ResolveTaskSchema,
} from "@/lib/schemas/tasks";
import type { UserRole } from "@/lib/db/schema/enums";

export type QueueActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const STAFF_QUEUE_ROLES = [
  "intake_agent",
  "adjuster",
  "supervisor",
  "siu_analyst",
  "admin",
] as const satisfies readonly UserRole[];

function validationError(error: ZodError): QueueActionResult<never> {
  const reasonIssue = error.issues.find((issue) => issue.message === "REASON_REQUIRED");
  if (reasonIssue) {
    return {
      ok: false,
      error: { code: "REASON_REQUIRED", message: "Reason is required for override or reject" },
    };
  }
  return {
    ok: false,
    error: { code: "VALIDATION_FAILED", message: "Validation failed" },
  };
}

function actionError(error: unknown): QueueActionResult<never> {
  if (error instanceof ZodError) {
    return validationError(error);
  }
  if (error instanceof TaskResolutionReasonRequiredError) {
    return {
      ok: false,
      error: { code: "REASON_REQUIRED", message: error.message },
    };
  }
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } };
  }
  console.error("[queue-action] error:", error);
  return {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    },
  };
}

export async function fetchQueueAction(
  input: unknown,
): Promise<
  QueueActionResult<{
    items: Awaited<ReturnType<typeof listQueueTasks>>["items"];
    nextCursor: string | null;
  }>
> {
  try {
    const user = await requireRole(...STAFF_QUEUE_ROLES);
    const parsed = ListQueueSchema.parse(input);
    const db = getDb();

    if (!canAccessQueue(user.role, parsed.queue)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }

    const result = await listQueueTasks(
      db,
      parsed.queue,
      parsed.filters,
      parsed.cursor,
      parsed.limit,
      user.role,
    );

    if (result.forbidden) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }

    return {
      ok: true,
      data: { items: result.items, nextCursor: result.nextCursor },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function fetchQueuePollSecondsAction(): Promise<
  QueueActionResult<{ pollSeconds: number }>
> {
  try {
    await requireRole(...STAFF_QUEUE_ROLES);
    const db = getDb();
    const value = await resolveParameterValue(db, "ui.queue_poll_seconds");
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Parameter ui.queue_poll_seconds must be a number",
        },
      };
    }
    return { ok: true, data: { pollSeconds: value } };
  } catch (error) {
    return actionError(error);
  }
}

export async function fetchStaffAssigneesAction(): Promise<
  QueueActionResult<Awaited<ReturnType<typeof listStaffAssignees>>>
> {
  try {
    await requireRole("supervisor", "admin");
    const db = getDb();
    const assignees = await listStaffAssignees(db);
    return { ok: true, data: assignees };
  } catch (error) {
    return actionError(error);
  }
}

export async function resolveTaskAction(
  input: unknown,
): Promise<QueueActionResult<{ taskId: string }>> {
  try {
    const user = await requireRole(...STAFF_QUEUE_ROLES);
    const parsed = ResolveTaskSchema.parse(input);
    const db = getDb();

    const taskResult = await getTaskWithClaim(db, parsed.taskId, user.role);
    if (!taskResult) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } };
    }
    if ("forbidden" in taskResult && taskResult.forbidden) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }

    const result = await resolveTaskDb(
      db,
      parsed.taskId,
      parsed.resolution,
      parsed.resolutionReason,
      parsed.resultPayload,
      user.id,
    );

    if (!result.ok) {
      return {
        ok: false,
        error: { code: result.code, message: "Unable to resolve task" },
      };
    }

    revalidatePath("/queue");
    revalidatePath(`/queue/${parsed.taskId}`);
    return { ok: true, data: { taskId: parsed.taskId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function claimTaskAction(
  input: unknown,
): Promise<QueueActionResult<{ taskId: string }>> {
  try {
    const user = await requireRole(...STAFF_QUEUE_ROLES);
    const parsed = ClaimTaskSchema.parse(input);
    const db = getDb();

    const taskResult = await getTaskWithClaim(db, parsed.taskId, user.role);
    if (!taskResult) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } };
    }
    if ("forbidden" in taskResult && taskResult.forbidden) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }

    const result = await claimTaskDb(db, parsed.taskId, user.id);
    if (!result.ok) {
      return {
        ok: false,
        error: { code: result.code, message: "Unable to claim task" },
      };
    }

    revalidatePath("/queue");
    revalidatePath(`/queue/${parsed.taskId}`);
    return { ok: true, data: { taskId: parsed.taskId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function releaseTaskAction(
  input: unknown,
): Promise<QueueActionResult<{ taskId: string }>> {
  try {
    const user = await requireRole(...STAFF_QUEUE_ROLES);
    const parsed = ReleaseTaskSchema.parse(input);
    const db = getDb();

    const taskResult = await getTaskWithClaim(db, parsed.taskId, user.role);
    if (!taskResult) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } };
    }
    if ("forbidden" in taskResult && taskResult.forbidden) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
    }

    const result = await releaseTaskDb(db, parsed.taskId, user.id);
    if (!result.ok) {
      return {
        ok: false,
        error: { code: result.code, message: "Unable to release task" },
      };
    }

    revalidatePath("/queue");
    revalidatePath(`/queue/${parsed.taskId}`);
    return { ok: true, data: { taskId: parsed.taskId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkReassignAction(
  input: unknown,
): Promise<QueueActionResult<{ count: number }>> {
  try {
    const user = await requireRole("supervisor", "admin");
    const parsed = BulkReassignSchema.parse(input);
    const db = getDb();

    for (const taskId of parsed.taskIds) {
      const taskResult = await getTaskWithClaim(db, taskId, user.role);
      if (!taskResult) {
        return { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } };
      }
      if ("forbidden" in taskResult && taskResult.forbidden) {
        return { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } };
      }
    }

    const result = await bulkReassignDb(
      db,
      parsed.taskIds,
      parsed.assignTo,
      user.id,
    );

    if (!result.ok) {
      return {
        ok: false,
        error: { code: result.code, message: "Unable to bulk reassign" },
      };
    }

    revalidatePath("/queue");
    return { ok: true, data: { count: result.count } };
  } catch (error) {
    return actionError(error);
  }
}
