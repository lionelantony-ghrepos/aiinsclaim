import { Clock3, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { SlaVisualTone } from "@/lib/ui/sla-visual";

export type TaskCardProps = {
  title: string;
  claimNumber: string;
  priorityLabel: string;
  slaRemainingLabel: string;
  slaTone: SlaVisualTone;
};

const TONE_TO_BADGE = {
  ok: "success",
  warning: "warning",
  danger: "danger",
  paused: "warning",
} as const;

export function TaskCard({
  title,
  claimNumber,
  priorityLabel,
  slaRemainingLabel,
  slaTone,
}: TaskCardProps) {
  return (
    <Card data-testid="task-card">
      <CardHeader>
        <p className="font-mono text-xs text-text-muted">{claimNumber}</p>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <div className="flex flex-wrap gap-2">
        <Badge tone="default">
          <Flag aria-hidden />
          Priority {priorityLabel}
        </Badge>
        <Badge tone={TONE_TO_BADGE[slaTone]}>
          <Clock3 aria-hidden />
          SLA {slaRemainingLabel}
        </Badge>
      </div>
    </Card>
  );
}
