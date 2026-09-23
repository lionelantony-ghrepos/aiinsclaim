import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { canAccessQueue } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listQueueTasks } from "@/lib/db/queries/tasks-queue";
import { ListQueueSchema } from "@/lib/schemas/tasks";

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
    const parsed = ListQueueSchema.parse(body);

    if (!canAccessQueue(user.role, parsed.queue)) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } },
        { status: 403 },
      );
    }

    const db = getDb();
    const result = await listQueueTasks(
      db,
      parsed.queue,
      parsed.filters,
      parsed.cursor,
      parsed.limit,
      user.role,
    );

    if (result.forbidden) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } },
        { status: 403 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { items: result.items, nextCursor: result.nextCursor },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_FAILED", message: "Validation failed" } },
        { status: 400 },
      );
    }
    console.error("[queue-list] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        },
      },
      { status: 500 },
    );
  }
}
