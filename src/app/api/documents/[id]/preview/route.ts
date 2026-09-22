import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { canAccessClaim } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { resolveStoragePath } from "@/lib/storage/local";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const db = getDb();

  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!document) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 },
    );
  }

  const allowed = await canAccessClaim(db, user, document.claimId);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } },
      { status: 403 },
    );
  }

  try {
    const absolutePath = resolveStoragePath(document.storagePath);
    const bytes = await readFile(absolutePath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(document.sizeBytes),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "File not found" } },
      { status: 404 },
    );
  }
}
