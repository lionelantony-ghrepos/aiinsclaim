import { logoutAction } from "@/app/(auth)/login/actions";
import type { SessionUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/ui/role-labels";

export function UserMenu({ user }: { user: SessionUser }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="text-right">
        <p className="font-medium text-text">{user.displayName}</p>
        <p className="text-xs text-text-muted">{ROLE_LABELS[user.role]}</p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
