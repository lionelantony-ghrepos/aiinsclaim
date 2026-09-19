"use client";

import { USER_ROLES, type UserRole } from "@/lib/db/schema/enums";
import { ROLE_LABELS } from "@/lib/ui/role-labels";
import { useRolePreview } from "@/components/providers/role-preview-provider";

export function RoleSwitcher() {
  const { role, setRole } = useRolePreview();

  return (
    <label className="flex items-center gap-2 text-sm text-text-muted">
      <span>Preview role</span>
      <select
        className="h-9 rounded-md border border-border bg-surface px-2 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        value={role}
        onChange={(event) => {
          const next = event.target.value;
          if ((USER_ROLES as readonly string[]).includes(next)) {
            setRole(next as UserRole);
          }
        }}
      >
        {USER_ROLES.map((item) => (
          <option key={item} value={item}>
            {ROLE_LABELS[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
