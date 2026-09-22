import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  authorizeSweepRequest,
  runSlaSweep,
  SweepUnauthorizedError,
} from "@/lib/sla";

export async function POST(request: Request) {
  try {
    authorizeSweepRequest(request);
  } catch (error) {
    if (error instanceof SweepUnauthorizedError) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }
    throw error;
  }

  const db = getDb();
  const summary = await runSlaSweep(db);
  return NextResponse.json({ ok: true, data: summary });
}
