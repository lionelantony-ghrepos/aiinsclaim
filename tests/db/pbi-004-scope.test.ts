import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { getClaimForUser, listClaimsForUser } from "@/lib/db/queries/claims";
import {
  createTempSqlitePath,
  openPushedDb,
  removeTempDir,
  runDrizzlePush,
} from "../helpers/isolated-db";
import { seedTwoClaimantClaims } from "../helpers/pbi-004-fixtures";

const temp = createTempSqlitePath();
let isolated: IsolatedDb;

describe("TC-004-02 claimant claim scope", () => {
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

  it("returns zero rows when claimant A queries claimant B claims", async () => {
    const fixture = await seedTwoClaimantClaims(isolated.db);

    const forA = await listClaimsForUser(isolated.db, fixture.userA);
    const forB = await listClaimsForUser(isolated.db, fixture.userB);
    const forStaff = await listClaimsForUser(isolated.db, fixture.adjuster);

    expect(forA.map((row) => row.id)).toEqual([fixture.claimAId]);
    expect(forB.map((row) => row.id)).toEqual([fixture.claimBId]);
    expect(await getClaimForUser(isolated.db, fixture.userA, fixture.claimBId)).toBeNull();

    const staffIds = forStaff.map((row) => row.id).sort();
    expect(staffIds).toEqual([fixture.claimAId, fixture.claimBId].sort());
  });
});
