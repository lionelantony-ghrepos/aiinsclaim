"use client";

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
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const proposal = agentProposalFromPayload(task.payloadJson, task.title);
  const isResolved = task.status === "done" || task.status === "cancelled";

  async function handleAccept() {
    setPending(true);
    setErrorMessage(null);
    const result = await resolveTaskAction({
      taskId: task.id,
      resolution: "accepted",
    });
    setPending(false);
    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }
    setStatusMessage("Proposal accepted.");
    router.refresh();
  }

  async function handleOverride(reason: string) {
    setPending(true);
    setErrorMessage(null);
    const result = await resolveTaskAction({
      taskId: task.id,
      resolution: "overridden",
      resolutionReason: reason,
    });
    setPending(false);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    setStatusMessage("Proposal overridden.");
    router.refresh();
  }

  async function handleClaim() {
    const result = await claimTaskAction({ taskId: task.id });
    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }
    setStatusMessage("Task claimed.");
    router.refresh();
  }

  async function handleRelease() {
    const result = await releaseTaskAction({ taskId: task.id });
    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }
    setStatusMessage("Task released.");
    router.refresh();
  }

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
          <h1 className="mt-2 text-2xl font-semibold text-text">{task.title}</h1>
          <p className="text-sm text-text-muted">Task {task.id.slice(0, 8)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isResolved && task.status === "open" ? (
            <Button variant="outline" onClick={() => void handleClaim()}>
              Claim task
            </Button>
          ) : null}
          {!isResolved &&
          task.status === "in_progress" &&
          task.assignedTo === currentUserId ? (
            <Button variant="outline" onClick={() => void handleRelease()}>
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
          title={task.title}
          claimNumber={task.claimNumber}
          priorityLabel={task.priorityLabel}
          slaRemainingLabel={task.slaRemainingLabel}
          slaTone={task.slaTone}
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
                  href={`/claims/${task.claimId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {task.claimNumber}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Status</dt>
              <dd>
                <Badge tone="info">{CLAIM_STATUS_LABELS[task.claimStatus]}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Claim type</dt>
              <dd className="capitalize">{task.claimType.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Task status</dt>
              <dd className="capitalize">{task.status.replaceAll("_", " ")}</dd>
            </div>
            {task.assignedToName ? (
              <div>
                <dt className="text-text-muted">Assigned to</dt>
                <dd>{task.assignedToName}</dd>
              </div>
            ) : null}
            {task.resolution ? (
              <div>
                <dt className="text-text-muted">Resolution</dt>
                <dd className="capitalize">{task.resolution}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>

      {proposal && !isResolved ? (
        <AgentProposalCard
          title={proposal.title}
          summary={proposal.summary}
          confidencePercent={proposal.confidencePercent}
          reasonCodes={proposal.reasonCodes}
          onAccept={() => void handleAccept()}
          onOverride={() => setOverrideOpen(true)}
          disabled={pending}
        />
      ) : null}

      {isResolved && task.resolution ? (
        <Card data-testid="task-resolution-summary">
          <CardHeader>
            <CardTitle>Resolved</CardTitle>
            <p className="text-sm text-text-muted capitalize">
              {task.resolution}
              {task.resolutionReason ? ` — ${task.resolutionReason}` : ""}
            </p>
          </CardHeader>
        </Card>
      ) : null}

      <ResolveDialog
        open={overrideOpen}
        title="Override agent proposal"
        onClose={() => setOverrideOpen(false)}
        onSubmit={handleOverride}
      />
    </div>
  );
}
