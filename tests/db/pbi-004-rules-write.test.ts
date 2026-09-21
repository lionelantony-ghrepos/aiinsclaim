import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RulesWriteForbiddenError } from "@/lib/auth/errors";
import type { IsolatedDb } from "@/lib/db/isolated";
import { insertParameter, insertRuleSet } from "@/lib/db/queries/rules";
import { USER_ROLES } from "@/lib/db/schema";
import {
  createTempSqlitePath,
  openPushedDb,
  removeTempDir,
  runDrizzlePush,
} from "../helpers/isolated-db";
import { sessionUser } from "../helpers/pbi-004-fixtures";

const temp = createTempSqlitePath();
let isolated: IsolatedDb;

describe("TC-004-03 admin-only rules writes", () => {
  beforeAll(() => {
    const pushed = runDrizzlePush(temp.file);
    if (pushed.status !== 0) {
      throw new Error(`${pushed.error ?? ""}\n${pushed.stderr}\n${pushed.stdout}`);
    }
    isolated = openPushedDb(temp.file);
  }, 60_000);

  afterAll(() => {
    isolated?.close();
    removeTempDir(temp.dir);
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
