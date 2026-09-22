"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { upsertParameter } from "@/lib/rules/admin";
import {
  upsertParameterSchema,
  type UpsertParameterInput,
} from "@/lib/schemas/rules-admin";

export type ParametersActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function actionError(error: unknown): ParametersActionResult<never> {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Unknown error" };
}

export async function upsertParameterAction(
  input: UpsertParameterInput,
): Promise<ParametersActionResult<Awaited<ReturnType<typeof upsertParameter>>>> {
  try {
    const user = await requireRole("admin");
    const parsed = upsertParameterSchema.parse(input);
    const db = getDb();
    const data = await upsertParameter(db, user, parsed);
    revalidatePath("/parameters");
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function upsertParameterFormAction(formData: FormData) {
  const user = await requireRole("admin");
  let valueJson: unknown;
  try {
    valueJson = JSON.parse(String(formData.get("valueJson")));
  } catch {
    redirect("/parameters?error=invalid-json");
  }
  const parsed = upsertParameterSchema.parse({
    key: formData.get("key"),
    valueJson,
    valueType: formData.get("valueType"),
    effectiveFrom: formData.get("effectiveFrom"),
  });
  const db = getDb();
  await upsertParameter(db, user, parsed);
  revalidatePath("/parameters");
  redirect("/parameters?saved=1");
}
