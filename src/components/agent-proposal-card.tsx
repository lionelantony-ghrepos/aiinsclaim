import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export type AgentProposalCardProps = {
  title: string;
  summary: string;
  confidencePercent: number;
  reasonCodes: string[];
  onAccept?: () => void;
  onOverride?: () => void;
  disabled?: boolean;
};

export function AgentProposalCard({
  title,
  summary,
  confidencePercent,
  reasonCodes,
  onAccept,
  onOverride,
  disabled = false,
}: AgentProposalCardProps) {
  const clamped = Math.min(100, Math.max(0, confidencePercent));

  return (
    <Card data-testid="agent-proposal-card" className="space-y-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-text-muted">{summary}</p>
      </CardHeader>
      <div>
        <p className="mb-1 text-xs font-medium text-text-muted">
          Confidence {clamped}%
        </p>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-raised"
          role="meter"
          aria-label={`Confidence ${clamped} percent`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clamped}
        >
          <div
            className="h-full bg-info"
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
      <ul className="flex flex-wrap gap-2">
        {reasonCodes.map((code) => (
          <li key={code}>
            <Badge tone="info">{code}</Badge>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={onAccept}
          disabled={disabled || !onAccept}
          data-testid="agent-proposal-accept"
        >
          Accept
        </Button>
        <Button
          variant="outline"
          onClick={onOverride}
          disabled={disabled || !onOverride}
          data-testid="agent-proposal-override"
        >
          Override
        </Button>
      </div>
    </Card>
  );
}
