"use client";

import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DENIAL_REASON_CODES } from "@/lib/schemas/denial";
import { computeSettlementTotal } from "@/lib/settlement-math";
import {
  approveSettlementAction,
  closeClaimAction,
  denyClaimAction,
  issuePaymentAction,
  proposeSettlementAction,
} from "../actions";

export type SettlementItemInput = {
  id: string;
  description: string;
  assessedAmount: string | null;
};

export type SettlementRow = {
  id: string;
  status: string;
  totalAmount: string;
  deductibleApplied: string;
  note: string | null;
};

export type PaymentRow = {
  id: string;
  amount: string;
  method: string;
  status: string;
  reference: string | null;
};

export function SettlementWorkbench({
  claimId,
  claimStatus,
  items,
  deductibleDefault,
  settlements,
  payments,
  openTaskCount,
  denialReasonCodes,
}: {
  claimId: string;
  claimStatus: string;
  items: SettlementItemInput[];
  deductibleDefault: string;
  settlements: SettlementRow[];
  payments: PaymentRow[];
  openTaskCount: number;
  denialReasonCodes: string[];
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((item) => [item.id, item.assessedAmount ?? "0.00"]),
    ),
  );
  const [deductible, setDeductible] = useState(deductibleDefault);
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ach_mock" | "check_mock">(
    "ach_mock",
  );
  const [denyCode, setDenyCode] = useState(
    denialReasonCodes[0] ?? DENIAL_REASON_CODES[0],
  );
  const [denyNote, setDenyNote] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [siuHold, setSiuHold] = useState(false);
  const [pending, setPending] = useState(false);

  const latestSettlement = settlements[0] ?? null;
  const latestPayment = payments[0] ?? null;
  const inSettlement = claimStatus === "in_settlement";
  const isApproved = claimStatus === "approved";
  const isPaid = claimStatus === "paid";

  const breakdownTotal = useMemo(
    () =>
      computeSettlementTotal(
        Object.values(amounts).map((amount) => ({ amount })),
        deductible,
      ),
    [amounts, deductible],
  );

  async function onPropose() {
    setPending(true);
    setStatus(null);
    setSiuHold(false);
    const result = await proposeSettlementAction({
      claimId,
      items: Object.entries(amounts).map(([claimItemId, amount]) => ({
        claimItemId,
        amount,
      })),
      deductibleApplied: deductible,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setPending(false);
    if (result.ok) {
      setStatus(`Settlement proposed (${result.data.totalAmount}).`);
    } else {
      setStatus(`Propose failed: ${result.error.message}`);
    }
  }

  async function onApprove() {
    if (!latestSettlement) {
      setStatus("Propose a settlement before approving.");
      return;
    }
    setPending(true);
    setStatus(null);
    setSiuHold(false);
    const result = await approveSettlementAction({
      claimId,
      settlementId: latestSettlement.id,
    });
    setPending(false);
    if (!result.ok) {
      if (result.error.code === "SIU_HOLD") {
        setSiuHold(true);
        setStatus(result.error.message);
      } else {
        setStatus(`Approve failed: ${result.error.message}`);
      }
      return;
    }
    if (result.data.decision === "routed") {
      setStatus(result.data.message);
    } else {
      setStatus("Settlement approved.");
    }
  }

  async function onIssuePayment() {
    if (!latestSettlement) {
      setStatus("No settlement to pay.");
      return;
    }
    setPending(true);
    setStatus(null);
    const result = await issuePaymentAction({
      claimId,
      settlementId: latestSettlement.id,
      method: paymentMethod,
    });
    setPending(false);
    if (result.ok) {
      setStatus(`Payment issued: ${result.data.reference}`);
    } else {
      setStatus(`Payment failed: ${result.error.message}`);
    }
  }

  async function onClose() {
    setPending(true);
    setStatus(null);
    const result = await closeClaimAction({ claimId });
    setPending(false);
    if (result.ok) {
      setStatus("Claim closed.");
    } else {
      setStatus(`Close failed: ${result.error.message}`);
    }
  }

  async function onDeny() {
    setPending(true);
    setStatus(null);
    const result = await denyClaimAction({
      claimId,
      reasonCode: denyCode as (typeof DENIAL_REASON_CODES)[number],
      note: denyNote,
    });
    setPending(false);
    if (result.ok) {
      setDenyOpen(false);
      setStatus("Denial submitted for supervisor confirmation.");
    } else {
      setStatus(`Denial failed: ${result.error.message}`);
    }
  }

  return (
    <div className="space-y-4" data-testid="settlement-workbench">
      {siuHold ? (
        <div
          role="alert"
          data-testid="siu-hold-banner"
          className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">SIU hold</p>
            <p>{status ?? "Settlement approval blocked while SIU hold is active."}</p>
          </div>
        </div>
      ) : null}

      <Card className="space-y-4">
        <CardHeader className="mb-0">
          <CardTitle>Settlement proposal</CardTitle>
          <p className="text-sm text-text-muted">
            Item amounts minus deductible. Approve evaluates BR-AUTH-001.
          </p>
        </CardHeader>

        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-end gap-3">
              <div className="min-w-40 flex-1">
                <label
                  htmlFor={`settle-item-${item.id}`}
                  className="text-xs font-medium text-text-muted"
                >
                  {item.description}
                </label>
                <input
                  id={`settle-item-${item.id}`}
                  inputMode="decimal"
                  value={amounts[item.id] ?? "0.00"}
                  onChange={(event) =>
                    setAmounts((prev) => ({
                      ...prev,
                      [item.id]: event.target.value,
                    }))
                  }
                  disabled={!inSettlement || pending}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 font-mono text-sm"
                  data-testid={`settle-item-amount-${item.id}`}
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="settle-deductible" className="text-xs font-medium">
              Deductible applied
            </label>
            <input
              id="settle-deductible"
              inputMode="decimal"
              value={deductible}
              onChange={(event) => setDeductible(event.target.value)}
              disabled={!inSettlement || pending}
              className="mt-1 h-9 rounded-md border border-border bg-surface px-3 font-mono text-sm"
              data-testid="settle-deductible"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">Breakdown total</p>
            <p className="mt-1 font-mono text-sm" data-testid="settle-breakdown-total">
              {breakdownTotal}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="settle-note" className="text-xs font-medium">
            Note (optional)
          </label>
          <textarea
            id="settle-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={!inSettlement || pending}
            className="mt-1 min-h-16 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            data-testid="settle-note"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void onPropose()}
            disabled={!inSettlement || pending || items.length === 0}
            data-testid="settle-propose"
          >
            Propose settlement
          </Button>
          <Button
            variant="outline"
            onClick={() => void onApprove()}
            disabled={!inSettlement || pending || !latestSettlement}
            data-testid="settle-approve"
          >
            Approve settlement
          </Button>
          <Button
            variant="outline"
            onClick={() => setDenyOpen(true)}
            disabled={pending || claimStatus === "denied" || claimStatus === "closed"}
            data-testid="settle-deny-open"
          >
            Deny claim
          </Button>
        </div>

        {latestSettlement ? (
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-text-muted">Latest settlement</dt>
              <dd className="font-mono" data-testid="settle-latest-total">
                {latestSettlement.totalAmount}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Status</dt>
              <dd data-testid="settle-latest-status">
                <Badge tone="info">
                  <span className="inline-flex items-center gap-1">
                    {latestSettlement.status === "approved" ? (
                      <CheckCircle2 aria-hidden className="size-3" />
                    ) : (
                      <CircleDashed aria-hidden className="size-3" />
                    )}
                    {latestSettlement.status.replaceAll("_", " ")}
                  </span>
                </Badge>
              </dd>
            </div>
          </dl>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <CardHeader className="mb-0">
          <CardTitle>Payment (mock)</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="payment-method" className="text-xs font-medium">
              Method
            </label>
            <select
              id="payment-method"
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(event.target.value as "ach_mock" | "check_mock")
              }
              disabled={!isApproved || pending}
              className="mt-1 h-9 rounded-md border border-border bg-surface px-3 text-sm"
              data-testid="payment-method"
            >
              <option value="ach_mock">ACH (mock)</option>
              <option value="check_mock">Check (mock)</option>
            </select>
          </div>
          <Button
            onClick={() => void onIssuePayment()}
            disabled={!isApproved || pending || !latestSettlement}
            data-testid="payment-issue"
          >
            Issue payment
          </Button>
        </div>
        {latestPayment ? (
          <p className="text-sm" data-testid="payment-latest">
            <span className="text-text-muted">Last payment: </span>
            <span className="font-mono">{latestPayment.reference ?? latestPayment.id}</span>
            {" · "}
            <span className="font-mono">{latestPayment.amount}</span>
          </p>
        ) : null}
      </Card>

      <Card className="space-y-3" data-testid="closure-checklist">
        <CardHeader className="mb-0">
          <CardTitle>Closure checklist</CardTitle>
          <p className="text-sm text-text-muted">
            Open tasks must be zero before closing a paid claim.
          </p>
        </CardHeader>
        <p className="text-sm" data-testid="closure-open-tasks">
          {openTaskCount === 0 ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 aria-hidden className="size-4" />
              No open tasks
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-warning">
              <CircleDashed aria-hidden className="size-4" />
              {openTaskCount} open task{openTaskCount === 1 ? "" : "s"}
            </span>
          )}
        </p>
        <Button
          onClick={() => void onClose()}
          disabled={!isPaid || pending}
          data-testid="claim-close"
        >
          Close claim
        </Button>
      </Card>

      {denyOpen ? (
        <dialog
          open
          className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-lg"
          data-testid="deny-dialog"
          aria-labelledby="deny-dialog-title"
        >
          <h2 id="deny-dialog-title" className="text-lg font-semibold">
            Deny claim
          </h2>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="deny-reason" className="text-xs font-medium">
                Reason code
              </label>
              <select
                id="deny-reason"
                value={denyCode}
                onChange={(event) => setDenyCode(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                data-testid="deny-reason-code"
              >
                {denialReasonCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="deny-note" className="text-xs font-medium">
                Note (min 10 characters)
              </label>
              <textarea
                id="deny-note"
                value={denyNote}
                onChange={(event) => setDenyNote(event.target.value)}
                className="mt-1 min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                data-testid="deny-note"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDenyOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void onDeny()}
                disabled={pending || denyNote.trim().length < 10}
                data-testid="deny-submit"
              >
                Submit denial
              </Button>
            </div>
          </div>
        </dialog>
      ) : null}

      <p className="sr-only" aria-live="polite" data-testid="settle-status-sr">
        {status}
      </p>
      {status && !siuHold ? (
        <p className="text-sm text-text-muted" data-testid="settle-status" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
