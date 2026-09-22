"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { completeAssessmentAction, requestInfoAction } from "../actions";

export function RequestInfoForm({
  claimId,
  canRequest,
}: {
  claimId: string;
  canRequest: boolean;
}) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    const result = await requestInfoAction({ claimId, note });
    setPending(false);
    if (result.ok) {
      setStatus("Info request sent; claim moved to pending info.");
      setNote("");
    } else {
      setStatus(`Request failed: ${result.error.message}`);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="request-info-form"
      className="space-y-2 rounded-md border border-border p-3"
    >
      <label htmlFor="request-info-note" className="text-sm font-medium">
        Request information from claimant
      </label>
      <textarea
        id="request-info-note"
        data-testid="request-info-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        disabled={!canRequest || pending}
        placeholder="Describe what is needed (min 10 characters)…"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
      />
      <Button
        type="submit"
        size="sm"
        data-testid="request-info-submit"
        disabled={!canRequest || pending || note.trim().length < 10}
      >
        {pending ? "Sending…" : "Send request"}
      </Button>
      <p aria-live="polite" data-testid="request-info-status" className="text-xs text-text-muted">
        {status ?? (canRequest ? "" : "Available only while the claim is in assessment.")}
      </p>
    </form>
  );
}

export function CompleteAssessmentButton({
  claimId,
  canComplete,
}: {
  claimId: string;
  canComplete: boolean;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setStatus(null);
    const result = await completeAssessmentAction({ claimId });
    setPending(false);
    if (result.ok) {
      setStatus("Assessment complete — claim moved to settlement.");
    } else {
      setStatus(`Blocked: ${result.error.message}`);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={onClick}
        disabled={!canComplete || pending}
        data-testid="complete-assessment"
      >
        {pending ? "Completing…" : "Complete assessment"}
      </Button>
      <p aria-live="polite" data-testid="complete-assessment-status" className="text-sm text-text-muted">
        {status}
      </p>
    </div>
  );
}
