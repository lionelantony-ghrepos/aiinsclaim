import { and, eq, gt, lte, ne, sql } from "drizzle-orm";
import { assertCanWriteRules } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";
import { insertAuditLog } from "@/lib/db/queries/append-only";
import {
  getParameterByKey,
  getRuleSetByCode,
  getVersionDetail,
} from "@/lib/db/queries/rules-read";
import {
  cloneVersionRows,
  insertParameter,
  insertRuleSetVersion,
  replaceDraftRows,
  updateParameterByKey,
  updateRuleSetVersion,
} from "@/lib/db/queries/rules";
import { ruleSetVersions } from "@/lib/db/schema";
import type {
  ActivateVersionInput,
  CreateDraftVersionInput,
  SimulateVersionInput,
  UpdateDraftRowsInput,
  UpsertParameterInput,
} from "@/lib/schemas/rules-admin";
import {
  OverlappingEffectiveError,
  VersionNotDraftError,
} from "./admin-errors";
import { evaluateVersionById } from "./engine";
import { clearParameterCache } from "./params";
import type { BrCode } from "./schemas";

function auditActor(user: SessionUser) {
  return `user:${user.id}`;
}

function toJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  return value as Record<string, unknown>;
}

export async function createDraftVersion(
  db: Db,
  user: SessionUser,
  input: CreateDraftVersionInput,
) {
  assertCanWriteRules(user);

  const ruleSet = await getRuleSetByCode(db, input.ruleSetCode);
  if (!ruleSet) {
    throw new Error(`Rule set not found: ${input.ruleSetCode}`);
  }

  const source = await getVersionDetail(db, input.fromVersionId);
  if (!source || source.ruleSet.id !== ruleSet.id) {
    throw new Error(`Source version not found for ${input.ruleSetCode}`);
  }

  const [maxRow] = await db
    .select({
      maxVersion: sql<number>`coalesce(max(${ruleSetVersions.version}), 0)`,
    })
    .from(ruleSetVersions)
    .where(eq(ruleSetVersions.ruleSetId, ruleSet.id));
  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

  const draftId = crypto.randomUUID();
  const effectiveFrom = new Date().toISOString().slice(0, 10);

  const draft = await insertRuleSetVersion(db, user, {
    id: draftId,
    ruleSetId: ruleSet.id,
    version: nextVersion,
    status: "draft",
    effectiveFrom,
    effectiveTo: null,
    changeNote: null,
    createdBy: user.id,
  });

  await cloneVersionRows(db, user, input.fromVersionId, draft.id);

  await insertAuditLog(db, {
    actor: auditActor(user),
    action: "create_draft_version",
    entity: "rule_set_version",
    entityId: draft.id,
    beforeJson: null,
    afterJson: {
      ruleSetCode: input.ruleSetCode,
      fromVersionId: input.fromVersionId,
      version: draft.version,
      status: draft.status,
    },
  });

  return draft;
}

export async function updateDraftRows(
  db: Db,
  user: SessionUser,
  input: UpdateDraftRowsInput,
) {
  assertCanWriteRules(user);

  const before = await getVersionDetail(db, input.versionId);
  if (!before) {
    throw new Error(`Version not found: ${input.versionId}`);
  }
  if (before.version.status !== "draft") {
    throw new VersionNotDraftError(input.versionId);
  }

  await replaceDraftRows(db, user, input.versionId, input.rows);

  const after = await getVersionDetail(db, input.versionId);

  await insertAuditLog(db, {
    actor: auditActor(user),
    action: "update_draft_rows",
    entity: "rule_set_version",
    entityId: input.versionId,
    beforeJson: { rows: before.rows },
    afterJson: { rows: after?.rows ?? [] },
  });

  return after;
}

export async function simulateVersion(
  db: Db,
  user: SessionUser,
  input: SimulateVersionInput,
) {
  assertCanWriteRules(user);

  const detail = await getVersionDetail(db, input.versionId);
  if (!detail) {
    throw new Error(`Version not found: ${input.versionId}`);
  }

  return evaluateVersionById(
    db,
    input.versionId,
    detail.ruleSet.code as BrCode,
    input.sampleInputs,
    {
      dryRun: true,
      actor: auditActor(user),
    },
  );
}

export async function activateVersion(
  db: Db,
  user: SessionUser,
  input: ActivateVersionInput,
) {
  assertCanWriteRules(user);

  const detail = await getVersionDetail(db, input.versionId);
  if (!detail) {
    throw new Error(`Version not found: ${input.versionId}`);
  }
  if (detail.version.status !== "draft") {
    throw new VersionNotDraftError(input.versionId);
  }

  const activeVersions = await db
    .select()
    .from(ruleSetVersions)
    .where(
      and(
        eq(ruleSetVersions.ruleSetId, detail.ruleSet.id),
        eq(ruleSetVersions.status, "active"),
        ne(ruleSetVersions.id, input.versionId),
      ),
    );

  for (const active of activeVersions) {
    if (input.effectiveFrom < active.effectiveFrom) {
      throw new OverlappingEffectiveError(
        input.versionId,
        input.effectiveFrom,
      );
    }
  }

  const [retiredOverlap] = await db
    .select()
    .from(ruleSetVersions)
    .where(
      and(
        eq(ruleSetVersions.ruleSetId, detail.ruleSet.id),
        eq(ruleSetVersions.status, "retired"),
        lte(ruleSetVersions.effectiveFrom, input.effectiveFrom),
        gt(ruleSetVersions.effectiveTo, input.effectiveFrom),
        ne(ruleSetVersions.id, input.versionId),
      ),
    )
    .limit(1);

  if (retiredOverlap) {
    throw new OverlappingEffectiveError(input.versionId, input.effectiveFrom);
  }

  const beforeActive = activeVersions.map((version) => ({ ...version }));

  for (const active of activeVersions) {
    await updateRuleSetVersion(db, user, active.id, {
      status: "retired",
      effectiveTo: input.effectiveFrom,
    });
  }

  const activated = await updateRuleSetVersion(db, user, input.versionId, {
    status: "active",
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
    changeNote: input.changeNote,
  });

  await insertAuditLog(db, {
    actor: auditActor(user),
    action: "activate_version",
    entity: "rule_set_version",
    entityId: input.versionId,
    beforeJson: {
      draft: detail.version,
      activeVersions: beforeActive,
    },
    afterJson: {
      activated,
      retiredVersionIds: beforeActive.map((version) => version.id),
    },
  });

  return activated;
}

export async function upsertParameter(
  db: Db,
  user: SessionUser,
  input: UpsertParameterInput,
) {
  assertCanWriteRules(user);

  const existing = await getParameterByKey(db, input.key);
  let row;

  if (existing) {
    row = await updateParameterByKey(db, user, input.key, {
      valueJson: input.valueJson,
      valueType: input.valueType,
      effectiveFrom: input.effectiveFrom,
      updatedBy: user.id,
    });
  } else {
    row = await insertParameter(db, user, {
      key: input.key,
      valueJson: input.valueJson,
      valueType: input.valueType,
      effectiveFrom: input.effectiveFrom,
      updatedBy: user.id,
    });
  }

  clearParameterCache();

  await insertAuditLog(db, {
    actor: auditActor(user),
    action: existing ? "update_parameter" : "create_parameter",
    entity: "parameter",
    entityId: row?.id ?? input.key,
    beforeJson: toJsonRecord(existing),
    afterJson: toJsonRecord(row),
  });

  return row;
}
