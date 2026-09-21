import { eq } from "drizzle-orm";
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
  agentRuns,
  auditLog,
  claimStateHistory,
  ruleAuditLog,
} from "@/lib/db/schema";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { insertMinimalClaim, sessionUser } from "../helpers/pbi-004-fixtures";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

async function expectAppendOnlyRejected(work: () => Promise<unknown>) {
  try {
    await work();
    expect.fail("expected append-only rejection");
  } catch (error) {
    expect(String(error)).toMatch(/append-only/i);
  }
}

describe("TC-004-04 append-only tables", () => {
  beforeAll(() => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
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
    await expectAppendOnlyRejected(() =>
      isolated.db
        .update(claimStateHistory)
        .set({ reason: "mutated" })
        .where(eq(claimStateHistory.id, history.id)),
    );
    await expectAppendOnlyRejected(() =>
      isolated.db
        .delete(claimStateHistory)
        .where(eq(claimStateHistory.id, history.id)),
    );

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
    await expectAppendOnlyRejected(() =>
      isolated.db
        .update(ruleAuditLog)
        .set({ actor: "mutated" })
        .where(eq(ruleAuditLog.id, audit.id)),
    );
    await expectAppendOnlyRejected(() =>
      isolated.db.delete(ruleAuditLog).where(eq(ruleAuditLog.id, audit.id)),
    );

    const run = await insertAgentRun(isolated.db, {
      agentId: "intake",
      status: "ok",
    });
    expect(run.id).toBeTruthy();
    expect(() => updateAgentRun()).toThrow(AppendOnlyViolationError);
    expect(() => deleteAgentRun()).toThrow(AppendOnlyViolationError);
    await expectAppendOnlyRejected(() =>
      isolated.db
        .update(agentRuns)
        .set({ model: "mutated" })
        .where(eq(agentRuns.id, run.id)),
    );
    await expectAppendOnlyRejected(() =>
      isolated.db.delete(agentRuns).where(eq(agentRuns.id, run.id)),
    );

    const log = await insertAuditLog(isolated.db, {
      actor: "system",
      action: "create",
      entity: "claim",
      entityId: claimId,
    });
    expect(log.id).toBeTruthy();
    expect(() => updateAuditLog()).toThrow(AppendOnlyViolationError);
    expect(() => deleteAuditLog()).toThrow(AppendOnlyViolationError);
    await expectAppendOnlyRejected(() =>
      isolated.db
        .update(auditLog)
        .set({ action: "mutated" })
        .where(eq(auditLog.id, log.id)),
    );
    await expectAppendOnlyRejected(() =>
      isolated.db.delete(auditLog).where(eq(auditLog.id, log.id)),
    );
  });
});
