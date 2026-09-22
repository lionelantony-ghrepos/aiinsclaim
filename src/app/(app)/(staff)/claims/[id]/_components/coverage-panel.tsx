import { ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { evaluateCoverage } from "@/lib/coverage";
import type { ClaimType, Lob } from "@/lib/db/schema";

export function CoveragePanel({
  lineOfBusiness,
  claimType,
  estimatedAmount,
  coverageJson,
}: {
  lineOfBusiness: Lob;
  claimType: ClaimType;
  estimatedAmount: string | null;
  coverageJson: Record<string, unknown>;
}) {
  const estimated = Number(estimatedAmount ?? 0);
  const result = evaluateCoverage(
    { lineOfBusiness, claimType, estimatedAmount: estimated },
    coverageJson,
  );

  return (
    <Card data-testid="coverage-panel" className="space-y-3">
      <CardHeader className="mb-0">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck aria-hidden className="size-4" />
          Coverage evaluation
        </CardTitle>
        <p className="text-sm text-text-muted">
          {result.coverageKey.replaceAll("_", " ")} · computed from policy
          coverage — display only
        </p>
      </CardHeader>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-text-muted">Limit</dt>
          <dd className="font-mono" data-testid="coverage-limit">
            {result.limit.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Deductible</dt>
          <dd className="font-mono" data-testid="coverage-deductible">
            {result.deductible.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Estimated</dt>
          <dd className="font-mono" data-testid="coverage-estimated">
            {result.estimatedAmount.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Covered</dt>
          <dd className="font-mono" data-testid="coverage-covered">
            {result.coveredAmount.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Payable estimate</dt>
          <dd className="font-mono" data-testid="coverage-payable">
            {result.payableEstimate.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Within limit</dt>
          <dd data-testid="coverage-within-limit">
            {result.withinLimit ? "Yes" : "No — exceeds limit"}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
