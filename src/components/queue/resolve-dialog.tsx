"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ResolveDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

export function ResolveDialog({
  open,
  title,
  onClose,
  onSubmit,
}: ResolveDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= 10;

  async function handleSubmit() {
    if (!valid) {
      setError("Reason must be at least 10 characters.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setReason("");
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to submit override",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-lg rounded-lg border border-border bg-surface p-4 shadow-lg backdrop:bg-bg/80"
      aria-labelledby="resolve-dialog-title"
      data-testid="resolve-dialog"
      onClose={onClose}
    >
      <div>
        <h2 id="resolve-dialog-title" className="text-lg font-semibold text-text">
          {title}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Provide a reason for overriding the agent proposal (minimum 10 characters).
        </p>
        <label className="mt-4 block text-sm text-text">
          Override reason
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "resolve-dialog-error" : undefined}
            data-testid="resolve-reason-input"
          />
        </label>
        {error ? (
          <p
            id="resolve-dialog-error"
            className="mt-2 text-sm text-danger"
            role="alert"
            data-testid="resolve-reason-error"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={pending}
            data-testid="resolve-submit"
          >
            Submit override
          </Button>
        </div>
      </div>
    </dialog>
  );
}
