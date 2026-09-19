"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { USER_ROLES, type UserRole } from "@/lib/db/schema/enums";

const STORAGE_KEY = "aiinsclaim.preview-role";
const DEFAULT_ROLE: UserRole = "adjuster";

const listeners = new Set<() => void>();

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readRole(): UserRole {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && isUserRole(stored) ? stored : DEFAULT_ROLE;
}

type RolePreviewContextValue = {
  role: UserRole;
  setRole: (role: UserRole) => void;
};

const RolePreviewContext = createContext<RolePreviewContextValue | null>(null);

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const role = useSyncExternalStore(subscribe, readRole, () => DEFAULT_ROLE);

  const setRole = useCallback((next: UserRole) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    emit();
  }, []);

  const value = useMemo<RolePreviewContextValue>(
    () => ({ role, setRole }),
    [role, setRole],
  );

  return (
    <RolePreviewContext.Provider value={value}>
      {children}
    </RolePreviewContext.Provider>
  );
}

export function useRolePreview(): RolePreviewContextValue {
  const context = useContext(RolePreviewContext);
  if (!context) {
    throw new Error("useRolePreview must be used within RolePreviewProvider");
  }
  return context;
}
