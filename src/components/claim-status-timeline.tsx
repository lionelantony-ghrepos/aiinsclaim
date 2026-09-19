import { Check, Circle, CircleDot } from "lucide-react";
import type { ClaimStatus } from "@/lib/db/schema/enums";
import { STATUS_RAMP_CLASS, statusRampToken } from "@/lib/ui/claim-status";
import { cn } from "@/lib/utils";

export type TimelineStep = {
  id: string;
  label: string;
  status: ClaimStatus;
  state: "complete" | "current" | "upcoming";
};

export type ClaimStatusTimelineProps = {
  steps: TimelineStep[];
};

function StepIcon({ state }: { state: TimelineStep["state"] }) {
  if (state === "complete") return <Check aria-hidden className="size-4" />;
  if (state === "current") return <CircleDot aria-hidden className="size-4" />;
  return <Circle aria-hidden className="size-4" />;
}

export function ClaimStatusTimeline({ steps }: ClaimStatusTimelineProps) {
  return (
    <ol
      data-testid="claim-status-timeline"
      className="flex flex-wrap items-start gap-4"
    >
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={cn(
            "flex min-w-28 flex-1 items-center gap-3",
            STATUS_RAMP_CLASS[statusRampToken(step.status)],
          )}
        >
          <span
            className="flex size-8 items-center justify-center rounded-full border border-current bg-surface"
            aria-hidden
          >
            <StepIcon state={step.state} />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-medium text-current">{step.label}</span>
            <span className="text-xs text-text-muted">
              {step.state === "current"
                ? "Current"
                : step.state === "complete"
                  ? "Complete"
                  : "Upcoming"}
            </span>
          </span>
          {index < steps.length - 1 ? (
            <span
              aria-hidden
              className="mx-1 hidden h-px flex-1 bg-border sm:block"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
