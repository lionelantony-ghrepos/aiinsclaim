import { Card } from "@/components/ui/card";
import { RunSlaSweepButton } from "@/components/admin/run-sla-sweep-button";

export default function SlaAdminPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">SLA sweep</h1>
        <p className="text-text-muted">
          Manually run the SLA escalation sweep (same logic as the secured cron
          endpoint).
        </p>
      </header>

      <Card className="p-6">
        <RunSlaSweepButton />
      </Card>
    </div>
  );
}
