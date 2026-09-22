"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateDraftRowsAction } from "@/app/(app)/(admin)/rules/actions";
import {
  DecisionTableGrid,
  type DecisionTableStructuredRow,
} from "@/components/decision-table-grid";
import { Button } from "@/components/ui/button";
import type { BrCodeInput } from "@/lib/schemas/rules-admin";

export function VersionEditor({
  versionId,
  ruleSetCode,
  initialRows,
}: {
  versionId: string;
  ruleSetCode: BrCodeInput;
  initialRows: DecisionTableStructuredRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-4">
      <DecisionTableGrid
        caption={`Editable rows for ${ruleSetCode}`}
        structuredRows={rows}
        onRowsChange={(next) => {
          setRows(next);
          setSaved(false);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await updateDraftRowsAction({
                versionId,
                rows: rows.map((row, index) => ({
                  ...row,
                  order: index + 1,
                })),
              });
              if (result.ok) {
                setSaved(true);
                router.refresh();
                return;
              }
              setError(result.error);
            });
          }}
        >
          {pending ? "Saving…" : "Save draft rows"}
        </Button>
        {saved ? (
          <span className="text-sm text-success" aria-live="polite">
            Draft saved
          </span>
        ) : null}
        {error ? (
          <span className="text-sm text-danger" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
