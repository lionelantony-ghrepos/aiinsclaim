import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemAssessmentForm } from "./item-assessment-form";

export type WorkbenchItem = {
  id: string;
  itemType: string;
  description: string;
  claimedAmount: string | null;
  assessedAmount: string | null;
  assessmentStatus: string | null;
};

export function ItemsPanel({ items }: { items: WorkbenchItem[] }) {
  return (
    <Card data-testid="workbench-items" className="space-y-4">
      <CardHeader className="mb-0">
        <CardTitle>Claim items ({items.length})</CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">No items recorded on this claim.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={item.id}
              data-testid={`workbench-item-${item.id}`}
              className="space-y-2 rounded-md border border-border p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{item.description}</p>
                <p className="font-mono text-sm text-text-muted">
                  claimed {item.claimedAmount ?? "—"}
                </p>
              </div>
              <p className="text-xs text-text-muted capitalize">
                {item.itemType.replaceAll("_", " ")} ·{" "}
                {item.assessmentStatus?.replaceAll("_", " ") ?? "pending"}
                {item.assessedAmount ? (
                  <>
                    {" · "}
                    <span className="font-mono">assessed {item.assessedAmount}</span>
                  </>
                ) : null}
              </p>
              <ItemAssessmentForm
                claimItemId={item.id}
                initialAssessedAmount={item.assessedAmount}
                initialStatus={item.assessmentStatus ?? "pending"}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
