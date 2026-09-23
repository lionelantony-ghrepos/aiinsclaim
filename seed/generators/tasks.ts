import type { Db } from "@/lib/db/client";
import { agentRuns, slaTimers, tasks } from "@/lib/db/schema";
import { deterministicId } from "../lib/deterministic-id";
import type { SeedUser } from "./users";

type SeedClaimRef = {
  id: string;
  claimNumber: string;
  claimType: string;
  status: string;
};

export async function seedQueueTasks(
  db: Db,
  seedClaims: SeedClaimRef[],
  seedUsers: SeedUser[],
) {
  const openClaims = seedClaims.filter((claim) => claim.status !== "draft");
  if (openClaims.length === 0) {
    return 0;
  }

  const adjusterId = seedUsers.find((user) => user.role === "adjuster")?.id;
  const now = new Date("2026-06-15T12:00:00Z");

  const taskSpecs = [
    {
      id: deterministicId("queue-task", 0),
      claimIndex: 0,
      type: "review_triage" as const,
      queue: "adjusting" as const,
      priority: 5,
      dueHours: 2,
      slaStatus: "running" as const,
      payload: {
        agentRunId: deterministicId("queue-agent-run", 0),
        title: "Triage route proposal",
        summary: "Agent recommends standard assessment route.",
        confidencePercent: 82,
        reasonCodes: ["SEVERITY-MED", "POLICY-ACTIVE"],
      },
      withAgentRun: true,
    },
    {
      id: deterministicId("queue-task", 1),
      claimIndex: 1,
      type: "assess_claim" as const,
      queue: "adjusting" as const,
      priority: 3,
      dueHours: 8,
      slaStatus: "running" as const,
      payload: { note: "Assessment pending" },
      withAgentRun: false,
    },
    {
      id: deterministicId("queue-task", 2),
      claimIndex: 2,
      type: "review_fraud" as const,
      queue: "adjusting" as const,
      priority: 4,
      dueHours: 4,
      slaStatus: "running" as const,
      payload: {
        agentRunId: deterministicId("queue-agent-run", 1),
        title: "Fraud score review",
        summary: "Medium fraud band — confirm before reserve increase.",
        confidencePercent: 68,
        reasonCodes: ["FRAUD-MED"],
      },
      withAgentRun: true,
    },
    {
      id: deterministicId("queue-task", 3),
      claimIndex: 3,
      type: "escalation" as const,
      queue: "supervision" as const,
      priority: 5,
      dueHours: -1,
      slaStatus: "breached" as const,
      payload: { reason: "supervisor_route" },
      withAgentRun: false,
    },
    {
      id: deterministicId("queue-task", 4),
      claimIndex: 4,
      type: "verify_extraction" as const,
      queue: "intake" as const,
      priority: 2,
      dueHours: 24,
      slaStatus: "running" as const,
      payload: { docType: "invoice" },
      withAgentRun: false,
    },
    {
      id: deterministicId("queue-task", 5),
      claimIndex: 5,
      type: "siu_review" as const,
      queue: "siu" as const,
      priority: 5,
      dueHours: 6,
      slaStatus: "running" as const,
      payload: { fraudBand: "high" },
      withAgentRun: false,
    },
    {
      id: deterministicId("queue-task", 6),
      claimIndex: 6,
      type: "review_triage" as const,
      queue: "adjusting" as const,
      priority: 1,
      dueHours: 48,
      slaStatus: "running" as const,
      payload: { reason: "low_priority_review" },
      withAgentRun: false,
    },
  ];

  let created = 0;

  for (const [index, spec] of taskSpecs.entries()) {
    const claim = openClaims[spec.claimIndex % openClaims.length];
    if (!claim) continue;

    const slaId = deterministicId("queue-sla", index);
    const startedAt = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const dueAt = new Date(now.getTime() + spec.dueHours * 60 * 60 * 1000);

    await db.insert(slaTimers).values({
      id: slaId,
      claimId: claim.id,
      timerCode: "task_review",
      startedAt,
      dueAt,
      status: spec.slaStatus,
    });

    if (spec.withAgentRun && typeof spec.payload.agentRunId === "string") {
      await db.insert(agentRuns).values({
        id: spec.payload.agentRunId,
        agentId: "AGT-TRIAGE",
        claimId: claim.id,
        status: "ok",
        confidence: String((spec.payload.confidencePercent ?? 70) / 100),
        outputJson: spec.payload,
      });
    }

    await db.insert(tasks).values({
      id: spec.id,
      claimId: claim.id,
      type: spec.type,
      queue: spec.queue,
      priority: spec.priority,
      status: "open",
      assignedTo: spec.queue === "adjusting" && index === 1 ? adjusterId : null,
      payloadJson: spec.payload,
      slaTimerId: slaId,
    });

    created += 1;
  }

  return created;
}
