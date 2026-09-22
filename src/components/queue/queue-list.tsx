"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  bulkReassignAction,
  claimTaskAction,
  fetchQueueAction,
  fetchQueuePollSecondsAction,
  fetchStaffAssigneesAction,
  releaseTaskAction,
  type QueueActionResult,
} from "@/app/(app)/(staff)/queue/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskQueue } from "@/lib/db/schema/enums";
import type { QueueTaskFilters } from "@/lib/schemas/tasks";
import type { QueueTaskRow } from "@/lib/db/queries/tasks-queue";
import { BulkReassignDialog } from "./bulk-reassign-dialog";
import { QueueFilters } from "./queue-filters";

type QueueListProps = {
  initialQueue: TaskQueue;
  permittedQueues: TaskQueue[];
  initialItems: QueueTaskRow[];
  initialCursor: string | null;
  pollSeconds: number;
  canBulkReassign: boolean;
  currentUserId: string;
};

function unwrap<T>(result: QueueActionResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

const QUEUE_LABELS: Record<TaskQueue, string> = {
  intake: "Intake",
  adjusting: "Adjusting",
  supervision: "Supervision",
  siu: "SIU",
};

export function QueueList({
  initialQueue,
  permittedQueues,
  initialItems,
  initialCursor,
  pollSeconds,
  canBulkReassign,
  currentUserId,
}: QueueListProps) {
  const [queue, setQueue] = useState(initialQueue);
  const [filters, setFilters] = useState<QueueTaskFilters>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const pollQuery = useQuery({
    queryKey: ["queue-poll-seconds"],
    queryFn: async () => unwrap(await fetchQueuePollSecondsAction()).pollSeconds,
    initialData: pollSeconds,
    staleTime: pollSeconds * 1000,
  });

  const queueQuery = useQuery({
    queryKey: ["queue", queue, filters],
    queryFn: async () =>
      unwrap(
        await fetchQueueAction({
          queue,
          filters,
          limit: 25,
        }),
      ),
    initialData: { items: initialItems, nextCursor: initialCursor },
    refetchInterval: pollQuery.data * 1000,
  });

  const assigneesQuery = useQuery({
    queryKey: ["queue-assignees"],
    queryFn: async () => unwrap(await fetchStaffAssigneesAction()),
    enabled: canBulkReassign,
  });

  const items = queueQuery.data.items;

  async function handleClaim(taskId: string) {
    const result = await claimTaskAction({ taskId });
    if (!result.ok) {
      setStatusMessage(result.error.message);
      return;
    }
    setStatusMessage("Task claimed.");
    await queueQuery.refetch();
  }

  async function handleRelease(taskId: string) {
    const result = await releaseTaskAction({ taskId });
    if (!result.ok) {
      setStatusMessage(result.error.message);
      return;
    }
    setStatusMessage("Task released.");
    await queueQuery.refetch();
  }

  function toggleSelected(taskId: string) {
    setSelectedIds((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    );
  }

  return (
    <div className="space-y-4" data-testid="queue-list">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Queue tabs">
        {permittedQueues.map((tabQueue) => (
          <Button
            key={tabQueue}
            variant={tabQueue === queue ? "default" : "outline"}
            role="tab"
            aria-selected={tabQueue === queue}
            data-testid={`queue-tab-${tabQueue}`}
            onClick={() => {
              setQueue(tabQueue);
              setSelectedIds([]);
            }}
          >
            {QUEUE_LABELS[tabQueue]}
          </Button>
        ))}
      </div>

      <QueueFilters filters={filters} onChange={setFilters} />

      {canBulkReassign ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={selectedIds.length === 0}
            onClick={() => setBulkOpen(true)}
            data-testid="bulk-reassign-open"
          >
            Bulk reassign ({selectedIds.length})
          </Button>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite" data-testid="queue-status-live">
        {statusMessage}
      </p>

      <ul
        className="space-y-2"
        aria-label="Task queue items"
        data-testid="queue-items"
      >
        {items.length === 0 ? (
          <li>
            <Card>
              <CardHeader>
                <CardTitle>No open tasks in this queue.</CardTitle>
              </CardHeader>
            </Card>
          </li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              data-testid={`queue-item-${item.id}`}
              className="rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {canBulkReassign ? (
                      <input
                        type="checkbox"
                        aria-label={`Select task ${item.claimNumber}`}
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        data-testid={`queue-select-${item.id}`}
                      />
                    ) : null}
                    <Link
                      href={`/queue/${item.id}`}
                      className="font-medium text-text hover:underline"
                    >
                      {item.title}
                    </Link>
                    <span className="font-mono text-xs text-text-muted">
                      {item.claimNumber}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="default">Priority {item.priorityLabel}</Badge>
                    <Badge
                      tone={
                        item.slaTone === "ok"
                          ? "success"
                          : item.slaTone === "warning"
                            ? "warning"
                            : "danger"
                      }
                    >
                      SLA {item.slaRemainingLabel}
                    </Badge>
                    <Badge tone="info">{item.status.replaceAll("_", " ")}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === "open" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleClaim(item.id)}
                      data-testid={`queue-claim-${item.id}`}
                    >
                      Claim
                    </Button>
                  ) : null}
                  {item.status === "in_progress" && item.assignedTo === currentUserId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRelease(item.id)}
                      data-testid={`queue-release-${item.id}`}
                    >
                      Release
                    </Button>
                  ) : null}
                  <Link
                    href={`/queue/${item.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    data-testid={`queue-open-${item.id}`}
                  >
                    Open
                  </Link>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>

      {canBulkReassign ? (
        <BulkReassignDialog
          open={bulkOpen}
          selectedCount={selectedIds.length}
          assignees={assigneesQuery.data ?? []}
          onClose={() => setBulkOpen(false)}
          onSubmit={async (assignTo) => {
            const result = await bulkReassignAction({
              taskIds: selectedIds,
              assignTo,
            });
            if (!result.ok) {
              throw new Error(result.error.message);
            }
            setSelectedIds([]);
            setStatusMessage(`Reassigned ${result.data.count} tasks.`);
            await queueQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
