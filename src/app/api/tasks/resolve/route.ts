import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { TaskResolutionReasonRequiredError } from "@/lib/auth/errors";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getTaskWithClaim, resolveTaskDb } from "@/lib/db/queries/tasks-queue";
import { ResolveTaskSchema } from "@/lib/schemas/tasks";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = ResolveTaskSchema.parse(body);
    const db = getDb();

    const taskResult = await getTaskWithClaim(db, parsed.taskId, user.role);
    if (!taskResult) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } },
        { status: 404 },
      );
    }
    if ("forbidden" in taskResult && taskResult.forbidden) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } },
        { status: 403 },
      );
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
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: result.code,
            message:
              "message" in result && typeof result.message === "string"
                ? result.message
                : "Unable to resolve task",
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, data: { taskId: parsed.taskId } });
  } catch (error) {
    if (error instanceof ZodError) {
      const reasonIssue = error.issues.find((issue) => issue.message === "REASON_REQUIRED");
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: reasonIssue ? "REASON_REQUIRED" : "VALIDATION_FAILED",
            message: reasonIssue
              ? "Reason is required for override or reject"
              : "Validation failed",
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof TaskResolutionReasonRequiredError) {
      return NextResponse.json(
        { ok: false, error: { code: "REASON_REQUIRED", message: error.message } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 500 },
    );
  }
}
