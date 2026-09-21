import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RulesWriteForbiddenError } from "@/lib/auth/errors";
import type { IsolatedDb } from "@/lib/db/isolated";
import {
  insertParameter,
  insertRule,
  insertRuleAction,
  insertRuleCondition,
  insertRuleSet,
} from "@/lib/db/queries/rules";
import { USER_ROLES } from "@/lib/db/schema";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { sessionUser } from "../helpers/pbi-004-fixtures";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("TC-004-03 admin-only rules writes", () => {
  beforeAll(() => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("rejects rules and parameters writes for every role except admin", async () => {
    const nonAdmins = USER_ROLES.filter((role) => role !== "admin");

    for (const role of nonAdmins) {
      const user = sessionUser(crypto.randomUUID(), role);
      await expect(
        insertRuleSet(isolated.db, user, {
          code: `set-${role}`,
          name: "Forbidden",
        }),
      ).rejects.toBeInstanceOf(RulesWriteForbiddenError);

      await expect(
        insertParameter(isolated.db, user, {
          key: `param-${role}`,
          valueJson: true,
          valueType: "boolean",
          effectiveFrom: "2026-01-01",
        }),
      ).rejects.toBeInstanceOf(RulesWriteForbiddenError);

      await expect(
        insertRule(isolated.db, user, {
          versionId: crypto.randomUUID(),
          rowOrder: 1,
          label: "Forbidden",
        }),
      ).rejects.toBeInstanceOf(RulesWriteForbiddenError);

      await expect(
        insertRuleCondition(isolated.db, user, {
          ruleId: crypto.randomUUID(),
          inputKey: "x",
          operator: "eq",
          valueJson: 1,
        }),
      ).rejects.toBeInstanceOf(RulesWriteForbiddenError);

      await expect(
        insertRuleAction(isolated.db, user, {
          ruleId: crypto.randomUUID(),
          actionType: "set_output",
          paramsJson: {},
        }),
      ).rejects.toBeInstanceOf(RulesWriteForbiddenError);
    }

    const admin = sessionUser(crypto.randomUUID(), "admin");
    const set = await insertRuleSet(isolated.db, admin, {
      code: "admin-ok",
      name: "Allowed",
    });
    expect(set.code).toBe("admin-ok");

    const param = await insertParameter(isolated.db, admin, {
      key: "admin-ok",
      valueJson: 1,
      valueType: "number",
      effectiveFrom: "2026-01-01",
    });
    expect(param.key).toBe("admin-ok");
  });
});
