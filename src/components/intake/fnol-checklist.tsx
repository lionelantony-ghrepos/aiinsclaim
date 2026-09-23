import { Check, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { FnolChecklistItem } from "@/lib/intake/checklist";
import { cn } from "@/lib/utils";

export type FnolChecklistProps = {
  items: FnolChecklistItem[];
  className?: string;
};

export function FnolChecklist({ items, className }: FnolChecklistProps) {
  const satisfiedCount = items.filter((item) => item.satisfied).length;

  return (
    <Card data-testid="fnol-checklist" className={cn(className)}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>FNOL checklist</CardTitle>
          <Badge tone={satisfiedCount === items.length ? "success" : "warning"}>
            {satisfiedCount}/{items.length} complete
          </Badge>
        </div>
        <p className="text-sm text-text-muted">
          Required fields and documents per BR-DOC-001.
        </p>
      </CardHeader>

      <ul className="space-y-2" aria-label="FNOL requirements">
        {items.length === 0 ? (
          <li className="text-sm text-text-muted">No requirements loaded yet.</li>
        ) : (
          items.map((item) => (
            <li
              key={item.requirement}
              data-testid={`checklist-item-${item.requirement}`}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                item.satisfied
                  ? "border-success/40 bg-surface text-text"
                  : "border-border bg-surface-raised text-text",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  item.satisfied ? "text-success" : "text-text-muted",
                )}
                aria-hidden
              >
                {item.satisfied ? <Check className="size-4" /> : <Circle className="size-4" />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{item.label}</span>
                <span className="text-xs text-text-muted">
                  {item.satisfied ? "Satisfied" : "Missing"}
                </span>
              </span>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}
