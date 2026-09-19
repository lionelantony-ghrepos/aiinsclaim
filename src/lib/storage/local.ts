import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { STORAGE_ROOT } from "@/lib/db/paths";

export async function saveClaimDocument(
  claimId: string,
  fileName: string,
  bytes: Buffer,
) {
  const dir = path.join(STORAGE_ROOT, claimId);
  await fs.mkdir(dir, { recursive: true });

  const storagePath = path.join(claimId, `${randomUUID()}-${fileName}`);
  await fs.writeFile(path.join(STORAGE_ROOT, storagePath), bytes);
  return storagePath;
}

export function resolveStoragePath(storagePath: string) {
  return path.join(STORAGE_ROOT, storagePath);
}
