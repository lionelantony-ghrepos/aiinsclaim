import { notFound } from "next/navigation";
import { FraudPanel } from "@/components/claims/fraud-panel";
import { TriageCard } from "@/components/claims/triage-card";
import { ClaimStatusTimeline } from "@/components/claim-status-timeline";
import { SlaCountdown } from "@/components/sla-countdown";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listDocumentsForUser } from "@/lib/db/queries/documents";
import { getLatestFraudScore } from "@/lib/db/queries/fraud-read";
import { getTriageSummary } from "@/lib/db/queries/triage-read";
import {
  getWorkbenchClaim,
  listClaimAgentRuns,
  listClaimHistory,
  listClaimItems,
  listClaimTasks,
  listPayments,
  listReserves,
  listSettlements,
} from "@/lib/db/queries/workbench";
import type { ClaimStatus, FraudBand, SiuDisposition } from "@/lib/db/schema";
import { getParameter } from "@/lib/rules/params";
import { getSettlementChecklist } from "@/lib/assessment/checklist";
import { evaluateCoverage } from "@/lib/coverage";
import { DENIAL_REASON_CODES } from "@/lib/schemas/denial";
import { listActiveSlaTimersForClaim, timerCodeLabel } from "@/lib/sla";
import {
  slaDisplayElapsedRatio,
  slaDisplayRemainingLabel,
} from "@/lib/ui/task-labels";
import { CoveragePanel } from "./_components/coverage-panel";
import { DocumentsPanel } from "./_components/documents-panel";
import { FinancialsPanel } from "./_components/financials-panel";
import { ItemsPanel } from "./_components/items-panel";
import {
  TasksPanel,
  TimelinePanel,
  type TimelineEntry,
} from "./_components/timeline-tasks-panels";
import { WorkbenchTabs, isWorkbenchTab } from "./_components/workbench-tabs";

const TIMELINE_STEPS: { id: string; label: string; status: ClaimStatus }[] = [
  { id: "draft", label: "Draft", status: "draft" },
  { id: "submitted", label: "Submitted", status: "submitted" },
  { id: "triage", label: "Triage", status: "in_triage" },
  { id: "assessment", label: "Assessment", status: "in_assessment" },
  { id: "settlement", label: "Settlement", status: "in_settlement" },
  { id: "approved", label: "Approved", status: "approved" },
  { id: "paid", label: "Paid", status: "paid" },
];

function timelineState(
  stepStatus: ClaimStatus,
  currentStatus: ClaimStatus,
): "complete" | "current" | "upcoming" {
  const order = TIMELINE_STEPS.map((step) => step.status);
  const currentIndex = order.indexOf(currentStatus);
  const stepIndex = order.indexOf(stepStatus);
  if (stepIndex < 0 || currentIndex < 0) {
    return "upcoming";
  }
  if (stepIndex < currentIndex) {
    return "complete";
  }
  if (stepIndex === currentIndex) {
    return "current";
  }
  return "upcoming";
}

