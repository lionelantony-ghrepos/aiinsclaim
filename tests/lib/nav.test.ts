import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navItemsForRole } from "@/lib/nav";

describe("navItemsForRole", () => {
  it("gives claimants self-service links and hides staff admin routes", () => {
    const hrefs = navItemsForRole("claimant").map((item) => item.href);

    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/claims");
    expect(hrefs).toContain("/claims/new");
    expect(hrefs).not.toContain("/queue");
    expect(hrefs).not.toContain("/rules");
  });

  it("gives adjusters the work queue and hides admin rules", () => {
    const hrefs = navItemsForRole("adjuster").map((item) => item.href);

    expect(hrefs).toContain("/queue");
    expect(hrefs).not.toContain("/rules");
    expect(hrefs).not.toContain("/claims/new");
  });

  it("gives admins rules and parameters", () => {
    const hrefs = navItemsForRole("admin").map((item) => item.href);

    expect(hrefs).toContain("/rules");
    expect(hrefs).toContain("/parameters");
    expect(hrefs).toContain("/queue");
  });

  it("lists every nav item with at least one role", () => {
    expect(NAV_ITEMS.length).toBeGreaterThan(0);
    for (const item of NAV_ITEMS) {
      expect(item.roles.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});
