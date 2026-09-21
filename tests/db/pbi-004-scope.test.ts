import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canAccessClaim } from "@/lib/auth/scope";
import type { IsolatedDb } from "@/lib/db/isolated";
import { getClaimForUser, listClaimsForUser } from "@/lib/db/queries/claims";
import { listDocumentsForUser } from "@/lib/db/queries/documents";
import { listNotificationsForUser } from "@/lib/db/queries/notifications";
import { documents, notifications } from "@/lib/db/schema";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { seedTwoClaimantClaims } from "../helpers/pbi-004-fixtures";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("TC-004-02 claimant claim scope", () => {
  beforeAll(() => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("returns zero rows when claimant A queries claimant B claims", async () => {
    const fixture = await seedTwoClaimantClaims(isolated.db);

    const forA = await listClaimsForUser(isolated.db, fixture.userA);
    const forB = await listClaimsForUser(isolated.db, fixture.userB);
    const forStaff = await listClaimsForUser(isolated.db, fixture.adjuster);

    expect(forA.map((row) => row.id)).toEqual([fixture.claimAId]);
    expect(forB.map((row) => row.id)).toEqual([fixture.claimBId]);
    expect(await getClaimForUser(isolated.db, fixture.userA, fixture.claimBId)).toBeNull();
    expect(await canAccessClaim(isolated.db, fixture.userA, fixture.claimBId)).toBe(false);
    expect(await canAccessClaim(isolated.db, fixture.userA, fixture.claimAId)).toBe(true);
    expect(await canAccessClaim(isolated.db, fixture.adjuster, fixture.claimBId)).toBe(true);
    expect(
      await canAccessClaim(isolated.db, fixture.adjuster, crypto.randomUUID()),
    ).toBe(false);

    const staffIds = forStaff.map((row) => row.id).sort();
    expect(staffIds).toEqual([fixture.claimAId, fixture.claimBId].sort());

    const now = new Date();
    await isolated.db.insert(documents).values([
      {
        id: crypto.randomUUID(),
        claimId: fixture.claimAId,
        docType: "photo",
        storagePath: "a.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1,
        uploadedBy: fixture.userA.id,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        claimId: fixture.claimBId,
        docType: "photo",
        storagePath: "b.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1,
        uploadedBy: fixture.userB.id,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(
      await listDocumentsForUser(isolated.db, fixture.userA, fixture.claimBId),
    ).toEqual([]);
    expect(
      (await listDocumentsForUser(isolated.db, fixture.userA, fixture.claimAId))
        .length,
    ).toBe(1);

    await isolated.db.insert(notifications).values([
      {
        id: crypto.randomUUID(),
        userId: fixture.userA.id,
        kind: "info",
        title: "A",
        bodyMd: "for A",
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId: fixture.userB.id,
        kind: "info",
        title: "B",
        bodyMd: "for B",
        createdAt: now,
      },
    ]);
    const notesA = await listNotificationsForUser(isolated.db, fixture.userA);
    expect(notesA.map((row) => row.title)).toEqual(["A"]);
  });
});
