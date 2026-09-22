import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { getRuleSetByCode, getVersionDetail } from "@/lib/db/queries/rules-read";
import { ruleAuditLog, ruleSetVersions, users } from "@/lib/db/schema";
import {
  activateVersion,
  createDraftVersion,
  evaluateRuleSet,
  simulateVersion,
  updateDraftRows,
  upsertParameter,
  VersionNotDraftError,
} from "@/lib/rules";
import type { RuleRowInput } from "@/lib/schemas/rules-admin";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { sessionUser } from "../helpers/pbi-004-fixtures";

const adminId = crypto.randomUUID();
const admin = sessionUser(adminId, "admin", { email: "admin@test.local" });
const RULE_SET_CODE = "BR-STP-001";
const AS_OF = "2026-06-01";

const greenLaneStpInputs = {
  route: "green_lane" as const,
  fraud_band: "low" as const,
  all_required_docs_extracted: true,
  extraction_min_confidence: 0.94,
  claimant_prior_claims_12m: 0,
  estimated_amount: 1800,
};

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

async function getActiveVersionId() {
  const ruleSet = await getRuleSetByCode(isolated.db, RULE_SET_CODE);
  expect(ruleSet).toBeDefined();

  const active = (
    await isolated.db
      .select()
      .from(ruleSetVersions)
      .where(eq(ruleSetVersions.ruleSetId, ruleSet!.id))
  ).find((version) => version.status === "active");

  expect(active).toBeDefined();
  return active!.id;
}

function toDraftRows(
  detail: NonNullable<Awaited<ReturnType<typeof getVersionDetail>>>,
): RuleRowInput[] {
  return detail.rows.map((row) => ({
    label: row.label,
    order: row.order,
    conditions: row.conditions.map((condition) => ({
      inputKey: condition.inputKey,
      operator: condition.operator,
      value: condition.value as RuleRowInput["conditions"][number]["value"],
    })),
    actions: row.actions.map((action) => ({
      actionType: action.actionType,
      params: action.params as RuleRowInput["actions"][number]["params"],
    })),
  }));
}

describe("PBI-008 rules admin services", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);

    const now = new Date();
    await isolated.db.insert(users).values({
      id: adminId,
      email: admin.email,
      passwordHash: "test",
      displayName: admin.displayName,
      role: "admin",
      createdAt: now,
      updatedAt: now,
    });
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("TC-008-01 createDraftVersion from active creates draft; active version unchanged", async () => {
    const activeVersionId = await getActiveVersionId();
    const beforeActive = await getVersionDetail(isolated.db, activeVersionId);
    expect(beforeActive?.version.status).toBe("active");

    const draft = await createDraftVersion(isolated.db, admin, {
      ruleSetCode: RULE_SET_CODE,
      fromVersionId: activeVersionId,
    });

    expect(draft.status).toBe("draft");
    expect(draft.version).toBe((beforeActive?.version.version ?? 0) + 1);

    const afterActive = await getVersionDetail(isolated.db, activeVersionId);
    expect(afterActive?.version.status).toBe("active");
    expect(afterActive?.version.effectiveFrom).toBe(
      beforeActive?.version.effectiveFrom,
    );
    expect(afterActive?.version.effectiveTo).toBe(
      beforeActive?.version.effectiveTo,
    );

    const draftDetail = await getVersionDetail(isolated.db, draft.id);
    expect(draftDetail?.rows).toHaveLength(beforeActive?.rows.length ?? 0);
  });

  it("TC-008-02 simulateVersion does not write rule_audit_log", async () => {
    const versionId = await getActiveVersionId();

    const before = await isolated.db
      .select({ total: count() })
      .from(ruleAuditLog);

    const result = await simulateVersion(isolated.db, admin, {
      versionId,
      sampleInputs: greenLaneStpInputs,
    });

    const after = await isolated.db
      .select({ total: count() })
      .from(ruleAuditLog);

    expect(after[0].total).toBe(before[0]?.total ?? 0);
    expect(result.auditId).toBeUndefined();
    expect(result.outputs.stp_allowed).toBe(true);
    expect(result.outputs.reason_code).toBe("STP-PASS");
    expect(result.matchedRuleIds.length).toBeGreaterThan(0);
  });

  it("TC-008-03 activateVersion retires prior active version at effectiveFrom boundary", async () => {
    const activeVersionId = await getActiveVersionId();
    const draft = await createDraftVersion(isolated.db, admin, {
      ruleSetCode: RULE_SET_CODE,
      fromVersionId: activeVersionId,
    });

    const effectiveFrom = "2026-07-01";
    const activated = await activateVersion(isolated.db, admin, {
      versionId: draft.id,
      changeNote: "TC-008-03 activation test note",
      effectiveFrom,
    });

    expect(activated.status).toBe("active");
    expect(activated.effectiveFrom).toBe(effectiveFrom);

    const [retiredActive] = await isolated.db
      .select()
      .from(ruleSetVersions)
      .where(eq(ruleSetVersions.id, activeVersionId))
      .limit(1);

    expect(retiredActive?.status).toBe("retired");
    expect(retiredActive?.effectiveTo).toBe(effectiveFrom);
  });

  it("TC-008-04 upsertParameter stp.max_amount blocks STP for green-lane 1800 claim", async () => {
    const before = await evaluateRuleSet(
      isolated.db,
      RULE_SET_CODE,
      greenLaneStpInputs,
      { asOf: AS_OF, dryRun: true },
    );
    expect(before.outputs.stp_allowed).toBe(true);
    expect(before.outputs.reason_code).toBe("STP-PASS");

    await upsertParameter(isolated.db, admin, {
      key: "stp.max_amount",
      valueJson: 1000,
      valueType: "number",
      effectiveFrom: "2026-01-01",
    });

    const after = await evaluateRuleSet(
      isolated.db,
      RULE_SET_CODE,
      greenLaneStpInputs,
      { asOf: AS_OF, dryRun: true },
    );

    expect(after.outputs.stp_allowed).toBe(false);
    expect(after.outputs.reason_code).toBe("STP-BLOCK-AMOUNT");
  });

  it("updateDraftRows on active version throws VersionNotDraftError", async () => {
    const activeVersionId = await getActiveVersionId();
    const detail = await getVersionDetail(isolated.db, activeVersionId);
    expect(detail).toBeDefined();

    await expect(
      updateDraftRows(isolated.db, admin, {
        versionId: activeVersionId,
        rows: toDraftRows(detail!),
      }),
    ).rejects.toBeInstanceOf(VersionNotDraftError);
  });
});
