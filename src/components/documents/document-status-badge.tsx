import { Badge } from "@/components/ui/badge";
import type { DocStatus } from "@/lib/db/schema/enums";

const STATUS_LABELS: Record<DocStatus, string> = {
  uploaded: "Uploaded",
  extracting: "Extracting",
  extracted: "Extracted",
  verification_pending: "Needs review",
  verified: "Verified",
  rejected: "Rejected",
};

const STATUS_TONE: Record<
  DocStatus,
  "default" | "success" | "warning" | "danger" | "info"
> = {
  uploaded: "default",
  extracting: "info",
  extracted: "info",
  verification_pending: "warning",
  verified: "success",
  rejected: "danger",
};

export function DocumentStatusBadge({ status }: { status: DocStatus | string }) {
  const key = status as DocStatus;
  const label = STATUS_LABELS[key] ?? status.replaceAll("_", " ");
  const tone = STATUS_TONE[key] ?? "default";

  return (
    <Badge tone={tone} data-testid={`doc-status-${status}`}>
      {label}
    </Badge>
  );
}
