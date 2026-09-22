import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateDraftButton } from "@/components/admin/create-draft-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import {
  getRuleSetByCode,
  listVersionsByRuleSet,
} from "@/lib/db/queries/rules-read";
import type { BrCodeInput } from "@/lib/schemas/rules-admin";
import type { RuleVersionStatus } from "@/lib/db/schema";

function statusTone(status: RuleVersionStatus) {
  switch (status) {
    case "active":
      return "success" as const;
    case "draft":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

export default async function RuleSetVersionsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  const ruleSet = await getRuleSetByCode(db, code);

  if (!ruleSet) {
    notFound();
  }

  const versions = await listVersionsByRuleSet(db, ruleSet.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-text-muted">
          <Link href="/rules" className="text-primary no-underline hover:underline">
            Rules
          </Link>
          {" / "}
          <span className="font-mono">{ruleSet.code}</span>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{ruleSet.name}</h1>
        <p className="text-sm text-text-muted">
          Hit policy: <span className="font-mono">{ruleSet.hitPolicy}</span>
        </p>
      </header>

      <div data-testid="rules-versions-list" className="space-y-3">
        {versions.map((version) => (
          <Card
            key={version.id}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="space-y-1">
              <Link
                href={`/rules/${code}/versions/${version.id}`}
                className="text-sm font-semibold text-primary no-underline hover:underline"
              >
                Version {version.version}
              </Link>
              <p className="text-xs text-text-muted">
                Effective {version.effectiveFrom}
                {version.effectiveTo ? ` → ${version.effectiveTo}` : ""}
              </p>
              {version.changeNote ? (
                <p className="text-xs text-text-muted">{version.changeNote}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(version.status)}>{version.status}</Badge>
              {version.status === "active" ? (
                <CreateDraftButton
                  ruleSetCode={code as BrCodeInput}
                  fromVersionId={version.id}
                />
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
