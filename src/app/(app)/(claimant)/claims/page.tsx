import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listClaimsForUser } from "@/lib/db/queries/claims";
import { FNOL_CLAIM_TYPE_LABELS } from "@/lib/intake/constants";
import type { FnolClaimType } from "@/lib/intake/constants";
import { CLAIM_STATUS_LABELS } from "@/lib/ui/claim-status";

export default async function ClaimsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "claimant") {
    notFound();
  }

  const db = getDb();
  const claims = await listClaimsForUser(db, user);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">My claims</h1>
          <p className="text-text-muted">
            View submitted claims and continue draft filings.
          </p>
        </div>
        <Link
          href="/claims/new"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          File a claim
        </Link>
      </header>

      <div data-testid="claims-list" className="space-y-3">
        {claims.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted">
              You have no claims yet. Start a new FNOL to file your first claim.
            </p>
          </Card>
        ) : (
          claims.map((claim) => {
            const claimTypeLabel =
              claim.claimType in FNOL_CLAIM_TYPE_LABELS
                ? FNOL_CLAIM_TYPE_LABELS[claim.claimType as FnolClaimType]
                : claim.claimType;
            const statusLabel = CLAIM_STATUS_LABELS[claim.status];
            const isDraft = claim.status === "draft";

            return (
              <Card
                key={claim.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-text">{claim.claimNumber}</p>
                    <Badge tone={isDraft ? "warning" : "default"}>{statusLabel}</Badge>
                  </div>
                  <p className="text-sm text-text-muted">
                    {claimTypeLabel} · {claim.lineOfBusiness}
                  </p>
                </div>
                {isDraft ? (
                  <Link
                    href={`/claims/new?claimId=${claim.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-text hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Continue draft
                  </Link>
                ) : null}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
