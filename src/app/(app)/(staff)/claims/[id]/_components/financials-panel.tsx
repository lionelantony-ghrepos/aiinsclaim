import { CheckCircle2, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { SettlementChecklistItem } from "@/lib/assessment/checklist";
import { CompleteAssessmentButton, RequestInfoForm } from "./assessment-actions";
import { ReserveWorkbench } from "./reserve-workbench";

export type ReserveRow = {
  id: string;
  kind: string;
  amount: string;
  source: string;
  supersedesId: string | null;
  createdAt: Date;
};

export function FinancialsPanel({
  claimId,
  claimStatus,
  reserves,
  checklist,
}: {
  claimId: string;
  claimStatus: string;
  reserves: ReserveRow[];
  checklist: SettlementChecklistItem[];
}) {
  const latestIndemnity = reserves.find((row) => row.kind === "indemnity") ?? null;
  const latestExpense = reserves.find((row) => row.kind === "expense") ?? null;
  const inAssessment = claimStatus === "in_assessment";
  const missing = checklist.filter((item) => !item.satisfied);

  return (
    <div className="space-y-4">
      <Card data-testid="workbench-reserves" className="space-y-3">
        <CardHeader className="mb-0">
          <CardTitle>Current reserves</CardTitle>
        </CardHeader>
        {latestIndemnity || latestExpense ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-text-muted">Indemnity</dt>
              <dd className="font-mono" data-testid="reserve-current-indemnity">
                {latestIndemnity?.amount ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Expense</dt>
              <dd className="font-mono" data-testid="reserve-current-expense">
                {latestExpense?.amount ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Source</dt>
              <dd data-testid="reserve-current-source">
                {(latestIndemnity?.source ?? latestExpense?.source ?? "—").replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Revisions</dt>
              <dd data-testid="reserve-revision-count">{reserves.length}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-text-muted" data-testid="reserve-empty">
            No reserves set yet.
          </p>
        )}
      </Card>

      <ReserveWorkbench claimId={claimId} hasPriorReserve={reserves.length > 0} />

      <Card data-testid="settlement-checklist" className="space-y-3">
        <CardHeader className="mb-0">
          <CardTitle>Settlement readiness</CardTitle>
          <p className="text-sm text-text-muted">
            {missing.length === 0
              ? "All settlement documents satisfied."
              : `${missing.length} requirement${missing.length === 1 ? "" : "s"} still missing.`}
          </p>
        </CardHeader>
        <ul className="space-y-1">
          {checklist.map((item) => (
            <li
              key={item.requirement}
              data-testid="settlement-checklist-item"
              className="flex items-center gap-2 text-sm"
            >
              {item.satisfied ? (
                <CheckCircle2 aria-hidden className="size-4 text-success" />
              ) : (
                <CircleDashed aria-hidden className="size-4 text-warning" />
              )}
              <span>{item.label}</span>
              <Badge tone={item.satisfied ? "success" : "warning"}>
                {item.satisfied ? "Satisfied" : "Missing"}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <RequestInfoForm claimId={claimId} canRequest={inAssessment} />
        <CompleteAssessmentButton claimId={claimId} canComplete={inAssessment} />
      </div>
    </div>
  );
}
