import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedDb } from "@/lib/db/isolated";
import { validateUploadFile } from "@/lib/documents/validate-upload";
import { access } from "node:fs/promises";
import { resolveStoragePath } from "@/lib/storage/local";
import { uploadDraftDocument } from "@/lib/db/queries/intake";
import { seedRulesAndParameters } from "../../seed/loaders/rules";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import {
  createTestDraftClaim,
  insertClaimantWithPolicy,
} from "../helpers/pbi-009-fixtures";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("PBI-010 document upload validation", () => {
  beforeAll(async () => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
    await seedRulesAndParameters(isolated.db);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("TC-010-01 rejects disallowed mime types", async () => {
    const result = await validateUploadFile(isolated.db, {
      mimeType: "application/zip",
      sizeBytes: 1024,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("not allowed");
    }
  });

  it("TC-010-01 rejects files over max bytes", async () => {
    const result = await validateUploadFile(isolated.db, {
      mimeType: "application/pdf",
      sizeBytes: 20_000_000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("maximum size");
    }
  });

  it("TC-010-01 allowed upload creates storage object and documents row", async () => {
    const { userId, policyId } = await insertClaimantWithPolicy(isolated.db, "auto");
    const draft = await createTestDraftClaim(isolated.db, {
      policyId,
      claimType: "collision",
      actorUserId: userId,
    });

    const bytes = Buffer.from("%PDF-1.4 sample invoice");
    const row = await uploadDraftDocument(isolated.db, {
      claimId: draft.claimId,
      docType: "photo",
      fileName: "sample.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      bytes,
      uploadedBy: userId,
    });

    expect(row.storagePath).toBeTruthy();
    expect(row.status).toBe("uploaded");

    await access(resolveStoragePath(row.storagePath));
    expect(row.mimeType).toBe("application/pdf");
  });
});