export default async function StaffClaimDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireRole(
    "intake_agent",
    "adjuster",
    "supervisor",
    "siu_analyst",
    "admin",
  );
  const { id: claimId } = await params;
  const { tab } = await searchParams;
  const activeTab = isWorkbenchTab(tab) ? tab : "overview";
  const db = getDb();

  const workbench = await getWorkbenchClaim(db, user, claimId);
  if (!workbench) {
    notFound();
  }
  const { claim, policy } = workbench;

  const [
    triage,
    fraudScore,
    slaTimers,
    items,
    documents,
    reserves,
    claimTasks,
    history,
    agentRuns,
    checklist,
    settlements,
    paymentRows,
    denialParam,
  ] = await Promise.all([
    getTriageSummary(db, claimId),
    getLatestFraudScore(db, claimId),
    listActiveSlaTimersForClaim(db, claimId),
    listClaimItems(db, user, claimId),
    listDocumentsForUser(db, user, claimId),
    listReserves(db, user, claimId),
    listClaimTasks(db, user, claimId),
    listClaimHistory(db, user, claimId),
    listClaimAgentRuns(db, user, claimId),
    getSettlementChecklist(db, claimId),
    listSettlements(db, user, claimId),
    listPayments(db, user, claimId),
    getParameter(db, "denial.reason_codes").catch(() => ({
      valueJson: [...DENIAL_REASON_CODES],
    })),
  ]);
  const coverage = evaluateCoverage(
    {
      lineOfBusiness: claim.lineOfBusiness,
      claimType: claim.claimType,
      estimatedAmount: Number(claim.estimatedAmount ?? 0),
    },
    (policy?.coverageJson ?? {}) as Record<string, unknown>,
  );
  const denialReasonCodes = Array.isArray(denialParam.valueJson)
    ? denialParam.valueJson.filter((c): c is string => typeof c === "string")
    : [...DENIAL_REASON_CODES];
  const now = new Date();
  const warningRatioParam = await getParameter(db, "sla.esc.warning_ratio", now);
  const warningRatio = Number(warningRatioParam.valueJson);
  const signalsJson = (fraudScore?.signalsJson ?? {}) as {
    scoreBreakdown?: { points: number; reasonCode?: string }[];
    agentSignals?: {
      evidence?: { signal: string; quote: string; source: string }[];
    };
  };
  const stpBlockReason =
    typeof triage.stpAudit?.outputs.reason_code === "string" &&
    triage.stpAudit.outputs.stp_allowed === false
      ? triage.stpAudit.outputs.reason_code
      : null;

  const openTasks = claimTasks.filter(
    (task) => task.status === "open" || task.status === "in_progress",
  );
  const reserveTotal = reserves
    .filter((row) =>
      row.id ===
      reserves.find((candidate) => candidate.kind === row.kind)?.id,
    )
    .reduce((sum, row) => sum + Number(row.amount), 0);

  const timelineEntries: TimelineEntry[] = [
    ...history.map((row) => ({
      id: row.id,
      at: row.createdAt,
      kind: "state" as const,
      title: `${row.fromStatus ?? "—"} → ${row.toStatus}`,
      detail: row.reason ?? row.triggeredBy,
    })),
    ...claimTasks.map((task) => ({
      id: task.id,
      at: task.createdAt,
      kind: "task" as const,
      title: `${task.type.replaceAll("_", " ")} (${task.status})`,
      detail: `${task.queue} queue · priority ${task.priority}`,
    })),
    ...agentRuns.map((run) => ({
      id: run.id,
      at: run.createdAt,
      kind: "agent" as const,
      title: run.agentId,
      detail: `status ${run.status}${run.outcome ? ` · ${run.outcome}` : ""}`,
    })),
    ...reserves.map((row) => ({
      id: row.id,
      at: row.createdAt,
      kind: "reserve" as const,
      title: `${row.kind} reserve ${row.amount}`,
      detail: `source ${row.source.replaceAll("_", " ")}`,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          {claim.claimNumber}
        </h1>
        <p className="text-text-muted capitalize">
          {claim.claimType.replaceAll("_", " ")} · {claim.lineOfBusiness} ·{" "}
          {claim.status.replaceAll("_", " ")}
        </p>
      </header>

      <ClaimStatusTimeline
        steps={TIMELINE_STEPS.map((step) => ({
          ...step,
          state: timelineState(step.status, claim.status),
        }))}
      />

      {slaTimers.length > 0 ? (
        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-medium">Active SLA timers</h2>
          <ul className="space-y-2">
            {slaTimers.map((timer) => (
              <li
                key={timer.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm text-text-muted">
                  {timerCodeLabel(timer.timerCode)}
                </span>
                <SlaCountdown
                  remainingLabel={slaDisplayRemainingLabel(timer.dueAt, timer, now)}
                  status={timer.status}
                  elapsedRatio={slaDisplayElapsedRatio(
                    timer.startedAt,
                    timer.dueAt,
                    timer,
                    now,
                  )}
                  warningRatio={warningRatio}
                  testId={`sla-timer-${timer.id}`}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <WorkbenchTabs claimId={claim.id} active={activeTab} />

      {activeTab === "overview" ? (
        <div className="space-y-8" data-testid="workbench-overview">
          <TriageCard
            claimNumber={claim.claimNumber}
            route={claim.route}
            priority={claim.priority}
            severityScore={triage.severityScore ?? claim.severityScore}
            complexityScore={triage.complexityScore ?? claim.complexityScore}
            reasonCodes={triage.reasonCodes}
            keyRisks={triage.keyRisks}
            confidencePercent={
              triage.confidence !== null ? Math.round(triage.confidence * 100) : null
            }
            stpBlockReason={stpBlockReason}
            matchedTriageRules={triage.triageAudit?.matchedRuleIds ?? []}
          />

          {fraudScore ? (
            <FraudPanel
              claimId={claim.id}
              claimNumber={claim.claimNumber}
              band={fraudScore.band as FraudBand}
              score={fraudScore.score}
              reasonCodes={fraudScore.reasonCodes}
              scoreBreakdown={signalsJson.scoreBreakdown ?? []}
              evidence={signalsJson.agentSignals?.evidence ?? []}
              siuDisposition={(claim.siuDisposition as SiuDisposition | null) ?? null}
              siuReferred={claim.siuReferred}
              userRole={user.role}
            />
          ) : null}

          <CoveragePanel
            lineOfBusiness={claim.lineOfBusiness}
            claimType={claim.claimType}
            estimatedAmount={claim.estimatedAmount}
            coverageJson={(policy?.coverageJson ?? {}) as Record<string, unknown>}
          />

          <Card data-testid="workbench-facts" className="space-y-2">
            <CardHeader className="mb-0">
              <CardTitle>Assessment facts</CardTitle>
            </CardHeader>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-text-muted">Items</dt>
                <dd className="font-mono" data-testid="facts-items">{items.length}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Documents</dt>
                <dd className="font-mono" data-testid="facts-documents">{documents.length}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Reserve total</dt>
                <dd className="font-mono" data-testid="facts-reserve-total">
                  {reserveTotal.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Open tasks</dt>
                <dd className="font-mono" data-testid="facts-open-tasks">{openTasks.length}</dd>
              </div>
            </dl>
          </Card>
        </div>
      ) : null}

      {activeTab === "items" ? <ItemsPanel items={items} /> : null}

      {activeTab === "documents" ? <DocumentsPanel documents={documents} /> : null}

      {activeTab === "financials" ? (
        <FinancialsPanel
          claimId={claim.id}
          claimStatus={claim.status}
          reserves={reserves}
          checklist={checklist}
          settlementItems={items.map((item) => ({
            id: item.id,
            description: item.description,
            assessedAmount: item.assessedAmount,
          }))}
          deductibleDefault={coverage.deductible.toFixed(2)}
          settlements={settlements.map((row) => ({
            id: row.id,
            status: row.status,
            totalAmount: row.totalAmount,
            deductibleApplied: row.deductibleApplied,
            note: row.note,
          }))}
          payments={paymentRows.map((row) => ({
            id: row.id,
            amount: row.amount,
            method: row.method,
            status: row.status,
            reference: row.reference,
          }))}
          openTaskCount={openTasks.length}
          denialReasonCodes={denialReasonCodes}
        />
      ) : null}

      {activeTab === "timeline" ? <TimelinePanel entries={timelineEntries} /> : null}

      {activeTab === "tasks" ? <TasksPanel tasks={claimTasks} /> : null}
    </div>
  );
}
