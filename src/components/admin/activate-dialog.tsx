"use client";

import { useRef, useState } from "react";
import { activateVersionFormAction } from "@/app/(app)/(admin)/rules/actions";
import { Button } from "@/components/ui/button";

export function ActivateDialog({ versionId }: { versionId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );

  return (
    <>
      <Button
        type="button"
        data-testid="activate-btn"
        onClick={() => dialogRef.current?.showModal()}
      >
        Activate
      </Button>

      <dialog
        ref={dialogRef}
        data-testid="activate-dialog"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-lg backdrop:bg-black/40"
        aria-label="Activate rule version"
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Activate version
            </h2>
            <p className="text-sm text-text-muted">
              Retires the current active version effective on the chosen date.
            </p>
          </div>

          <form action={activateVersionFormAction} className="space-y-4">
            <input type="hidden" name="versionId" value={versionId} />

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-text">Change note</span>
              <textarea
                name="changeNote"
                required
                minLength={10}
                defaultValue=""
                className="min-h-24 w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-text">Effective from</span>
              <input
                type="date"
                name="effectiveFrom"
                required
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            </label>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => dialogRef.current?.close()}
              >
                Cancel
              </Button>
              <Button type="submit">Confirm activation</Button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
