"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getVersionDetail } from "@/lib/db/queries/rules-read";
import {
  activateVersion,
  createDraftVersion,
  simulateVersion,
  updateDraftRows,
} from "@/lib/rules/admin";
import {
  ImmutableVersionError,
  OverlappingEffectiveError,
  VersionNotDraftError,
} from "@/lib/rules/admin-errors";
import {
  activateVersionSchema,
  createDraftVersionSchema,
  simulateVersionSchema,
  updateDraftRowsSchema,
  type ActivateVersionInput,
  type CreateDraftVersionInput,
  type SimulateVersionInput,
  type UpdateDraftRowsInput,
} from "@/lib/schemas/rules-admin";

export type RulesActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function actionError(error: unknown): RulesActionResult<never> {
  if (error instanceof VersionNotDraftError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof OverlappingEffectiveError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof ImmutableVersionError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Unknown error" };
}

function revalidateRulesPaths(ruleSetCode: string, versionId?: string) {
  revalidatePath("/rules");
  revalidatePath(`/rules/${ruleSetCode}`);
  if (versionId) {
    revalidatePath(`/rules/${ruleSetCode}/versions/${versionId}`);
  }
}

export async function createDraftVersionAction(
  input: CreateDraftVersionInput,
): Promise<RulesActionResult<Awaited<ReturnType<typeof createDraftVersion>>>> {
  try {
    const user = await requireRole("admin");
    const parsed = createDraftVersionSchema.parse(input);
    const db = getDb();
    const data = await createDraftVersion(db, user, parsed);
    revalidateRulesPaths(parsed.ruleSetCode, data.id);
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function createDraftVersionFormAction(formData: FormData) {
  const user = await requireRole("admin");
  const parsed = createDraftVersionSchema.parse({
    ruleSetCode: formData.get("ruleSetCode"),
    fromVersionId: formData.get("fromVersionId"),
  });
  const db = getDb();
  const data = await createDraftVersion(db, user, parsed);
  revalidateRulesPaths(parsed.ruleSetCode, data.id);
  redirect(`/rules/${parsed.ruleSetCode}/versions/${data.id}`);
}

export async function updateDraftRowsAction(
  input: UpdateDraftRowsInput,
): Promise<RulesActionResult<Awaited<ReturnType<typeof updateDraftRows>>>> {
  try {
    const user = await requireRole("admin");
    const parsed = updateDraftRowsSchema.parse(input);
    const db = getDb();
    const data = await updateDraftRows(db, user, parsed);
    if (!data) {
      return { ok: false, error: "Version not found", code: "NOT_FOUND" };
    }
    revalidateRulesPaths(data.ruleSet.code, parsed.versionId);
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function simulateVersionAction(
  input: SimulateVersionInput,
): Promise<RulesActionResult<Awaited<ReturnType<typeof simulateVersion>>>> {
  try {
    const user = await requireRole("admin");
    const parsed = simulateVersionSchema.parse(input);
    const db = getDb();
    const data = await simulateVersion(db, user, parsed);
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function activateVersionAction(
  input: ActivateVersionInput,
): Promise<RulesActionResult<Awaited<ReturnType<typeof activateVersion>>>> {
  try {
    const user = await requireRole("admin");
    const parsed = activateVersionSchema.parse(input);
    const db = getDb();
    const data = await activateVersion(db, user, parsed);
    const versionDetail = await getVersionDetail(db, parsed.versionId);
    if (versionDetail) {
      revalidateRulesPaths(versionDetail.ruleSet.code, parsed.versionId);
    }
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function activateVersionFormAction(formData: FormData) {
  const user = await requireRole("admin");
  const parsed = activateVersionSchema.parse({
    versionId: formData.get("versionId"),
    changeNote: formData.get("changeNote"),
    effectiveFrom: formData.get("effectiveFrom"),
  });
  const db = getDb();
  await activateVersion(db, user, parsed);
  const versionDetail = await getVersionDetail(db, parsed.versionId);
  if (versionDetail) {
    revalidateRulesPaths(versionDetail.ruleSet.code, parsed.versionId);
  }
  redirect(`/rules/${versionDetail!.ruleSet.code}/versions/${parsed.versionId}`);
}
