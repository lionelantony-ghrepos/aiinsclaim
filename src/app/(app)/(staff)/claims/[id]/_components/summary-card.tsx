"use client";

import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { regenerateSummaryAction } from "../actions";

export type SummaryCardProps = {
  claimId: string;
  summaryMd: string | null;
  summaryGeneratedAt: Date | null;
  summaryStale: boolean;
};

/**
 * Simple inline markdown renderer for bold and paragraph breaks.
 * Keeps the component self-contained without a full markdown library dependency.
 */
function renderMarkdown(md: string): React.ReactNode {
  return md.split("\n").map((line, i) => {
    // Replace **text** with <strong>text</strong>
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return (
      <p key={i} className={line === "" ? "mt-2" : undefined}>
        {rendered}
      </p>
    );
  });
}

export function SummaryCard({
  claimId,
  summaryMd,
  summaryGeneratedAt,
  summaryStale,
}: SummaryCardProps) {
  const [isPending, startTransition] = useTransition();

  function handleRegenerate() {
    startTransition(async () => {
      await regenerateSummaryAction(claimId);
    });
  }

  return (
    <Card data-testid="summary-card" className="space-y-3">
      <CardHeader className="mb-0 flex flex-row items-center justify-between gap-2">
        <CardTitle>AI Summary</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={isPending}
          data-testid="summary-regenerate"
        >
          {isPending ? "Regenerating…" : "Regenerate"}
        </Button>
      </CardHeader>

      {summaryStale && (
        <div
          data-testid="summary-stale"
          className="mx-4 rounded-md border border-yellow-400 bg-yellow-50 px-3 py-2 text-sm text-yellow-800"
          role="alert"
        >
          Stale — last regeneration failed. Showing previous summary.
        </div>
      )}

      <div
        data-testid="summary-content"
        className="mx-4 mb-4 space-y-1 text-sm leading-relaxed"
      >
        {summaryMd ? (
          renderMarkdown(summaryMd)
        ) : (
          <p className="text-text-muted">
            No summary yet. Click &ldquo;Regenerate&rdquo; to generate one.
          </p>
        )}
      </div>

      <p
        data-testid="summary-provenance"
        className="mx-4 mb-3 text-xs text-text-muted"
      >
        <Badge tone="info" className="mr-1">
          AI-generated
        </Badge>
        {summaryGeneratedAt
          ? `Generated ${summaryGeneratedAt.toLocaleString()}.`
          : "Not yet generated."}{" "}
        View the{" "}
        <a href="?tab=timeline" className="underline hover:text-foreground">
          timeline
        </a>{" "}
        for sources.
      </p>
    </Card>
  );
}
