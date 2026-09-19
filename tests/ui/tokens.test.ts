import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

const REQUIRED_TOKENS = [
  "--bg",
  "--surface",
  "--surface-raised",
  "--border",
  "--text",
  "--text-muted",
  "--primary",
  "--accent",
  "--success",
  "--warning",
  "--danger",
  "--info",
  "--status-draft",
  "--status-triage",
  "--status-assessment",
  "--status-settlement",
  "--status-paid",
  "--status-denied",
  "--fraud-low",
  "--fraud-medium",
  "--fraud-high",
  "--fraud-critical",
];

const HEX_IN_STYLES =
  /(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\[#[0-9a-fA-F]{3,8}\])/;

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("Ledger design tokens (TC-002-01)", () => {
  it("declares light and dark CSS variables from DESIGN §9", () => {
    const css = readFileSync(
      path.join(repoRoot, "src/app/globals.css"),
      "utf8",
    );

    for (const token of REQUIRED_TOKENS) {
      expect(css, `missing token ${token}`).toContain(token);
    }
    expect(css).toMatch(/:root\s*\{/);
    expect(css).toMatch(/\.dark\s*\{/);
  });

  it("keeps raw hex out of component styles", () => {
    const roots = [
      path.join(repoRoot, "src/components"),
      path.join(repoRoot, "src/app"),
    ];
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of walkFiles(root)) {
        if (file.endsWith("globals.css")) continue;
        const source = readFileSync(file, "utf8");
        if (HEX_IN_STYLES.test(source)) {
          offenders.push(path.relative(repoRoot, file).replaceAll("\\", "/"));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
