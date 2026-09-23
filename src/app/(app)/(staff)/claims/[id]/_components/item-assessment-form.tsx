"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateItemAssessmentAction } from "../actions";

const STATUS_OPTIONS = ["pending", "assessed", "disputed"] as const;

export function ItemAssessmentForm({
  claimItemId,
  initialAssessedAmount,
  initialStatus,
}: {
  claimItemId: string;
  initialAssessedAmount: string | null;
  initialStatus: string;
}) {
  const [assessedAmount, setAssessedAmount] = useState(initialAssessedAmount ?? "");
  const [status, setStatus] = useState(
    STATUS_OPTIONS.includes(initialStatus as (typeof STATUS_OPTIONS)[number])
      ? initialStatus
      : "pending",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await updateItemAssessmentAction({
      claimItemId,
      assessedAmount: assessedAmount.trim() === "" ? null : assessedAmount.trim(),
      assessmentStatus: status,
    });
    setPending(false);
    if (result.ok) {
      setMessage("Assessment saved.");
    } else {
      setMessage(`Could not save: ${result.error.message}`);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid={`item-assess-form-${claimItemId}`}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`assessed-${claimItemId}`} className="text-xs font-medium">
          Assessed amount
        </label>
        <input
          id={`assessed-${claimItemId}`}
          inputMode="decimal"
          placeholder="0.00"
          value={assessedAmount}
          onChange={(event) => setAssessedAmount(event.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-3 font-mono text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`status-${claimItemId}`} className="text-xs font-medium">
          Assessment status
        </label>
        <select
          id={`status-${claimItemId}`}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save assessment"}
      </Button>
      {initialStatus === "disputed" ? <Badge tone="warning">Disputed</Badge> : null}
      <p aria-live="polite" className="w-full text-xs text-text-muted">
        {message}
      </p>
    </form>
  );
}
