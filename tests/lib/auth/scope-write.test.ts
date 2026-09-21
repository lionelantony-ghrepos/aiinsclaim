import { describe, expect, it } from "vitest";
import { canWriteClaim } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/schema/enums";

function sessionUser(id: string, role: UserRole): SessionUser {
  return {
    id,
    email: `${id}@test.local`,
    displayName: id,
    role,
    authorityLevel: 0,
  };
}

describe("canWriteClaim staff assignment scope", () => {
  const assigned = { assignedTo: "adj-1", siuReferred: false };
  const referred = { assignedTo: "adj-1", siuReferred: true };

  it("allows admin and supervisor on any claim", () => {
    expect(canWriteClaim(sessionUser("a", "admin"), assigned)).toBe(true);
    expect(canWriteClaim(sessionUser("s", "supervisor"), assigned)).toBe(true);
  });

  it("allows adjuster and intake only when assigned", () => {
    expect(canWriteClaim(sessionUser("adj-1", "adjuster"), assigned)).toBe(true);
    expect(canWriteClaim(sessionUser("other", "adjuster"), assigned)).toBe(false);
    expect(canWriteClaim(sessionUser("adj-1", "intake_agent"), assigned)).toBe(
      true,
    );
    expect(canWriteClaim(sessionUser("other", "intake_agent"), assigned)).toBe(
      false,
    );
  });

  it("allows SIU only on referred claims", () => {
    expect(canWriteClaim(sessionUser("siu", "siu_analyst"), referred)).toBe(true);
    expect(canWriteClaim(sessionUser("siu", "siu_analyst"), assigned)).toBe(
      false,
    );
  });

  it("denies claimants", () => {
    expect(canWriteClaim(sessionUser("c", "claimant"), assigned)).toBe(false);
  });
});
