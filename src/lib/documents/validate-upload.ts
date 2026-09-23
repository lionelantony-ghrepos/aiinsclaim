import type { Db } from "@/lib/db/client";
import { getParameter } from "@/lib/rules/params";

const DEFAULT_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type UploadValidationResult =
  | { ok: true; maxBytes: number; allowedMimes: string[] }
  | { ok: false; code: "VALIDATION_FAILED"; message: string };

export async function getUploadConstraints(db: Db) {
  const [maxBytesParam, mimesParam] = await Promise.all([
    getParameter(db, "doc.max_bytes"),
    getParameter(db, "doc.allowed_mimes").catch(() => null),
  ]);

  const maxBytes = Number(maxBytesParam.valueJson);
  const allowedMimes =
    mimesParam && Array.isArray(mimesParam.valueJson)
      ? (mimesParam.valueJson as string[])
      : [...DEFAULT_ALLOWED_MIMES];

  return { maxBytes, allowedMimes };
}

export async function validateUploadFile(
  db: Db,
  file: { mimeType: string; sizeBytes: number },
): Promise<UploadValidationResult> {
  const { maxBytes, allowedMimes } = await getUploadConstraints(db);

  if (!allowedMimes.includes(file.mimeType)) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: `File type ${file.mimeType} is not allowed. Allowed: ${allowedMimes.join(", ")}`,
    };
  }

  if (file.sizeBytes > maxBytes) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: `File exceeds maximum size of ${maxBytes} bytes`,
    };
  }

  return { ok: true, maxBytes, allowedMimes };
}
