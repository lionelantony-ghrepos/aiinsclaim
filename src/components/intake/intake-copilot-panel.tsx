"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { IntakeCompletenessHint } from "@/lib/schemas/agents/intake";
import { cn } from "@/lib/utils";

const inputClassName =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export type IntakeCopilotPanelProps = {
  narrative: string;
  onNarrativeChange: (value: string) => void;
  summaryDraft: string;
  onSummaryDraftChange: (value: string) => void;
  hints: IntakeCompletenessHint[];
  onGetSuggestions: () => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
};

function hintTone(severity: IntakeCompletenessHint["severity"]) {
  switch (severity) {
    case "error":
      return "danger" as const;
    case "warning":
      return "warning" as const;
    default:
      return "info" as const;
  }
}

export function IntakeCopilotPanel({
  narrative,
  onNarrativeChange,
  summaryDraft,
  onSummaryDraftChange,
  hints,
  onGetSuggestions,
  loading = false,
  disabled = false,
}: IntakeCopilotPanelProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleGetSuggestions() {
    setLocalError(null);
    if (!narrative.trim()) {
      setLocalError("Enter a narrative before requesting suggestions.");
      return;
    }
    await onGetSuggestions();
  }

  return (
    <Card data-testid="intake-copilot">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Intake copilot</CardTitle>
          <Badge tone="info">AGT-INTAKE</Badge>
        </div>
        <p className="text-sm text-text-muted">
          Draft a summary and review completeness hints. Suggestions never auto-submit.
        </p>
      </CardHeader>

      <div className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-text">Your narrative</span>
          <textarea
            value={narrative}
            onChange={(event) => onNarrativeChange(event.target.value)}
            rows={4}
            disabled={disabled}
            className={cn(inputClassName, "min-h-24 resize-y")}
            placeholder="Describe what happened in your own words…"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleGetSuggestions}
            disabled={disabled || loading}
          >
            {loading ? "Getting suggestions…" : "Get suggestions"}
          </Button>
          {localError ? (
            <p className="text-sm text-danger" role="alert">
              {localError}
            </p>
          ) : null}
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-text">Summary draft (editable)</span>
          <textarea
            value={summaryDraft}
            onChange={(event) => onSummaryDraftChange(event.target.value)}
            rows={5}
            disabled={disabled}
            className={cn(inputClassName, "min-h-28 resize-y")}
            placeholder="Summary will appear here after you request suggestions."
          />
        </label>

        {hints.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-text">Completeness hints</h4>
            <ul className="space-y-2" aria-label="Completeness hints">
              {hints.map((hint) => (
                <li
                  key={`${hint.field}-${hint.hint}`}
                  className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={hintTone(hint.severity)}>{hint.severity}</Badge>
                    <span className="font-mono text-xs text-text-muted">{hint.field}</span>
                  </div>
                  <p className="text-text">{hint.hint}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
