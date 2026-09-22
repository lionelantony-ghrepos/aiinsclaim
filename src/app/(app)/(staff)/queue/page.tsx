import { redirect } from "next/navigation";
import { QueueList } from "@/components/queue/queue-list";
import {
  defaultQueueForRole,
  isStaffRole,
  queuesForRole,
} from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listQueueTasks } from "@/lib/db/queries/tasks-queue";
import { resolveParameterValue } from "@/lib/rules/params";

export default async function QueuePage() {
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) {
    redirect("/login");
  }

  const defaultQueue = defaultQueueForRole(user.role);
  if (!defaultQueue) {
    redirect("/");
  }

  const db = getDb();
  const [{ items, nextCursor }, pollValue] = await Promise.all([
    listQueueTasks(db, defaultQueue, {}, undefined, 25, user.role),
    resolveParameterValue(db, "ui.queue_poll_seconds"),
  ]);

  if (typeof pollValue !== "number" || !Number.isFinite(pollValue)) {
    throw new Error("Parameter ui.queue_poll_seconds must be a number");
  }
  const pollSeconds = pollValue;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Work queue
        </h1>
        <p className="text-sm text-text-muted">
          Prioritized tasks with agent proposals — accept or override with audit.
        </p>
      </header>

      <QueueList
        initialQueue={defaultQueue}
        permittedQueues={queuesForRole(user.role)}
        initialItems={items}
        initialCursor={nextCursor}
        pollSeconds={pollSeconds}
        canBulkReassign={user.role === "supervisor" || user.role === "admin"}
        currentUserId={user.id}
      />
    </div>
  );
}
