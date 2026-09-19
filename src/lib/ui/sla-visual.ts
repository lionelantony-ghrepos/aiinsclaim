import type { SlaStatus } from "@/lib/db/schema/enums";

/** DESIGN §9 visual threshold: countdown turns amber at 75% elapsed. */
export const SLA_AMBER_ELAPSED_RATIO = 0.75;

export type SlaVisualTone = "ok" | "warning" | "danger";

export function slaVisualTone(args: {
  status: SlaStatus;
  elapsedRatio: number;
}): SlaVisualTone {
  if (args.status === "breached" || args.elapsedRatio >= 1) {
    return "danger";
  }
  if (args.status === "met") {
    return "ok";
  }
  if (args.elapsedRatio >= SLA_AMBER_ELAPSED_RATIO) {
    return "warning";
  }
  return "ok";
}
