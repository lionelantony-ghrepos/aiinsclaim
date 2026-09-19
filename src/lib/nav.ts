import { USER_ROLES, type UserRole } from "@/lib/db/schema/enums";

export type NavItem = {
  href: string;
  label: string;
  roles: readonly UserRole[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home", roles: USER_ROLES },
  { href: "/claims", label: "My claims", roles: ["claimant"] },
  { href: "/claims/new", label: "File a claim", roles: ["claimant"] },
  {
    href: "/intake/new",
    label: "Assisted intake",
    roles: ["intake_agent", "adjuster", "supervisor", "admin"],
  },
  {
    href: "/queue",
    label: "Work queue",
    roles: ["intake_agent", "adjuster", "supervisor", "siu_analyst", "admin"],
  },
  {
    href: "/dashboard",
    label: "Operations",
    roles: ["supervisor", "admin"],
  },
  { href: "/rules", label: "Rules", roles: ["admin"] },
  { href: "/parameters", label: "Parameters", roles: ["admin"] },
  { href: "/dev/components", label: "Component lab", roles: USER_ROLES },
];

export function navItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
