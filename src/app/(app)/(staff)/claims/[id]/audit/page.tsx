import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getClaimAuditChain } from "@/lib/db/queries/kpi";
import { getWorkbenchClaim } from "@/lib/db/queries/workbench";
import { ExportAuditCsvButton } from "./_components/export-audit-csv-button";
import { AuditEventCard } from "./_components/audit-event-card";

export default async function ClaimAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("adjuster", "supervisor", "admin", "siu_analyst");

  const { id } = await params;
  const db = getDb();

  const workbench = await getWorkbenchClaim(db, user, id);
  if (!workbench) {
    notFound();
  }

  const auditChain = await getClaimAuditChain(db, id);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/claims/${id}`}>
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4" />
              Back to Claim
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Audit Trail</h1>
            <p className="text-muted-foreground">
              Claim {workbench.claim.claimNumber} — Complete decision chain
            </p>
          </div>
        </div>
        <ExportAuditCsvButton claimId={id} claimNumber={workbench.claim.claimNumber} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Decision Chain ({auditChain.length} events)</CardTitle>
        </CardHeader>
        <CardContent>
          {auditChain.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No audit events recorded for this claim yet.
            </p>
          ) : (
            <div className="space-y-4">
              {auditChain.map((event, index) => (
                <AuditEventCard
                  key={event.event_id}
                  event={event}
                  index={index}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
