import { createHash } from "node:crypto";

export function deterministicId(seed: string, index: number): string {
  const hash = createHash("sha256")
    .update(`${seed}:${index}`)
    .digest("hex");
  const bytes = hash.slice(0, 32).split("");
  bytes[12] = "4";
  bytes[16] = ((parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const hex = bytes.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
