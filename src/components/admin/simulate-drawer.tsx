"use client";

import { useRef, useState, useTransition } from "react";
import { z } from "zod";
import { simulateVersionAction } from "@/app/(app)/(admin)/rules/actions";
import { Button } from "@/components/ui/button";

export function SimulateDrawer({ versionId }: { versionId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [sampleInputs, setSampleInputs] = useState("{}");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-testid="simulate-btn"
        onClick={() => {
          setError(null);
          setResult(null);
          dialogRef.current?.showModal();
        }}
      >
        Simulate
      </Button>

      <dialog
        ref={dialogRef}
        data-testid="simulate-drawer"
        className="fixed inset-y-0 right-0 z-50 m-0 ml-auto h-full w-full max-w-lg border-l border-border bg-surface p-4 shadow-lg backdrop:bg-black/40"
        aria-label="Simulate rule version"
      >
        <div className="flex h-full flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Simulate version
            </h2>
            <p className="text-sm text-text-muted">
              Dry-run evaluation — no audit log is written.
            </p>
          </div>

          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-text">Sample inputs (JSON)</span>
            <textarea
              className="min-h-40 flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              value={sampleInputs}
              onChange={(event) => setSampleInputs(event.target.value)}
              spellCheck={false}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setResult(null);
                startTransition(async () => {
                  let parsed;
                  try {
                    parsed = z.json().parse(JSON.parse(sampleInputs));
                  } catch {
                    setError("Sample inputs must be valid JSON");
                    return;
                  }
                  const response = await simulateVersionAction({
                    versionId,
                    sampleInputs: parsed,
                  });
                  if (response.ok) {
                    setResult(JSON.stringify(response.data, null, 2));
                    return;
                  }
                  setError(response.error);
                });
              }}
            >
              {pending ? "Running…" : "Run simulation"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {result ? (
            <pre
              className="overflow-x-auto rounded-md border border-border bg-surface-raised p-3 font-mono text-xs text-text"
              aria-live="polite"
            >
              {result}
            </pre>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
