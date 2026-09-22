import { describe, expect, it } from "vitest";
import { getRoleHomePath } from "@/lib/auth/role-home";

describe("getRoleHomePath", () => {
  it("maps each demo role to its primary workspace", () => {
    expect(getRoleHomePath("claimant")).toBe("/claims");
    expect(getRoleHomePath("intake_agent")).toBe("/intake/new");
    expect(getRoleHomePath("adjuster")).toBe("/queue");
    expect(getRoleHomePath("supervisor")).toBe("/dashboard");
    expect(getRoleHomePath("siu_analyst")).toBe("/queue");
    expect(getRoleHomePath("admin")).toBe("/rules");
  });
});
