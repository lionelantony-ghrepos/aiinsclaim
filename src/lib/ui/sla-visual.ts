import type { SlaStatus } from "@/lib/db/schema/enums";

export type SlaVisualTone = "ok" | "warning" | "danger" | "paused";

export function slaVisualTone(args: {
  status: SlaStatus;
  elapsedRatio: number;
  warningRatio: number;
}): SlaVisualTone {
  if (args.status === "paused") {
    return "paused";
  }
  if (args.status === "breached" || args.elapsedRatio >= 1) {
    return "danger";
  }
  if (args.status === "met") {
    return "ok";
  }
  if (args.elapsedRatio >= args.warningRatio) {
    return "warning";
  }
  return "ok";
}
