import type { SlaStatus, TaskType } from "@/lib/db/schema/enums";

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  verify_extraction: "Verify extraction",
  review_triage: "Review triage proposal",
  review_fraud: "Review fraud score",
  assess_claim: "Assess claim",
  approve_settlement: "Approve settlement",
  escalation: "Escalation review",
  siu_review: "SIU review",
  request_info: "Request information",
};

export function taskTypeLabel(type: TaskType): string {
  return TASK_TYPE_LABELS[type];
}

export function priorityLabel(priority: number): string {
  return String(priority);
}

export function formatSlaRemaining(dueAt: Date | null, now = new Date()): string {
  if (!dueAt) {
    return "No SLA";
  }
  const diffMs = dueAt.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const minutes = Math.round(absMs / 60_000);
  if (minutes < 60) {
    return diffMs >= 0 ? `${minutes}m left` : `${minutes}m overdue`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return diffMs >= 0 ? `${hours}h left` : `${hours}h overdue`;
  }
  const days = Math.round(hours / 24);
  return diffMs >= 0 ? `${days}d left` : `${days}d overdue`;
}

export function slaElapsedRatio(
  startedAt: Date | null,
  dueAt: Date | null,
  now = new Date(),
): number {
  if (!startedAt || !dueAt) {
    return 0;
  }
  const total = dueAt.getTime() - startedAt.getTime();
  if (total <= 0) {
    return 1;
  }
  const elapsed = now.getTime() - startedAt.getTime();
  return Math.min(1, Math.max(0, elapsed / total));
}

export function slaEffectiveNow(
  timer: { status: SlaStatus; pausedAt: Date | null },
  now = new Date(),
): Date {
  if (timer.status === "paused" && timer.pausedAt) {
    return timer.pausedAt;
  }
  return now;
}

export function slaDisplayElapsedRatio(
  startedAt: Date | null,
  dueAt: Date | null,
  timer: { status: SlaStatus; pausedAt: Date | null },
  now = new Date(),
): number {
  return slaElapsedRatio(startedAt, dueAt, slaEffectiveNow(timer, now));
}

export function slaDisplayRemainingLabel(
  dueAt: Date | null,
  timer: { status: SlaStatus; pausedAt: Date | null },
  now = new Date(),
): string {
  return formatSlaRemaining(dueAt, slaEffectiveNow(timer, now));
}
