"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/lib/db/schema/enums";
import { navItemsForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function SidebarNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const current =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium text-text no-underline outline-offset-2 hover:bg-surface-raised",
              current && "bg-surface-raised text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
