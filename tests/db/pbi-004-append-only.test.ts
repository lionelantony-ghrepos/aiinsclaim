import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppendOnlyViolationError } from "@/lib/auth/errors";
import {
  deleteAgentRun,
  deleteAuditLog,
  deleteClaimStateHistory,
  deleteRuleAuditLog,
  insertAgentRun,
  insertAuditLog,
  insertClaimStateHistory,
  insertRuleAuditLog,
  updateAgentRun,
  updateAuditLog,
  updateClaimStateHistory,
  updateRuleAuditLog,
} from "@/lib/db/queries/append-only";
import type { IsolatedDb } from "@/lib/db/isolated";
import { insertRuleSet, insertRuleSetVersion } from "@/lib/db/queries/rules";
import {
  createTempSqlitePath,
  openPushedDb,
  removeTempDir,
  runDrizzlePush,
} from "../helpers/isolated-db";
import { insertMinimalClaim, sessionUser } from "../helpers/pbi-004-fixtures";

const temp = createTempSqlitePath();
let isolated: IsolatedDb;

describe("TC-004-04 append-only tables", () => {
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

  it("allows insert and rejects update/delete on all four append-only tables", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    const admin = sessionUser(crypto.randomUUID(), "admin");
    const ruleSet = await insertRuleSet(isolated.db, admin, {
      code: "append-fixture",
      name: "Append fixture",
    });
    const version = await insertRuleSetVersion(isolated.db, admin, {
      ruleSetId: ruleSet.id,
      version: 1,
      effectiveFrom: "2026-01-01",
    });

    const history = await insertClaimStateHistory(isolated.db, {
      claimId,
      toStatus: "submitted",
      triggeredBy: "system",
      actorId: "system",
    });
    expect(history.id).toBeTruthy();
    expect(() => updateClaimStateHistory()).toThrow(AppendOnlyViolationError);
    expect(() => deleteClaimStateHistory()).toThrow(AppendOnlyViolationError);

    const audit = await insertRuleAuditLog(isolated.db, {
      versionId: version.id,
      claimId,
      inputsJson: {},
      outputsJson: {},
      matchedRuleIds: [],
      actor: "system",
    });
    expect(audit.id).toBeTruthy();
    expect(() => updateRuleAuditLog()).toThrow(AppendOnlyViolationError);
    expect(() => deleteRuleAuditLog()).toThrow(AppendOnlyViolationError);

    const run = await insertAgentRun(isolated.db, {
      agentId: "intake",
      status: "ok",
    });
    expect(run.id).toBeTruthy();
    expect(() => updateAgentRun()).toThrow(AppendOnlyViolationError);
    expect(() => deleteAgentRun()).toThrow(AppendOnlyViolationError);

    const log = await insertAuditLog(isolated.db, {
      actor: "system",
      action: "create",
      entity: "claim",
      entityId: claimId,
    });
    expect(log.id).toBeTruthy();
    expect(() => updateAuditLog()).toThrow(AppendOnlyViolationError);
    expect(() => deleteAuditLog()).toThrow(AppendOnlyViolationError);
  });
});
