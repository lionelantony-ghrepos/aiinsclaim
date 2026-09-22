"use client";

import { CLAIM_TYPES, TASK_TYPES } from "@/lib/db/schema/enums";
import type { QueueTaskFilters } from "@/lib/schemas/tasks";
import { taskTypeLabel } from "@/lib/ui/task-labels";

type QueueFiltersProps = {
  filters: QueueTaskFilters;
  onChange: (filters: QueueTaskFilters) => void;
};

const CLAIM_TYPE_LABELS: Record<(typeof CLAIM_TYPES)[number], string> = {
  collision: "Collision",
  theft: "Theft",
  glass: "Glass",
  water_damage: "Water damage",
  fire: "Fire",
  storm: "Storm",
  burglary: "Burglary",
  other: "Other",
};

export function QueueFilters({ filters, onChange }: QueueFiltersProps) {
  return (
    <div
      className="flex flex-wrap items-end gap-3"
      data-testid="queue-filters"
      aria-label="Queue filters"
    >
      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Task type
        <select
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-text"
          value={filters.type ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              type: event.target.value
                ? (event.target.value as QueueTaskFilters["type"])
                : undefined,
            })
          }
          aria-label="Filter by task type"
        >
          <option value="">All types</option>
          {TASK_TYPES.map((type) => (
            <option key={type} value={type}>
              {taskTypeLabel(type)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Claim type
        <select
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-text"
          value={filters.claimType ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              claimType: event.target.value
                ? (event.target.value as QueueTaskFilters["claimType"])
                : undefined,
            })
          }
          aria-label="Filter by claim type"
        >
          <option value="">All claim types</option>
          {CLAIM_TYPES.map((type) => (
            <option key={type} value={type}>
              {CLAIM_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-text-muted">
        SLA breach
        <select
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-text"
          value={filters.breachState ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              breachState: event.target.value
                ? (event.target.value as QueueTaskFilters["breachState"])
                : undefined,
            })
          }
          aria-label="Filter by SLA breach state"
        >
          <option value="">All SLA states</option>
          <option value="ok">On track</option>
          <option value="warning">Warning</option>
          <option value="breached">Breached</option>
        </select>
      </label>
    </div>
  );
}
