import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { count, eq, isNotNull } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import type { IsolatedDb } from "@/lib/db/isolated";
import {
  claims,
  documents,
  fraudScores,
  parameters,
  parties,
  policies,
  ruleAuditLog,
  ruleSets,
  users,
} from "@/lib/db/schema";
import {
  AUTO_CLAIM_TYPES,
  ENTITY_COUNTS,
  FRAUD_BAND_DISTRIBUTION,
  PROPERTY_CLAIM_TYPES,
  STATUS_DISTRIBUTION,
  documentsPerClaim,
} from "../../seed/generators/distributions";
import { assertNotProduction, runSeed } from "../../seed/index";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";

let temp: { dir: string; file: string };
let storageDir: string;
let isolated: IsolatedDb;

function expectedDocumentCount(claimCount: number) {
  let total = 0;
  for (let i = 0; i < claimCount; i += 1) {
    total += documentsPerClaim(i);
  }
  return total;
}

async function tableCount(db: Db, table: SQLiteTable) {
  const [row] = await db.select({ value: count() }).from(table);
  return row?.value ?? 0;
}

async function seedChecksum(db: IsolatedDb["db"]) {
  const claimRows = await db
    .select({
      claimNumber: claims.claimNumber,
      status: claims.status,
      lineOfBusiness: claims.lineOfBusiness,
      claimType: claims.claimType,
      estimatedAmount: claims.estimatedAmount,
      route: claims.route,
    })
    .from(claims)
    .orderBy(claims.claimNumber);

  const userRows = await db
    .select({ email: users.email, role: users.role })
    .from(users)
    .orderBy(users.email);

  return createHash("sha256")
    .update(JSON.stringify({ claimRows, userRows }))
    .digest("hex");
}

describe("PBI-005 seed pipeline", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiinsclaim-pbi005-storage-"));
    process.env.DATABASE_PATH = temp.file;
    process.env.STORAGE_PATH = storageDir;
    isolated = openPushedDb(temp.file);
    await runSeed(isolated.db, isolated.sqlite);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
    if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
    delete process.env.STORAGE_PATH;
  });

  it("TC-005-01 entity counts match §6.1", async () => {
    expect(await tableCount(isolated.db, users)).toBe(ENTITY_COUNTS.users);
    expect(await tableCount(isolated.db, parties)).toBe(ENTITY_COUNTS.parties);
    expect(await tableCount(isolated.db, policies)).toBe(ENTITY_COUNTS.policies);
    expect(await tableCount(isolated.db, claims)).toBe(ENTITY_COUNTS.claims);
    expect(await tableCount(isolated.db, documents)).toBe(
      expectedDocumentCount(ENTITY_COUNTS.claims),
    );
    expect(await tableCount(isolated.db, ruleSets)).toBe(ENTITY_COUNTS.ruleSets);
    expect(await tableCount(isolated.db, parameters)).toBeGreaterThanOrEqual(30);
  });

  it("TC-005-02 distributions match §6.2 (±1)", async () => {
    const statusRows = await isolated.db
      .select({ key: claims.status, value: count() })
      .from(claims)
      .groupBy(claims.status);
    const statusCounts = Object.fromEntries(
      statusRows.map((row) => [row.key, row.value]),
    );
    for (const [status, expected] of Object.entries(STATUS_DISTRIBUTION)) {
      expect(statusCounts[status as keyof typeof STATUS_DISTRIBUTION]).toBe(expected);
    }

    const lobRows = await isolated.db
      .select({ key: claims.lineOfBusiness, value: count() })
      .from(claims)
      .groupBy(claims.lineOfBusiness);
    const lobCounts = Object.fromEntries(lobRows.map((row) => [row.key, row.value]));
    expect(lobCounts.auto).toBe(70);
    expect(lobCounts.property).toBe(50);

    const typeRows = await isolated.db
      .select({ key: claims.claimType, value: count() })
      .from(claims)
      .groupBy(claims.claimType);
    const typeCounts = Object.fromEntries(typeRows.map((row) => [row.key, row.value]));

    for (const [claimType, expected] of Object.entries(AUTO_CLAIM_TYPES)) {
      expect(typeCounts[claimType]).toBe(expected);
    }
    for (const [claimType, expected] of Object.entries(PROPERTY_CLAIM_TYPES)) {
      expect(typeCounts[claimType]).toBe(expected);
    }

    const bandRows = await isolated.db
      .select({ key: fraudScores.band, value: count() })
      .from(fraudScores)
      .groupBy(fraudScores.band);
    const bandCounts = Object.fromEntries(bandRows.map((row) => [row.key, row.value]));

    for (const [band, expected] of Object.entries(FRAUD_BAND_DISTRIBUTION)) {
      const actual = bandCounts[band] ?? 0;
      expect(actual).toBeGreaterThanOrEqual(expected - 1);
      expect(actual).toBeLessThanOrEqual(expected + 1);
    }
  });

  it("TC-005-03 routed claims have rule_audit_log rows", async () => {
    const routedClaims = await isolated.db
      .select({ id: claims.id, route: claims.route })
      .from(claims)
      .where(isNotNull(claims.route));

    expect(routedClaims.length).toBeGreaterThan(0);

    for (const claim of routedClaims) {
      const audits = await isolated.db
        .select()
        .from(ruleAuditLog)
        .where(eq(ruleAuditLog.claimId, claim.id));

      const triageAudit = audits.find(
        (row) =>
          typeof row.outputsJson === "object" &&
          row.outputsJson !== null &&
          "route" in row.outputsJson &&
          row.outputsJson.route === claim.route,
      );
      expect(triageAudit).toBeDefined();
    }
  });

  it("TC-005-04 second seed run is identical", async () => {
    const firstChecksum = await seedChecksum(isolated.db);
    const firstCounts = {
      users: await tableCount(isolated.db, users),
      claims: await tableCount(isolated.db, claims),
      documents: await tableCount(isolated.db, documents),
    };

    await runSeed(isolated.db, isolated.sqlite);

    const secondChecksum = await seedChecksum(isolated.db);
    const secondCounts = {
      users: await tableCount(isolated.db, users),
      claims: await tableCount(isolated.db, claims),
      documents: await tableCount(isolated.db, documents),
    };

    expect(secondCounts).toEqual(firstCounts);
    expect(secondChecksum).toBe(firstChecksum);
  }, 180_000);

  it("TC-005-05 production guard throws", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertNotProduction()).toThrow(/production/i);
    vi.unstubAllEnvs();
  });
});
