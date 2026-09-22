import Link from "next/link";
import { FraudBandBadge } from "@/components/fraud-band-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listSiuQueueClaims } from "@/lib/db/queries/fraud-read";

export default async function SiuQueuePage() {
  await requireRole("siu_analyst", "supervisor");
  const db = getDb();
  const rows = await listSiuQueueClaims(db);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">SIU queue</h1>
        <p className="text-text-muted">
          Claims referred to SIU or scored high/critical fraud band.
        </p>
      </header>

      <Card data-testid="siu-queue-table">
        <CardHeader>
          <CardTitle>Fraud-flagged claims ({rows.length})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto px-6 pb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-text-muted">
                <th className="py-2 pr-4 font-medium">Claim</th>
                <th className="py-2 pr-4 font-medium">Band</th>
                <th className="py-2 pr-4 font-medium">Score</th>
                <th className="py-2 pr-4 font-medium">Reason codes</th>
                <th className="py-2 pr-4 font-medium">Disposition</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-text-muted">
                    No fraud-flagged claims in queue.
                  </td>
                </tr>
              ) : (
                rows.map(({ claim, fraudScore }) => (
                  <tr
                    key={claim.id}
                    className="border-b last:border-0"
                    data-testid={`siu-row-${claim.claimNumber}`}
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/claims/${claim.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {claim.claimNumber}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <FraudBandBadge band={fraudScore.band} />
                    </td>
                    <td className="py-3 pr-4">{fraudScore.score}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {fraudScore.reasonCodes.map((code) => (
                          <Badge key={code} tone="default">
                            {code}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-4 capitalize">
                      {claim.siuDisposition?.replaceAll("_", " ") ?? "open"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
