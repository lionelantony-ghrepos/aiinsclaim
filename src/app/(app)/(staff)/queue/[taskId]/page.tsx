import { notFound, redirect } from "next/navigation";
import { TaskDetailClient } from "@/components/queue/task-detail-client";
import { isStaffRole } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getTaskWithClaim } from "@/lib/db/queries/tasks-queue";

type PageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function TaskDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) {
    redirect("/login");
  }

  const { taskId } = await params;
  const db = getDb();
  const result = await getTaskWithClaim(db, taskId, user.role);

  if (!result) {
    notFound();
  }

  if ("forbidden" in result && result.forbidden) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <TaskDetailClient task={result.task} currentUserId={user.id} />
    </div>
  );
}
