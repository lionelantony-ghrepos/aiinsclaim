import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { listRuleSets } from "@/lib/db/queries/rules-read";

function versionBadgeLabel(version: number | undefined) {
  return version != null ? `v${version}` : "None";
}

export default async function RulesPage() {
  const db = getDb();
  const ruleSets = await listRuleSets(db);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Rules</h1>
        <p className="text-text-muted">
          Decision-table rule sets. Draft, simulate, and activate new versions.
        </p>
      </header>

      <div data-testid="rules-list" className="space-y-3">
        {ruleSets.map((set) => (
          <Card key={set.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <Link
                href={`/rules/${set.code}`}
                className="font-mono text-sm font-semibold text-primary no-underline hover:underline"
              >
                {set.code}
              </Link>
              <p className="text-sm text-text">{set.name}</p>
              <p className="text-xs text-text-muted">
                Hit policy: <span className="font-mono">{set.hitPolicy}</span>
              </p>
            </div>
            <Badge tone={set.activeVersion ? "success" : "default"}>
              Active {versionBadgeLabel(set.activeVersion?.version)}
            </Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
