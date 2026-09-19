import { AlertTriangle, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import type { FraudBand } from "@/lib/db/schema/enums";
import { Badge } from "@/components/ui/badge";

export type FraudBandBadgeProps = {
  band: FraudBand;
  testId?: string;
};

const BAND_COPY: Record<
  FraudBand,
  { label: string; tone: "success" | "warning" | "danger"; Icon: typeof Shield }
> = {
  low: { label: "Low fraud band", tone: "success", Icon: ShieldCheck },
  medium: { label: "Medium fraud band", tone: "warning", Icon: Shield },
  high: { label: "High fraud band", tone: "danger", Icon: ShieldAlert },
  critical: { label: "Critical fraud band", tone: "danger", Icon: AlertTriangle },
};

const BAND_COLOR: Record<FraudBand, string> = {
  low: "text-fraud-low",
  medium: "text-fraud-medium",
  high: "text-fraud-high",
  critical: "text-fraud-critical",
};

export function FraudBandBadge({ band, testId }: FraudBandBadgeProps) {
  const { label, tone, Icon } = BAND_COPY[band];

  return (
    <Badge
      data-testid={testId}
      tone={tone}
      className={BAND_COLOR[band]}
    >
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
