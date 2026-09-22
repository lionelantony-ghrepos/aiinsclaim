"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type AssigneeOption = {
  id: string;
  displayName: string;
  role: string;
};

type BulkReassignDialogProps = {
  open: boolean;
  selectedCount: number;
  assignees: AssigneeOption[];
  onClose: () => void;
  onSubmit: (assignTo: string) => Promise<void>;
};

export function BulkReassignDialog({
  open,
  selectedCount,
  assignees,
  onClose,
  onSubmit,
}: BulkReassignDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [assignTo, setAssignTo] = useState("");
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

  async function handleSubmit() {
    if (!assignTo) {
      setError("Select an assignee.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(assignTo);
      setAssignTo("");
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to bulk reassign",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-lg backdrop:bg-bg/80"
      aria-labelledby="bulk-reassign-title"
      data-testid="bulk-reassign-dialog"
      onClose={onClose}
    >
      <div>
        <h2 id="bulk-reassign-title" className="text-lg font-semibold text-text">
          Bulk reassign
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Reassign {selectedCount} selected task{selectedCount === 1 ? "" : "s"}.
        </p>
        <label className="mt-4 block text-sm text-text">
          Assign to
          <select
            className="mt-1 h-9 w-full rounded-md border border-border bg-surface-raised px-2 text-sm"
            value={assignTo}
            onChange={(event) => setAssignTo(event.target.value)}
            aria-label="Select assignee"
            data-testid="bulk-reassign-select"
          >
            <option value="">Choose staff member…</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.displayName} ({assignee.role.replaceAll("_", " ")})
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={pending || !assignTo}
            data-testid="bulk-reassign-submit"
          >
            Reassign tasks
          </Button>
        </div>
      </div>
    </dialog>
  );
}
