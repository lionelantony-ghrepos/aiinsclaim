import type { DocStatus, DocType } from "@/lib/db/schema";
import { documentsPerClaim } from "./distributions";
import type { SeedAsset } from "./assets";
import type { SeedClaim } from "./claims";
import { deterministicId } from "../lib/deterministic-id";

export type SeedDocument = {
  id: string;
  claimId: string;
  docType: DocType;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  status: DocStatus;
};

const DOC_TYPES_BY_CLAIM: DocType[] = [
  "photo",
  "police_report",
  "repair_estimate",
  "invoice",
  "contractor_report",
];

export function generateDocumentPlan(
  claims: SeedClaim[],
  assets: SeedAsset[],
): SeedDocument[] {
  const docs: SeedDocument[] = [];
  let docIndex = 0;

  for (const [claimIndex, claim] of claims.entries()) {
    const count = documentsPerClaim(claimIndex);
    for (let i = 0; i < count; i += 1) {
      const asset = assets[(docIndex + i) % assets.length];
      docs.push({
        id: deterministicId("document", docIndex),
        claimId: claim.id,
        docType: DOC_TYPES_BY_CLAIM[i % DOC_TYPES_BY_CLAIM.length],
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        bytes: asset.bytes,
        status: claim.status === "draft" ? "uploaded" : "extracted",
      });
      docIndex += 1;
    }
  }

  return docs;
}
