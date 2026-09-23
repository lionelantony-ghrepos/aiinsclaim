"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { verifyExtractionAction } from "@/app/(app)/(staff)/verify-extraction/[taskId]/actions";

type VerifyExtractionFormProps = {
  taskId: string;
  extractionId: string;
  documentId: string;
  docType: string;
  fields: Record<string, unknown>;
  confidences: Record<string, number>;
  previewUrl: string;
  fallback?: string;
  onVerify: typeof verifyExtractionAction;
};

const inputClassName =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function VerifyExtractionForm({
  taskId,
  extractionId,
  documentId,
  docType,
  fields,
  confidences,
  previewUrl,
  fallback,
  onVerify,
}: VerifyExtractionFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        value == null ? "" : String(value),
      ]),
    ),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateField(key: string, next: string) {
    setValues((prev) => ({ ...prev, [key]: next }));
  }

  function submit(decision: "accept" | "reject") {
    startTransition(async () => {
      setMessage(null);
      const corrections: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(values)) {
        const original = fields[key];
        const originalStr = original == null ? "" : String(original);
        if (value !== originalStr) {
          corrections[key] = value;
        }
      }

      const result = await onVerify({
        taskId,
        extractionId,
        corrections: Object.keys(corrections).length > 0 ? corrections : undefined,
        decision,
      });

      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }

      setMessage(
        decision === "accept"
          ? "Extraction accepted and applied."
          : "Extraction rejected.",
      );
    });
  }

  const fieldKeys =
    Object.keys(fields).length > 0
      ? Object.keys(fields)
      : ["vendorName", "totalAmount", "reportNumber", "estimateTotal"];

  return (
    <div
      className="grid gap-6 lg:grid-cols-2"
      data-testid="verify-extraction-view"
    >
      <Card>
        <CardHeader>
          <CardTitle>Document preview</CardTitle>
          <p className="text-sm text-text-muted">
            {docType.replaceAll("_", " ")} · {documentId.slice(0, 8)}
          </p>
        </CardHeader>
        <div className="px-6 pb-6">
          <iframe
            title="Document preview"
            src={previewUrl}
            className="h-[480px] w-full rounded-md border border-border bg-surface-raised"
            data-testid="doc-preview-frame"
          />
          {fallback === "manual_entry" ? (
            <p className="mt-3 text-sm text-warning" role="status">
              Automatic extraction failed — enter fields manually.
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extracted fields</CardTitle>
          <p className="text-sm text-text-muted">
            Review and correct values before accepting.
          </p>
        </CardHeader>
        <div className="space-y-4 px-6 pb-6">
          {fieldKeys.map((key) => (
            <label key={key} className="block space-y-1 text-sm">
              <span className="font-medium text-text">
                {key.replaceAll(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                {confidences[key] != null ? (
                  <span className="ml-2 text-text-muted">
                    ({Math.round(confidences[key]! * 100)}% conf.)
                  </span>
                ) : null}
              </span>
              <input
                className={inputClassName}
                value={values[key] ?? ""}
                onChange={(event) => updateField(key, event.target.value)}
                aria-label={key}
                data-testid={`verify-field-${key}`}
              />
            </label>
          ))}

          {message ? (
            <p className="text-sm text-text-muted" role="status" aria-live="polite">
              {message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              disabled={isPending}
              onClick={() => submit("accept")}
              data-testid="verify-accept"
            >
              Accept &amp; apply
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => submit("reject")}
              data-testid="verify-reject"
            >
              Reject
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
