"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { runSlaSweepAction } from "@/app/(app)/(admin)/sla/actions";

export function RunSlaSweepButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    const result = await runSlaSweepAction();
    setPending(false);
    if (result.ok) {
      setMessage(
        `Sweep complete: scanned ${result.data.scanned}, escalated ${result.data.escalated}.`,
      );
    } else {
      setMessage(result.error);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label="Run SLA sweep now"
      >
        {pending ? "Running…" : "Run SLA sweep now"}
      </Button>
      {message ? (
        <p className="text-sm text-text-muted" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
