import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivateDialog } from "@/components/admin/activate-dialog";
import { CreateDraftButton } from "@/components/admin/create-draft-button";
import { SimulateDrawer } from "@/components/admin/simulate-drawer";
import { VersionEditor } from "@/components/admin/version-editor";
import {
  DecisionTableGrid,
  type DecisionTableStructuredRow,
} from "@/components/decision-table-grid";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db";
import { getVersionDetail } from "@/lib/db/queries/rules-read";
import type {
  BrCodeInput,
  RuleActionInput,
  RuleConditionInput,
} from "@/lib/schemas/rules-admin";
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

function toStructuredRows(
  rows: NonNullable<Awaited<ReturnType<typeof getVersionDetail>>>["rows"],
): DecisionTableStructuredRow[] {
  return rows.map((row) => ({
    label: row.label,
    order: row.order,
    conditions: row.conditions.map(({ inputKey, operator, value }) => ({
      inputKey,
      operator,
      value: value as RuleConditionInput["value"],
    })),
    actions: row.actions.map(({ actionType, params }) => ({
      actionType,
      params: params as RuleActionInput["params"],
    })),
  }));
}

export default async function RuleVersionDetailPage({
  params,
}: {
  params: Promise<{ code: string; id: string }>;
}) {
  const { code, id } = await params;
  const db = getDb();
  const detail = await getVersionDetail(db, id);

  if (!detail || detail.ruleSet.code !== code) {
    notFound();
  }

  const { version, ruleSet, rows } = detail;
  const structuredRows = toStructuredRows(rows);
  const isDraft = version.status === "draft";

  return (
    <div
      data-testid="version-detail"
      className="mx-auto max-w-5xl space-y-6"
    >
      <header className="space-y-3">
        <p className="text-sm text-text-muted">
          <Link href="/rules" className="text-primary no-underline hover:underline">
            Rules
          </Link>
          {" / "}
          <Link
            href={`/rules/${code}`}
            className="text-primary no-underline hover:underline"
          >
            {code}
          </Link>
          {" / "}
          <span>v{version.version}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {ruleSet.name} v{version.version}
          </h1>
          <Badge tone={statusTone(version.status)}>{version.status}</Badge>
        </div>
        <p className="text-sm text-text-muted">
          Effective {version.effectiveFrom}
          {version.effectiveTo ? ` → ${version.effectiveTo}` : ""}
        </p>
        {version.changeNote ? (
          <p className="text-sm text-text-muted">{version.changeNote}</p>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        {version.status === "active" ? (
          <CreateDraftButton
            ruleSetCode={code as BrCodeInput}
            fromVersionId={version.id}
          />
        ) : null}
        {isDraft ? (
          <>
            <SimulateDrawer versionId={version.id} />
            <ActivateDialog versionId={version.id} />
          </>
        ) : null}
      </div>

      {isDraft ? (
        <VersionEditor
          versionId={version.id}
          ruleSetCode={code as BrCodeInput}
          initialRows={structuredRows}
        />
      ) : (
        <DecisionTableGrid
          caption={`${ruleSet.code} v${version.version} (read-only)`}
          structuredRows={structuredRows}
          readOnly
        />
      )}
    </div>
  );
}
