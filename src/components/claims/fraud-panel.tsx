"use client";

import { useState, useTransition } from "react";
import { setSiuDisposition } from "@/app/(app)/(staff)/siu/actions";
import { FraudBandBadge } from "@/components/fraud-band-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { FraudBand, SiuDisposition, UserRole } from "@/lib/db/schema/enums";

type ScoreBreakdownRow = {
  points: number;
  reasonCode?: string;
};

type FraudEvidence = {
  signal: string;
  quote: string;
  source: string;
};

type FraudPanelProps = {
  claimId: string;
  claimNumber: string;
  band: FraudBand;
  score: number;
  reasonCodes: string[];
  scoreBreakdown: ScoreBreakdownRow[];
  evidence: FraudEvidence[];
  siuDisposition: SiuDisposition | null;
  siuReferred: boolean;
  userRole: UserRole;
};

const SIU_ROLES = new Set<UserRole>(["siu_analyst", "supervisor"]);

export function FraudPanel({
  claimId,
  claimNumber,
  band,
  score,
  reasonCodes,
  scoreBreakdown,
  evidence,
  siuDisposition,
  siuReferred,
  userRole,
}: FraudPanelProps) {
  const [disposition, setDisposition] = useState<SiuDisposition>(
    siuDisposition ?? "open",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canSetDisposition = SIU_ROLES.has(userRole);

  function handleDispositionChange(next: SiuDisposition) {
    setDisposition(next);
    setMessage(null);
    startTransition(async () => {
      const result = await setSiuDisposition({
        claimId,
        disposition: next,
      });
      if (result.ok) {
        setMessage(`Disposition updated to ${next.replaceAll("_", " ")}.`);
      } else {
        setMessage(result.error.message);
      }
    });
  }

  return (
    <section
      className="space-y-4"
      aria-labelledby="fraud-panel-heading"
      data-testid="fraud-panel"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="fraud-panel-heading" className="text-xl font-semibold">
          Fraud scoring — {claimNumber}
        </h2>
        <FraudBandBadge band={band} testId="fraud-panel-band" />
        <Badge tone="default" data-testid="fraud-panel-score">
          Score {score}
        </Badge>
        {siuReferred ? (
          <Badge tone="danger" data-testid="fraud-siu-referred">
            SIU referred
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score breakdown</CardTitle>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-text-muted">
                  <th className="py-1 pr-2 font-medium">Reason</th>
                  <th className="py-1 font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {scoreBreakdown.length > 0 ? (
                  scoreBreakdown.map((row) => (
                    <tr key={row.reasonCode ?? row.points} className="border-b">
                      <td className="py-2 pr-2">{row.reasonCode ?? "—"}</td>
                      <td className="py-2">+{row.points}</td>
                    </tr>
                  ))
                ) : (
                  reasonCodes.map((code) => (
                    <tr key={code} className="border-b">
                      <td className="py-2 pr-2">{code}</td>
                      <td className="py-2">—</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent evidence</CardTitle>
            {evidence.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">
                No evidence quotes from AGT-FRAUD.
              </p>
            ) : (
              <ul className="mt-2 space-y-3 text-sm">
                {evidence.map((item) => (
                  <li key={`${item.signal}-${item.quote.slice(0, 24)}`}>
                    <Badge tone="warning">{item.signal}</Badge>
                    <blockquote className="mt-1 border-l-2 pl-3 italic">
                      &ldquo;{item.quote}&rdquo;
                    </blockquote>
                    <p className="text-text-muted">Source: {item.source}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardHeader>
        </Card>
      </div>

      {canSetDisposition ? (
        <Card>
          <CardHeader>
            <CardTitle>SIU disposition</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["open", "cleared", "confirmed_fraud"] as SiuDisposition[]).map(
                (option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={disposition === option ? "default" : "outline"}
                    disabled={pending}
                    data-testid={`siu-disposition-${option}`}
                    onClick={() => handleDispositionChange(option)}
                  >
                    {option.replaceAll("_", " ")}
                  </Button>
                ),
              )}
            </div>
            {message ? (
              <p className="mt-2 text-sm" role="status" aria-live="polite">
                {message}
              </p>
            ) : null}
          </CardHeader>
        </Card>
      ) : null}
    </section>
  );
}
