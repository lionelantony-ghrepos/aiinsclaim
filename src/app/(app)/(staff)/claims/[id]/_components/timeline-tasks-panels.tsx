"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskCard } from "@/components/task-card";

export type TimelineEntry = {
  id: string;
  at: Date;
  kind: "state" | "task" | "agent" | "reserve" | "payment" | "rule";
  title: string;
  detail: string;
  /** Optional link for drill-down (e.g. agent run detail, rule audit) */
  href?: string;
};

const KIND_TONE = {
  state: "info",
  task: "default",
  agent: "warning",
  reserve: "success",
  payment: "success",
  rule: "info",
} as const;

type KindFilter = "all" | "state" | "task" | "agent" | "reserve" | "payment" | "rule";

const FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "state", label: "State" },
  { value: "rule", label: "Rule" },
  { value: "agent", label: "Agent" },
  { value: "task", label: "Task" },
  { value: "reserve", label: "Reserve" },
  { value: "payment", label: "Payment" },
];

export function TimelinePanel({ entries }: { entries: TimelineEntry[] }) {
  const [filter, setFilter] = useState<KindFilter>("all");

  const filtered =
    filter === "all" ? entries : entries.filter((e) => e.kind === filter);

  return (
    <Card data-testid="workbench-timeline" className="space-y-3">
      <CardHeader className="mb-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Timeline ({entries.length})</CardTitle>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Filter timeline by kind"
        >
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(opt.value)}
              data-testid={`timeline-filter-${opt.value}`}
              aria-pressed={filter === opt.value}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      {filtered.length === 0 ? (
        <p className="text-sm text-text-muted">No entries for this filter.</p>
      ) : (
        <ol className="space-y-2">
          {filtered.map((entry) => (
            <li
              key={`${entry.kind}-${entry.id}`}
              data-testid="timeline-entry"
              className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm"
            >
              <Badge tone={KIND_TONE[entry.kind]}>{entry.kind}</Badge>
              <span className="font-medium">{entry.title}</span>
              <span className="text-text-muted">{entry.detail}</span>
              <span className="ml-auto font-mono text-xs text-text-muted">
                {entry.at.toISOString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export type WorkbenchTask = {
  id: string;
  type: string;
  queue: string;
  priority: number;
  status: string;
};

export function TasksPanel({ tasks }: { tasks: WorkbenchTask[] }) {
  return (
    <Card data-testid="workbench-tasks" className="space-y-3">
      <CardHeader className="mb-0">
        <CardTitle>Tasks ({tasks.length})</CardTitle>
      </CardHeader>
      {tasks.length === 0 ? (
        <p className="text-sm text-text-muted">No tasks on this claim.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                href={`/queue/${task.id}`}
                data-testid={`task-link-${task.id}`}
                className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <TaskCard
                  title={`${task.type.replaceAll("_", " ")} · ${task.status.replaceAll("_", " ")}`}
                  claimNumber={`${task.queue} queue`}
                  priorityLabel={String(task.priority)}
                  slaRemainingLabel={task.status}
                  slaTone={task.status === "done" ? "ok" : "warning"}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
