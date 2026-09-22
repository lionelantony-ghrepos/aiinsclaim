"use client";

import { useState } from "react";
import { AgentProposalCard } from "@/components/agent-proposal-card";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReserveSuggestion } from "@/lib/agents/reserve";
import { confirmReserveAction, suggestReserveAction } from "../actions";

export function ReserveWorkbench({
  claimId,
  hasPriorReserve,
}: {
  claimId: string;
  hasPriorReserve: boolean;
}) {
  const [suggestion, setSuggestion] = useState<ReserveSuggestion | null>(null);
  const [agentRunId, setAgentRunId] = useState<string | null>(null);
  const [indemnity, setIndemnity] = useState("");
  const [expense, setExpense] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function onSuggest() {
    setSuggesting(true);
    setStatus(null);
    const result = await suggestReserveAction({ claimId });
    setSuggesting(false);
    if (!result.ok) {
      setStatus(`Suggestion failed: ${result.error.message}`);
      return;
    }
    setSuggestion(result.data.suggestion);
    setAgentRunId(result.data.agentRunId);
    setIndemnity(result.data.suggestion.indemnityAmount);
    setExpense(result.data.suggestion.expenseAmount);
  }

  async function onConfirm(useAgentValues: boolean) {
    setConfirming(true);
    setStatus(null);
    const result = await confirmReserveAction({
      claimId,
      indemnityAmount: useAgentValues
        ? (suggestion?.indemnityAmount ?? indemnity)
        : indemnity,
      expenseAmount: useAgentValues
        ? (suggestion?.expenseAmount ?? expense)
        : expense,
      ...(useAgentValues && agentRunId ? { sourceAgentRunId: agentRunId } : {}),
    });
    setConfirming(false);
    if (result.ok) {
      setStatus("Reserve confirmed and recorded.");
    } else if (result.error.code === "APPROVAL_REQUIRED") {
      setStatus(result.error.message);
    } else {
      setStatus(`Confirm failed: ${result.error.message}`);
    }
  }

  return (
    <Card data-testid="reserve-workbench" className="space-y-4">
      <CardHeader className="mb-0">
        <CardTitle>Reserve suggestion (AGT-RESERVE)</CardTitle>
        <p className="text-sm text-text-muted">
          {hasPriorReserve
            ? "A reserve is already set. Confirming a materially different amount routes to supervision."
            : "No reserve set yet. Generate a suggestion, then confirm — nothing is set automatically."}
        </p>
      </CardHeader>

      <Button
        onClick={onSuggest}
        disabled={suggesting}
        data-testid="reserve-suggest"
      >
        {suggesting ? "Generating…" : "Generate suggestion"}
      </Button>

      {suggestion ? (
        <AgentProposalCard
          title="Suggested reserve"
          summary={suggestion.rationale}
          confidencePercent={Math.round(suggestion.confidence * 100)}
          reasonCodes={[`rule-audit:${suggestion.ruleAuditId.slice(0, 8)}`]}
          onAccept={() => onConfirm(true)}
          onOverride={() => onConfirm(false)}
          disabled={confirming}
        />
      ) : null}

      {suggestion?.comparables.length ? (
        <div className="text-sm">
          <p className="font-medium">Comparable claims</p>
          <ul className="mt-1 space-y-1">
            {suggestion.comparables.map((peer) => (
              <li key={peer.claimNumber} className="flex justify-between gap-2">
                <span className="font-mono">{peer.claimNumber}</span>
                <span className="font-mono">{peer.indemnityAmount}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="reserve-indemnity" className="text-xs font-medium">
            Indemnity amount
          </label>
          <input
            id="reserve-indemnity"
            inputMode="decimal"
            value={indemnity}
            onChange={(event) => setIndemnity(event.target.value)}
            placeholder="0.00"
            className="h-9 rounded-md border border-border bg-surface px-3 font-mono text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="reserve-expense" className="text-xs font-medium">
            Expense amount
          </label>
          <input
            id="reserve-expense"
            inputMode="decimal"
            value={expense}
            onChange={(event) => setExpense(event.target.value)}
            placeholder="0.00"
            className="h-9 rounded-md border border-border bg-surface px-3 font-mono text-sm"
          />
        </div>
        <Button
          onClick={() => onConfirm(false)}
          disabled={confirming || indemnity.trim() === "" || expense.trim() === ""}
          data-testid="reserve-confirm"
        >
          {confirming ? "Confirming…" : "Confirm reserve"}
        </Button>
      </div>

      <p aria-live="polite" data-testid="reserve-status" className="text-sm text-text-muted">
        {status}
      </p>
    </Card>
  );
}
