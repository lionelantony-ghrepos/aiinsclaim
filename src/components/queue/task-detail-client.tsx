"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  claimTaskAction,
  releaseTaskAction,
  resolveTaskAction,
} from "@/app/(app)/(staff)/queue/actions";
import { AgentProposalCard } from "@/components/agent-proposal-card";
import { TaskCard } from "@/components/task-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskWithClaim } from "@/lib/db/queries/tasks-queue";
import { agentProposalFromPayload } from "@/lib/ui/agent-proposal";
import { CLAIM_STATUS_LABELS } from "@/lib/ui/claim-status";
import { ResolveDialog } from "./resolve-dialog";

type TaskDetailClientProps = {
  task: TaskWithClaim;
  currentUserId: string;
};

export function TaskDetailClient({ task, currentUserId }: TaskDetailClientProps) {
  const router = useRouter();
  const [optimisticOverlay, setOptimisticOverlay] = useState<Partial<TaskWithClaim> | null>(
    null,
  );
  const optimisticTask = optimisticOverlay ? { ...task, ...optimisticOverlay } : task;
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const proposal = agentProposalFromPayload(
    optimisticTask.payloadJson,
    optimisticTask.title,
  );
  const payload = (optimisticTask.payloadJson ?? {}) as Record<string, unknown>;
  const isSettlementApproval =
    optimisticTask.type === "approve_settlement" ||
    payload.kind === "approve_settlement";
  const isDenyConfirmation = payload.kind === "deny_confirmation";
  const isSupervisionFinancial = isSettlementApproval || isDenyConfirmation;
  const isResolved =
    optimisticTask.status === "done" || optimisticTask.status === "cancelled";

  const resolveMutation = useMutation({
    mutationFn: async (input: {
      resolution: "accepted" | "overridden" | "rejected";
      resolutionReason?: string;
    }) => {
      const result = await resolveTaskAction({
        taskId: optimisticTask.id,
        resolution: input.resolution,
        resolutionReason: input.resolutionReason,
      });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onMutate: async (input) => {
      setOptimisticOverlay({
        status: "done",
        resolution: input.resolution,
        resolutionReason: input.resolutionReason ?? null,
      });
    },
    onError: (error) => {
      setOptimisticOverlay(null);
      setErrorMessage(error.message);
    },
    onSuccess: (_data, input) => {
      setStatusMessage(
        input.resolution === "accepted"
          ? isSupervisionFinancial
            ? "Supervision decision accepted."
            : "Proposal accepted."
          : input.resolution === "rejected"
            ? "Proposal rejected."
            : "Proposal overridden.",
      );
    },
    onSettled: () => {
      setOptimisticOverlay(null);
      router.refresh();
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const result = await claimTaskAction({ taskId: optimisticTask.id });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onMutate: async () => {
      setOptimisticOverlay({
        status: "in_progress",
        assignedTo: currentUserId,
      });
    },
    onError: (error) => {
      setOptimisticOverlay(null);
      setErrorMessage(error.message);
    },
    onSuccess: () => {
      setStatusMessage("Task claimed.");
    },
    onSettled: () => {
      setOptimisticOverlay(null);
      router.refresh();
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      const result = await releaseTaskAction({ taskId: optimisticTask.id });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onMutate: async () => {
      setOptimisticOverlay({
        status: "open",
        assignedTo: null,
        assignedToName: null,
      });
    },
    onError: (error) => {
      setOptimisticOverlay(null);
      setErrorMessage(error.message);
    },
    onSuccess: () => {
      setStatusMessage("Task released.");
    },
    onSettled: () => {
      setOptimisticOverlay(null);
      router.refresh();
    },
  });

  const pending =
    resolveMutation.isPending ||
    claimMutation.isPending ||
    releaseMutation.isPending;

  return (
    <div className="space-y-6" data-testid="task-detail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/queue"
            className="text-sm text-primary hover:underline"
          >
            ← Back to queue
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-text">
            {optimisticTask.title}
          </h1>
          <p className="text-sm text-text-muted">
            Task {optimisticTask.id.slice(0, 8)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isResolved && optimisticTask.status === "open" ? (
            <Button
              variant="outline"
              onClick={() => claimMutation.mutate()}
              disabled={pending}
            >
              Claim task
            </Button>
          ) : null}
          {!isResolved &&
          optimisticTask.status === "in_progress" &&
          optimisticTask.assignedTo === currentUserId ? (
            <Button
              variant="outline"
              onClick={() => releaseMutation.mutate()}
              disabled={pending}
            >
              Release task
            </Button>
          ) : null}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>
      {errorMessage ? (
        <p className="text-sm text-danger" role="alert" data-testid="task-detail-error">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <TaskCard
          title={optimisticTask.title}
          claimNumber={optimisticTask.claimNumber}
          priorityLabel={optimisticTask.priorityLabel}
          slaRemainingLabel={optimisticTask.slaRemainingLabel}
          slaTone={optimisticTask.slaTone}
        />

        <Card data-testid="claim-context-panel">
          <CardHeader>
            <CardTitle>Claim context</CardTitle>
          </CardHeader>
          <dl className="grid gap-3 px-6 pb-6 text-sm">
            <div>
              <dt className="text-text-muted">Claim number</dt>
              <dd>
                <Link
                  href={`/claims/${optimisticTask.claimId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {optimisticTask.claimNumber}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Status</dt>
              <dd>
                <Badge tone="info">
                  {CLAIM_STATUS_LABELS[optimisticTask.claimStatus]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Claim type</dt>
              <dd className="capitalize">
                {optimisticTask.claimType.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Task status</dt>
              <dd className="capitalize">
                {optimisticTask.status.replaceAll("_", " ")}
              </dd>
            </div>
            {optimisticTask.assignedToName ? (
              <div>
                <dt className="text-text-muted">Assigned to</dt>
                <dd>{optimisticTask.assignedToName}</dd>
              </div>
            ) : null}
            {optimisticTask.resolution ? (
              <div>
                <dt className="text-text-muted">Resolution</dt>
                <dd className="capitalize">{optimisticTask.resolution}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>

      {isSettlementApproval && !isResolved ? (
        <Card data-testid="settlement-approval-panel">
          <CardHeader>
            <CardTitle>Settlement approval</CardTitle>
            <p className="text-sm text-text-muted">
              Review the proposed settlement and approve or reject with a reason.
            </p>
          </CardHeader>
          <dl className="grid gap-3 px-6 pb-4 text-sm">
            <div>
              <dt className="text-text-muted">Amount</dt>
              <dd className="font-mono" data-testid="settlement-approval-amount">
                {typeof payload.amount === "string" ? payload.amount : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Settlement ID</dt>
              <dd className="font-mono text-xs">
                {typeof payload.settlementId === "string"
                  ? payload.settlementId
                  : "—"}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 px-6 pb-6">
            <Button
              onClick={() => resolveMutation.mutate({ resolution: "accepted" })}
              disabled={pending}
              data-testid="settlement-approval-accept"
            >
              Approve settlement
            </Button>
            <Button
              variant="outline"
              onClick={() => setOverrideOpen(true)}
              disabled={pending}
              data-testid="settlement-approval-reject"
            >
              Reject
            </Button>
          </div>
        </Card>
      ) : null}

      {isDenyConfirmation && !isResolved ? (
        <Card data-testid="deny-confirmation-panel">
          <CardHeader>
            <CardTitle>Denial confirmation</CardTitle>
            <p className="text-sm text-text-muted">
              Confirm or reject the proposed claim denial.
            </p>
          </CardHeader>
          <dl className="grid gap-3 px-6 pb-4 text-sm">
            <div>
              <dt className="text-text-muted">Reason code</dt>
              <dd data-testid="deny-confirmation-reason">
                {typeof payload.reasonCode === "string" ? payload.reasonCode : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Note</dt>
              <dd data-testid="deny-confirmation-note">
                {typeof payload.note === "string" ? payload.note : "—"}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 px-6 pb-6">
            <Button
              onClick={() => resolveMutation.mutate({ resolution: "accepted" })}
              disabled={pending}
              data-testid="deny-confirmation-accept"
            >
              Confirm denial
            </Button>
            <Button
              variant="outline"
              onClick={() => setOverrideOpen(true)}
              disabled={pending}
              data-testid="deny-confirmation-reject"
            >
              Reject
            </Button>
          </div>
        </Card>
      ) : null}

      {proposal && !isResolved && !isSupervisionFinancial ? (
        <AgentProposalCard
          title={proposal.title}
          summary={proposal.summary}
          confidencePercent={proposal.confidencePercent}
          reasonCodes={proposal.reasonCodes}
          onAccept={() =>
            resolveMutation.mutate({ resolution: "accepted" })
          }
          onOverride={() => setOverrideOpen(true)}
          disabled={pending}
        />
      ) : null}

      {isResolved && optimisticTask.resolution ? (
        <Card data-testid="task-resolution-summary">
          <CardHeader>
            <CardTitle>Resolved</CardTitle>
            <p className="text-sm text-text-muted capitalize">
              {optimisticTask.resolution}
              {optimisticTask.resolutionReason
                ? ` — ${optimisticTask.resolutionReason}`
                : ""}
            </p>
          </CardHeader>
        </Card>
      ) : null}

      <ResolveDialog
        open={overrideOpen}
        title={
          isSupervisionFinancial
            ? isDenyConfirmation
              ? "Reject denial"
              : "Reject settlement"
            : "Override agent proposal"
        }
        onClose={() => setOverrideOpen(false)}
        onSubmit={async (reason) => {
          await resolveMutation.mutateAsync({
            resolution: isSupervisionFinancial ? "rejected" : "overridden",
            resolutionReason: reason,
          });
        }}
      />
    </div>
  );
}
