import { describe, expect, it } from "vitest";
import { evaluateCoverage } from "@/lib/coverage";

const AUTO_COVERAGE = {
  collision: { limit: 50000, deductible: 500 },
  comprehensive: { limit: 50000, deductible: 250 },
  liability: { limit: 100000 },
  rental: { limit: 1500 },
};

const PROPERTY_COVERAGE = {
  dwelling: { limit: 350000, deductible: 1000 },
  contents: { limit: 75000, deductible: 500 },
  liability: { limit: 300000 },
  loss_of_use: { limit: 50000 },
};

describe("PBI-015 evaluateCoverage fixtures (TC-015-02)", () => {
  it("auto collision applies collision limit and deductible", () => {
    const result = evaluateCoverage(
      { lineOfBusiness: "auto", claimType: "collision", estimatedAmount: 3200 },
      AUTO_COVERAGE,
    );
    expect(result.coverageKey).toBe("collision");
    expect(result.limit).toBe(50000);
    expect(result.deductible).toBe(500);
    expect(result.coveredAmount).toBe(3200);
    expect(result.payableEstimate).toBe(2700);
    expect(result.withinLimit).toBe(true);
  });

  it("auto theft maps to comprehensive coverage", () => {
    const result = evaluateCoverage(
      { lineOfBusiness: "auto", claimType: "theft", estimatedAmount: 8500 },
      AUTO_COVERAGE,
    );
    expect(result.coverageKey).toBe("comprehensive");
    expect(result.payableEstimate).toBe(8250);
    expect(result.withinLimit).toBe(true);
  });

  it("auto glass maps to comprehensive coverage", () => {
    const result = evaluateCoverage(
      { lineOfBusiness: "auto", claimType: "glass", estimatedAmount: 650 },
      AUTO_COVERAGE,
    );
    expect(result.coverageKey).toBe("comprehensive");
    expect(result.payableEstimate).toBe(400);
  });

  it("flags estimates above the limit and caps covered amount", () => {
    const result = evaluateCoverage(
      { lineOfBusiness: "auto", claimType: "collision", estimatedAmount: 60000 },
      AUTO_COVERAGE,
    );
    expect(result.withinLimit).toBe(false);
    expect(result.coveredAmount).toBe(50000);
    expect(result.payableEstimate).toBe(49500);
  });

  it("property water damage applies dwelling coverage", () => {
    const result = evaluateCoverage(
      {
        lineOfBusiness: "property",
        claimType: "water_damage",
        estimatedAmount: 12000,
      },
      PROPERTY_COVERAGE,
    );
    expect(result.coverageKey).toBe("dwelling");
    expect(result.payableEstimate).toBe(11000);
    expect(result.withinLimit).toBe(true);
  });

  it("property burglary applies contents coverage", () => {
    const result = evaluateCoverage(
      { lineOfBusiness: "property", claimType: "burglary", estimatedAmount: 6000 },
      PROPERTY_COVERAGE,
    );
    expect(result.coverageKey).toBe("contents");
    expect(result.payableEstimate).toBe(5500);
  });

  it("property fire and storm apply dwelling coverage", () => {
    const fire = evaluateCoverage(
      { lineOfBusiness: "property", claimType: "fire", estimatedAmount: 45000 },
      PROPERTY_COVERAGE,
    );
    expect(fire.coverageKey).toBe("dwelling");
    expect(fire.payableEstimate).toBe(44000);

    const storm = evaluateCoverage(
      { lineOfBusiness: "property", claimType: "storm", estimatedAmount: 9000 },
      PROPERTY_COVERAGE,
    );
    expect(storm.coverageKey).toBe("dwelling");
    expect(storm.payableEstimate).toBe(8000);
  });

  it("floors payable at zero when deductible exceeds covered amount", () => {
    const result = evaluateCoverage(
      { lineOfBusiness: "auto", claimType: "glass", estimatedAmount: 100 },
      { comprehensive: { limit: 50000, deductible: 250 } },
    );
    expect(result.payableEstimate).toBe(0);
    expect(result.withinLimit).toBe(true);
  });
});
