import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { claims, documents } from "@/lib/db/schema";
import {
  evaluateFnolCompleteness,
  evaluateSettlementCompleteness,
  GuardFailedError,
  transitionClaim,
} from "@/lib/state-machine";
import { seedClaimTransitions } from "../../seed/loaders/transitions";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import { insertBaseClaim } from "../helpers/pbi-007-fixtures";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-007 bugbot follow-ups", () => {
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

  it("BR-DOC-001 recognizes fire_service_reference and storm window keys", async () => {
    const fire = await insertBaseClaim(isolated.db, {
      status: "draft",
      lineOfBusiness: "property",
      claimType: "collision",
    });
    await isolated.db
      .update(claims)
      .set({
        claimType: "fire",
        lineOfBusiness: "property",
        incidentDescription: "Kitchen fire contained by brigade.",
        incidentLocationJson: { fireServiceReference: "FS-12345" },
      })
      .where(eq(claims.id, fire.claimId));

    const fireResult = await evaluateFnolCompleteness(isolated.db, fire.claimId, {
      asOf: "2026-06-01",
    });
    expect(fireResult.complete).toBe(true);

    const storm = await insertBaseClaim(isolated.db, {
      status: "draft",
      lineOfBusiness: "property",
      claimType: "collision",
    });
    await isolated.db
      .update(claims)
      .set({
        claimType: "storm",
        lineOfBusiness: "property",
        incidentDescription: "Hail damage to roof and gutters.",
        incidentLocationJson: { incidentDateInStormWindow: true },
      })
      .where(eq(claims.id, storm.claimId));

    for (let index = 0; index < 3; index += 1) {
      await isolated.db.insert(documents).values({
        id: crypto.randomUUID(),
        claimId: storm.claimId,
        docType: "photo",
        storagePath: `storm-${index}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        uploadedBy: storm.userId,
        createdAt: storm.now,
        updatedAt: storm.now,
      });
    }

    const stormResult = await evaluateFnolCompleteness(isolated.db, storm.claimId, {
      asOf: "2026-06-01",
    });
    expect(stormResult.complete).toBe(true);
  });

  it("settlement gate maps contents_inventory and stolen_items_inventory", async () => {
    const burglary = await insertBaseClaim(isolated.db, {
      status: "in_assessment",
      lineOfBusiness: "property",
      claimType: "collision",
      incidentDescription: "Burglary at residence.",
      estimatedAmount: "3000.00",
    });
    await isolated.db
      .update(claims)
      .set({
        claimType: "burglary",
        lineOfBusiness: "property",
        policeReportNumber: "PR-999",
      })
      .where(eq(claims.id, burglary.claimId));

    for (const docType of ["police_report", "inventory"] as const) {
      await isolated.db.insert(documents).values({
        id: crypto.randomUUID(),
        claimId: burglary.claimId,
        docType,
        storagePath: `${docType}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 100,
        uploadedBy: burglary.userId,
        createdAt: burglary.now,
        updatedAt: burglary.now,
      });
    }

    const result = await evaluateSettlementCompleteness(
      isolated.db,
      burglary.claimId,
      { asOf: "2026-06-01" },
    );
    expect(result.complete).toBe(true);
  });

  it("STP guard rejects in_triage→approved without explicit pass inputs", async () => {
    const fixture = await insertBaseClaim(isolated.db, {
      status: "in_triage",
      route: "green_lane",
      estimatedAmount: "1800.00",
    });

    await expect(
      transitionClaim(isolated.db, {
        claimId: fixture.claimId,
        toStatus: "approved",
        actorId: "rule:BR-STP-001",
        reason: "Attempt STP without validated inputs",
        triggeredBy: "rule",
        guardContext: { asOf: "2026-06-01" },
      }),
    ).rejects.toBeInstanceOf(GuardFailedError);
  });
});
