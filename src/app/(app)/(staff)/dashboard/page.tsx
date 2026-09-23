import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  getClaimsByState,
  getCycleTimeByLob,
  getFraudBandDistribution,
  getOverrideRatesByAgent,
  getQueueBacklog,
  getSlaBreachCounts,
  getStpRate,
} from "@/lib/db/queries/kpi";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Shield,
  TrendingUp,
} from "lucide-react";

export default async function DashboardPage() {
  // AC-018-02: supervisor+ only
  await requireRole("supervisor", "admin");

  const db = getDb();

  // Fetch all KPI data in parallel
  const [
    claimsByState,
    cycleTimeByLob,
    stpRate,
    slaBreaches,
    overrideRates,
    fraudDistribution,
    queueBacklog,
  ] = await Promise.all([
    getClaimsByState(db),
    getCycleTimeByLob(db),
    getStpRate(db),
    getSlaBreachCounts(db),
    getOverrideRatesByAgent(db),
    getFraudBandDistribution(db),
    getQueueBacklog(db),
  ]);

  // Calculate summary KPIs
  const totalOpen =
    claimsByState.find((s) => s.status === "draft")?.claim_count ?? 0;
  const totalInAssessment =
    claimsByState.find((s) => s.status === "in_assessment")?.claim_count ?? 0;
  const totalInSettlement =
    claimsByState.find((s) => s.status === "in_settlement")?.claim_count ?? 0;

  const avgCycleTime =
    cycleTimeByLob.reduce((sum, lob) => sum + lob.avg_cycle_time_ms, 0) /
      cycleTimeByLob.length || 0;

  const totalBreaches =
    slaBreaches.find((b) => b.status === "TOTAL")?.total_breaches ?? 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Operations Dashboard
          </h1>
          <p className="text-muted-foreground">
            Operational health and performance metrics
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Open Claims by State
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold">{totalOpen}</div>
                <div className="text-sm text-muted-foreground">draft</div>
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold">{totalInAssessment}</div>
                <div className="text-sm text-muted-foreground">
                  in assessment
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold">{totalInSettlement}</div>
                <div className="text-sm text-muted-foreground">
                  in settlement
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Cycle Time
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(avgCycleTime / 1000 / 60 / 60)} hrs
            </div>
            <p className="text-xs text-muted-foreground">
              Reported to closed/paid/denied
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">STP Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stpRate?.stp_rate_pct?.toFixed(1) ?? "0.0"}%
            </div>
            <p className="text-xs text-muted-foreground">
              {stpRate?.stp_claims ?? 0} / {stpRate?.total_closed_claims ?? 0}{" "}
              straight-through
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SLA Breaches</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBreaches}</div>
            <p className="text-xs text-muted-foreground">
              Total across all timers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Cycle Time by LOB
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cycleTimeByLob.map((lob) => (
                <div key={lob.lob} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{lob.lob}</span>
                    <span className="text-muted-foreground">
                      {Math.round(lob.avg_cycle_time_ms / 1000 / 60 / 60)} hrs
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.min(
                          (lob.avg_cycle_time_ms / avgCycleTime) * 100,
                          100
                        )}%`,
                      }}
                      aria-label={`${lob.lob}: ${Math.round(lob.avg_cycle_time_ms / 1000 / 60 / 60)} hours cycle time`}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {lob.closed_claims} closed claims
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Fraud Band Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {fraudDistribution.map((fraud) => (
                <div key={fraud.band} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{fraud.band}</span>
                    <span className="text-muted-foreground">
                      {fraud.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full ${
                        fraud.band === "low"
                          ? "bg-green-500"
                          : fraud.band === "medium"
                            ? "bg-yellow-500"
                            : fraud.band === "high"
                              ? "bg-orange-500"
                              : "bg-red-500"
                      }`}
                      style={{ width: `${fraud.percentage}%` }}
                      aria-label={`${fraud.band}: ${fraud.percentage.toFixed(1)}% of claims`}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fraud.claim_count} claims
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Agent Override Rates
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overrideRates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No override data available
              </p>
            ) : (
              <div className="space-y-3">
                {overrideRates.slice(0, 10).map((agent) => (
                  <div key={agent.agent_id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">
                        {agent.agent_id.substring(0, 8)}
                      </span>
                      <span className="text-muted-foreground">
                        {agent.override_rate_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${agent.override_rate_pct}%` }}
                        aria-label={`Agent ${agent.agent_id}: ${agent.override_rate_pct.toFixed(1)}% override rate`}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {agent.override_count} / {agent.total_evaluations}{" "}
                      evaluations
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              SLA Breaches by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {slaBreaches
                .filter((b) => b.status !== "TOTAL")
                .map((breach) => (
                  <div
                    key={breach.status}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{breach.status}</div>
                      <div className="text-sm text-muted-foreground">
                        {breach.timers_with_breaches} timers affected
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-destructive">
                        {breach.total_breaches}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        breaches
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Backlog Table */}
      <Card>
        <CardHeader>
          <CardTitle>Queue Backlog</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left font-medium">Queue</th>
                  <th className="p-2 text-right font-medium">Open Tasks</th>
                  <th className="p-2 text-right font-medium">Avg Age</th>
                  <th className="p-2 text-right font-medium">
                    Highest Priority
                  </th>
                </tr>
              </thead>
              <tbody>
                {queueBacklog.map((queue) => (
                  <tr key={queue.queue} className="border-b last:border-0">
                    <td className="p-2 font-medium">{queue.queue}</td>
                    <td className="p-2 text-right">{queue.open_tasks}</td>
                    <td className="p-2 text-right text-muted-foreground">
                      {Math.round(queue.avg_age_ms / 1000 / 60)} min
                    </td>
                    <td className="p-2 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          queue.highest_priority === 1
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            : queue.highest_priority === 2
                              ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        }`}
                      >
                        P{queue.highest_priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
