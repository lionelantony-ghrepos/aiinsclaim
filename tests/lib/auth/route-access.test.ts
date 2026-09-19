import { describe, expect, it } from "vitest";
import {
  canRoleAccessPath,
  getAllowedRolesForPath,
  isPublicPath,
  resolvePostLoginRedirect,
} from "@/lib/auth/route-access";

describe("route access", () => {
  it("treats login as public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/queue")).toBe(false);
  });

  it("restricts claimant routes to claimants", () => {
    expect(getAllowedRolesForPath("/claims")).toEqual(["claimant"]);
    expect(canRoleAccessPath("claimant", "/claims/new")).toBe(true);
    expect(canRoleAccessPath("adjuster", "/claims")).toBe(false);
  });

  it("restricts admin routes to admins", () => {
    expect(canRoleAccessPath("admin", "/rules")).toBe(true);
    expect(canRoleAccessPath("supervisor", "/rules")).toBe(false);
  });

  it("allows any authenticated role on shared pages", () => {
    expect(getAllowedRolesForPath("/")).toBeNull();
    expect(canRoleAccessPath("claimant", "/dev/components")).toBe(true);
  });

  it("returns role home when next path is forbidden", () => {
    expect(resolvePostLoginRedirect("claimant", "/queue")).toBe("/claims");
  });

  it("honours an allowed next path after login", () => {
    expect(resolvePostLoginRedirect("adjuster", "/queue")).toBe("/queue");
  });
});
