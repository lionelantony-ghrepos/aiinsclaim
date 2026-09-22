import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskCard } from "@/components/task-card";

export type TimelineEntry = {
  id: string;
  at: Date;
  kind: "state" | "task" | "agent" | "reserve";
  title: string;
  detail: string;
};

const KIND_TONE = {
  state: "info",
  task: "default",
  agent: "warning",
  reserve: "success",
} as const;

export function TimelinePanel({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Card data-testid="workbench-timeline" className="space-y-3">
      <CardHeader className="mb-0">
        <CardTitle>Timeline ({entries.length})</CardTitle>
      </CardHeader>
      {entries.length === 0 ? (
        <p className="text-sm text-text-muted">No history yet.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
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
