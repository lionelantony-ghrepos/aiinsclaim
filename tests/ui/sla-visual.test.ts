import { describe, expect, it } from "vitest";
import { SLA_AMBER_ELAPSED_RATIO, slaVisualTone } from "@/lib/ui/sla-visual";

describe("slaVisualTone", () => {
  it("stays ok before the DESIGN §9 amber threshold", () => {
    expect(
      slaVisualTone({ status: "running", elapsedRatio: 0.5 }),
    ).toBe("ok");
  });

  it("turns warning at the DESIGN §9 amber threshold", () => {
    expect(
      slaVisualTone({
        status: "running",
        elapsedRatio: SLA_AMBER_ELAPSED_RATIO,
      }),
    ).toBe("warning");
  });

  it("turns danger on breach", () => {
    expect(
      slaVisualTone({ status: "breached", elapsedRatio: 0.2 }),
    ).toBe("danger");
    expect(
      slaVisualTone({ status: "running", elapsedRatio: 1 }),
    ).toBe("danger");
  });
});
