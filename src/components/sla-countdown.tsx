import { AlertCircle, CheckCircle2, Clock3, PauseCircle } from "lucide-react";
import type { SlaStatus } from "@/lib/db/schema/enums";
import { slaVisualTone, type SlaVisualTone } from "@/lib/ui/sla-visual";
import { Badge } from "@/components/ui/badge";

export type SlaCountdownProps = {
  remainingLabel: string;
  status: SlaStatus;
  elapsedRatio: number;
  warningRatio: number;
  testId?: string;
};

const TONE_COPY: Record<
  SlaVisualTone,
  { badge: "success" | "warning" | "danger"; Icon: typeof Clock3; state: string }
> = {
  ok: { badge: "success", Icon: CheckCircle2, state: "On track" },
  warning: { badge: "warning", Icon: Clock3, state: "Approaching breach" },
  danger: { badge: "danger", Icon: AlertCircle, state: "Breached" },
  paused: { badge: "warning", Icon: PauseCircle, state: "Paused" },
};

export function SlaCountdown({
  remainingLabel,
  status,
  elapsedRatio,
  warningRatio,
  testId,
}: SlaCountdownProps) {
  const tone = slaVisualTone({ status, elapsedRatio, warningRatio });
  const { badge, Icon, state } = TONE_COPY[tone];

  return (
    <Badge
      data-testid={testId}
      tone={badge}
      aria-live="polite"
    >
      <Icon aria-hidden />
      <span>
        {state}: {remainingLabel}
      </span>
    </Badge>
  );
}
