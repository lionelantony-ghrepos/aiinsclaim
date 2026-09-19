import type { ReactNode } from "react";
import { RoleSwitcher } from "@/components/layout/role-switcher";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full bg-bg text-text">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to main content
      </a>
      <aside className="flex w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4">
        <p className="font-semibold tracking-tight">
          Ledger
          <span className="mt-0.5 block text-xs font-normal text-text-muted">
            Claims workbench
          </span>
        </p>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-3">
          <p className="text-sm text-text-muted">
            Role switcher is a placeholder until auth ships in PBI-003.
          </p>
          <div className="flex items-center gap-3">
            <RoleSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
