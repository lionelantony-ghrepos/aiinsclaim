import Link from "next/link";
import { cn } from "@/lib/utils";

export const WORKBENCH_TABS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Items" },
  { id: "documents", label: "Documents" },
  { id: "financials", label: "Financials" },
  { id: "timeline", label: "Timeline" },
  { id: "tasks", label: "Tasks" },
] as const;

export type WorkbenchTabId = (typeof WORKBENCH_TABS)[number]["id"];

export function isWorkbenchTab(value: string | undefined): value is WorkbenchTabId {
  return WORKBENCH_TABS.some((tab) => tab.id === value);
}

export function WorkbenchTabs({
  claimId,
  active,
}: {
  claimId: string;
  active: WorkbenchTabId;
}) {
  return (
    <nav aria-label="Assessment workbench" data-testid="workbench-tabs">
      <ul className="flex flex-wrap gap-1 border-b border-border">
        {WORKBENCH_TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={`/claims/${claimId}?tab=${tab.id}`}
                aria-current={selected ? "page" : undefined}
                data-testid={`workbench-tab-${tab.id}`}
                className={cn(
                  "inline-block rounded-t-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  selected
                    ? "border-b-2 border-primary text-text"
                    : "text-text-muted hover:text-text",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
