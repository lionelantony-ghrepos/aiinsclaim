import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { claims } from "@/lib/db/schema";
import {
  createDraftClaim,
  getDraftClaimDetail,
  updateDraftClaim,
} from "@/lib/db/queries/intake";
import { getFnolChecklist } from "@/lib/intake/checklist";
import {
  GuardFailedError,
  transitionClaim,
} from "@/lib/state-machine";
import { seedClaimTransitions } from "../../seed/loaders/transitions";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import {
  createTestDraftClaim,
  insertClaimantWithPolicy,
  satisfyGlassFnol,
} from "../helpers/pbi-009-fixtures";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-009 intake draft and submit flow", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
    await seedClaimTransitions(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("TC-009-02 draft persists and restores via getDraftClaimDetail", async () => {
    const { userId, policyId } = await insertClaimantWithPolicy(isolated.db, "auto");
    const draft = await createDraftClaim(isolated.db, {
      policyId,
      lob: "auto",
      claimType: "glass",
      actorUserId: userId,
    });

    await updateDraftClaim(isolated.db, {
      claimId: draft.claimId,
      incident: {
        description:
          "Windshield cracked by road debris while driving on the highway.",
        estimatedAmount: "450.00",
        incidentAt: "2026-06-15T14:30:00.000Z",
        location: {
          line1: "100 Test Ave",
          city: "Springfield",
          state: "IL",
          postalCode: "62701",
        },
        damagedPanel: "windshield",
      },
    });

    const restored = await getDraftClaimDetail(isolated.db, draft.claimId);
    expect(restored).not.toBeNull();
    expect(restored!.claim.claimNumber).toBe(draft.claimNumber);
    expect(restored!.claim.status).toBe("draft");
    expect(restored!.claim.incidentDescription).toBe(
      "Windshield cracked by road debris while driving on the highway.",
    );
    expect(restored!.claim.estimatedAmount).toBe("450.00");

    const location = restored!.claim.incidentLocationJson as Record<string, unknown>;
    expect(location.damagedPanel).toBe("windshield");
    expect(location.city).toBe("Springfield");

    const checklist = await getFnolChecklist(isolated.db, draft.claimId, {
      actor: userId,
    });
    expect(checklist.some((item) => item.requirement === "incident_description")).toBe(
      true,
    );
    expect(
      checklist.some((item) => item.requirement === '{"doc":"photo","min":1}'),
    ).toBe(true);
  });

  it("TC-009-03 submit blocked with INCOMPLETE_FNOL then succeeds when complete", async () => {
    const { userId, policyId } = await insertClaimantWithPolicy(isolated.db, "auto");
    const draft = await createTestDraftClaim(isolated.db, {
      policyId,
      claimType: "glass",
      actorUserId: userId,
    });

    await expect(
      transitionClaim(isolated.db, {
        claimId: draft.claimId,
        toStatus: "submitted",
        actorId: userId,
        reason: "Attempt submit incomplete FNOL",
        triggeredBy: "user",
        guardContext: { actor: userId },
      }),
    ).rejects.toMatchObject({
      name: "GuardFailedError",
      guardCode: "BR-DOC-001",
    });

    try {
      await transitionClaim(isolated.db, {
        claimId: draft.claimId,
        toStatus: "submitted",
        actorId: userId,
        reason: "Attempt submit incomplete FNOL",
        triggeredBy: "user",
        guardContext: { actor: userId },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(GuardFailedError);
      const guardError = error as GuardFailedError;
      expect(guardError.details?.missing?.length).toBeGreaterThan(0);
    }

    const [stillDraft] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, draft.claimId));
    expect(stillDraft.status).toBe("draft");

    await satisfyGlassFnol(isolated.db, draft.claimId, userId);

    const submitted = await transitionClaim(isolated.db, {
      claimId: draft.claimId,
      toStatus: "submitted",
      actorId: userId,
      reason: "Claimant submitted FNOL",
      triggeredBy: "user",
      guardContext: { actor: userId },
    });
    expect(submitted.toStatus).toBe("submitted");

    const [claimRow] = await isolated.db
      .select()
      .from(claims)
      .where(eq(claims.id, draft.claimId));
    expect(claimRow.status).toBe("submitted");
  });
});
