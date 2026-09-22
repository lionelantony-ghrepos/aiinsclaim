import { notFound } from "next/navigation";
import { FraudPanel } from "@/components/claims/fraud-panel";
import { TriageCard } from "@/components/claims/triage-card";
import { ClaimStatusTimeline } from "@/components/claim-status-timeline";
import { SlaCountdown } from "@/components/sla-countdown";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getClaimForUser } from "@/lib/db/queries/claims";
import { getLatestFraudScore } from "@/lib/db/queries/fraud-read";
import { getTriageSummary } from "@/lib/db/queries/triage-read";
import { listActiveSlaTimersForClaim, timerCodeLabel } from "@/lib/sla";
import { getParameter } from "@/lib/rules/params";
import {
  slaDisplayElapsedRatio,
  slaDisplayRemainingLabel,
} from "@/lib/ui/task-labels";
import type { ClaimStatus, FraudBand, SiuDisposition } from "@/lib/db/schema";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(
    "intake_agent",
    "adjuster",
    "supervisor",
    "siu_analyst",
    "admin",
  );
  const { id: claimId } = await params;
  const db = getDb();

  const claim = await getClaimForUser(db, user, claimId);
  if (!claim) {
    notFound();
  }

  const triage = await getTriageSummary(db, claimId);
  const fraudScore = await getLatestFraudScore(db, claimId);
  const slaTimers = await listActiveSlaTimersForClaim(db, claimId);
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
    </div>
  );
}
