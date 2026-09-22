import { AgentProposalCard } from "@/components/agent-proposal-card";
import { ClaimStatusTimeline } from "@/components/claim-status-timeline";
import { DecisionTableGrid } from "@/components/decision-table-grid";
import { FraudBandBadge } from "@/components/fraud-band-badge";
import { SlaCountdown } from "@/components/sla-countdown";
import { TaskCard } from "@/components/task-card";

export default function ComponentsLabPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Component lab</h1>
        <p className="text-text-muted">
          Signature Ledger stubs with typed mock props. No live claim data.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-xl font-semibold">
          Claim status timeline
        </h2>
        <ClaimStatusTimeline
          steps={[
            {
              id: "draft",
              label: "Draft",
              status: "draft",
              state: "complete",
            },
            {
              id: "triage",
              label: "Triage",
              status: "in_triage",
              state: "complete",
            },
            {
              id: "assessment",
              label: "Assessment",
              status: "in_assessment",
              state: "current",
            },
            {
              id: "settlement",
              label: "Settlement",
              status: "in_settlement",
              state: "upcoming",
            },
            {
              id: "paid",
              label: "Paid",
              status: "paid",
              state: "upcoming",
            },
          ]}
        />
      </section>

      <section className="space-y-3" aria-labelledby="task-heading">
        <h2 id="task-heading" className="text-xl font-semibold">
          Task card
        </h2>
        <TaskCard
          title="Review extraction for windshield claim"
          claimNumber="CLM-2026-000042"
          priorityLabel="High"
          slaRemainingLabel="2h 15m"
          slaTone="warning"
        />
      </section>

      <section className="space-y-3" aria-labelledby="proposal-heading">
        <h2 id="proposal-heading" className="text-xl font-semibold">
          Agent proposal card
        </h2>
        <AgentProposalCard
          title="Reserve suggestion"
          summary="AGT-RESERVE proposes an indemnity reserve based on extracted estimate lines."
          confidencePercent={82}
          reasonCodes={["DOC-ESTIMATE", "COV-COLLISION"]}
        />
      </section>

      <section className="space-y-3" aria-labelledby="fraud-heading">
        <h2 id="fraud-heading" className="text-xl font-semibold">
          Fraud band badge
        </h2>
        <div className="flex flex-wrap gap-2">
          <FraudBandBadge band="low" testId="fraud-band-badge" />
          <FraudBandBadge band="medium" />
          <FraudBandBadge band="high" />
          <FraudBandBadge band="critical" />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="sla-heading">
        <h2 id="sla-heading" className="text-xl font-semibold">
          SLA countdown
        </h2>
        <div className="flex flex-wrap gap-2">
          <SlaCountdown
            remainingLabel="6h remaining"
            status="running"
            elapsedRatio={0.4}
            testId="sla-countdown"
          />
          <SlaCountdown
            remainingLabel="45m remaining"
            status="running"
            elapsedRatio={0.8}
          />
          <SlaCountdown
            remainingLabel="Overdue 20m"
            status="breached"
            elapsedRatio={1.1}
          />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="grid-heading">
        <h2 id="grid-heading" className="text-xl font-semibold">
          Decision table grid
        </h2>
        <DecisionTableGrid
          caption="Mock BR-TRIAGE-001 rows for layout only"
          columns={["When severity", "When LOB", "Then route", "Then queue"]}
          rows={[
            ["low", "auto", "green_lane", "intake"],
            ["high", "property", "supervisor", "supervision"],
          ]}
        />
      </section>
    </div>
  );
}
