import { AgentProposalCard } from "@/components/agent-proposal-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export type TriageCardProps = {
  claimNumber: string;
  route: string | null;
  priority: number | null;
  severityScore: number | null;
  complexityScore: number | null;
  reasonCodes: string[];
  keyRisks: string[];
  confidencePercent: number | null;
  stpBlockReason: string | null;
  matchedTriageRules: string[];
};

export function TriageCard({
  claimNumber,
  route,
  priority,
  severityScore,
  complexityScore,
  reasonCodes,
  keyRisks,
  confidencePercent,
  stpBlockReason,
  matchedTriageRules,
}: TriageCardProps) {
  return (
    <section
      className="space-y-4"
      aria-labelledby="triage-card-heading"
      data-testid="triage-card"
    >
      <h2 id="triage-card-heading" className="text-xl font-semibold">
        Triage — {claimNumber}
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Routing</CardTitle>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Route</dt>
                <dd>
                  <Badge tone="info" data-testid="triage-route">
                    {route ?? "pending"}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Priority</dt>
                <dd data-testid="triage-priority">{priority ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Severity</dt>
                <dd data-testid="triage-severity">{severityScore ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Complexity</dt>
                <dd data-testid="triage-complexity">{complexityScore ?? "—"}</dd>
              </div>
              {stpBlockReason ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted">STP block</dt>
                  <dd>
                    <Badge tone="warning" data-testid="stp-block-reason">
                      {stpBlockReason}
                    </Badge>
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardHeader>
        </Card>

        <AgentProposalCard
          title="AGT-TRIAGE scores"
          summary={
            keyRisks.length > 0
              ? keyRisks.join(" · ")
              : "Severity and complexity scores from the triage analyst agent."
          }
          confidencePercent={confidencePercent ?? 0}
          reasonCodes={reasonCodes}
        />
      </div>

      {matchedTriageRules.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Matched triage rules</CardTitle>
            <ul className="mt-2 flex flex-wrap gap-2" data-testid="triage-matched-rules">
              {matchedTriageRules.map((ruleId) => (
                <li key={ruleId}>
                  <Badge tone="default">{ruleId}</Badge>
                </li>
              ))}
            </ul>
          </CardHeader>
        </Card>
      ) : null}
    </section>
  );
}
