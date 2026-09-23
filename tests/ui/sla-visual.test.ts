import { describe, expect, it } from "vitest";
import { slaVisualTone } from "@/lib/ui/sla-visual";

const WARNING_RATIO = 0.75;

describe("slaVisualTone", () => {
  it("stays ok before the amber threshold", () => {
    expect(
      slaVisualTone({
        status: "running",
        elapsedRatio: 0.5,
        warningRatio: WARNING_RATIO,
      }),
    ).toBe("ok");
  });

  it("turns warning at the configured amber threshold", () => {
    expect(
      slaVisualTone({
        status: "running",
        elapsedRatio: WARNING_RATIO,
        warningRatio: WARNING_RATIO,
      }),
    ).toBe("warning");
  });

  it("turns danger on breach", () => {
    expect(
      slaVisualTone({
        status: "breached",
        elapsedRatio: 0.2,
        warningRatio: WARNING_RATIO,
      }),
    ).toBe("danger");
    expect(
      slaVisualTone({
        status: "running",
        elapsedRatio: 1,
        warningRatio: WARNING_RATIO,
      }),
    ).toBe("danger");
  });

  it("shows paused state without advancing toward breach", () => {
    expect(
      slaVisualTone({
        status: "paused",
        elapsedRatio: 0.95,
        warningRatio: WARNING_RATIO,
      }),
    ).toBe("paused");
  });
});
