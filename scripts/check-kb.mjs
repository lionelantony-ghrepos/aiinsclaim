#!/usr/bin/env node
/**
 * Completeness gate for ljadoc/kb as-built files.
 * Usage: node scripts/check-kb.mjs [--commits-file path]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const asBuiltDir = path.join(repoRoot, "ljadoc", "kb", "as-built");

export const REQUIRED_HEADINGS = [
  "PBI / ACs / TCs",
  "Shipped vs spec",
  "Surfaces",
  "Contracts",
  "Rules",
  "How to extend",
  "Ops",
  "Trace",
];

export function padPbi(id) {
  return String(Number(id)).padStart(3, "0");
}

export function pbisFromCommitMessages(text) {
  const ids = new Set();
  const re = /feat\(PBI-(\d{1,3})\)/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    ids.add(padPbi(match[1]));
  }
  return [...ids].sort();
}

export function asBuiltPath(pbi) {
  return path.join(asBuiltDir, `PBI-${padPbi(pbi)}.md`);
}

export function splitSections(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      if (current) sections.push(current);
      current = { heading: h2[1].trim(), body: "" };
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) sections.push(current);
  return sections;
}

export function isEmptyOrTbd(body) {
  const trimmed = body.trim();
  if (trimmed.length === 0) return true;
  const normalized = trimmed.replace(/\s+/g, " ").toLowerCase();
  if (/^(tbd\.?|- tbd\.?|n\/a\.?)$/i.test(normalized)) return true;
  if (normalized === "tbd") return true;
  const hasTableRow = /^\|.+\|$/m.test(trimmed);
  const hasBullet = /^-\s+\S/m.test(trimmed);
  if (hasTableRow || hasBullet) return false;
  if (/^none(\s|\.|$)/i.test(trimmed)) return false;
  if (/pending/i.test(trimmed)) return false;
  if (/commit/i.test(trimmed)) return false;
  return trimmed.length < 12;
}

export function validateAsBuiltFile(filePath) {
  const markdown = fs.readFileSync(filePath, "utf8");
  const sections = splitSections(markdown);
  const byHeading = new Map(sections.map((s) => [s.heading, s.body]));
  const errors = [];
  for (const heading of REQUIRED_HEADINGS) {
    if (!byHeading.has(heading)) {
      errors.push(`missing heading: ## ${heading}`);
      continue;
    }
    if (isEmptyOrTbd(byHeading.get(heading))) {
      errors.push(`empty or TBD section: ## ${heading}`);
    }
  }
  return errors;
}

function readCommitSubjects(argv) {
  const idx = argv.indexOf("--commits-file");
  if (idx !== -1 && argv[idx + 1]) {
    return fs.readFileSync(argv[idx + 1], "utf8");
  }
  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }
  return argv.slice(2).join("\n");
}

function main() {
  const errors = [];
  if (!fs.existsSync(asBuiltDir)) {
    console.error("Missing ljadoc/kb/as-built/");
    process.exit(1);
  }

  for (const file of fs.readdirSync(asBuiltDir).filter((f) => f.endsWith(".md"))) {
    for (const err of validateAsBuiltFile(path.join(asBuiltDir, file))) {
      errors.push(`${file}: ${err}`);
    }
  }

  const subjects = readCommitSubjects(process.argv);
  for (const pbi of pbisFromCommitMessages(subjects)) {
    const file = asBuiltPath(pbi);
    if (!fs.existsSync(file)) {
      errors.push(`missing as-built for feat(PBI-${pbi}): ${path.relative(repoRoot, file)}`);
    }
  }

  if (errors.length > 0) {
    console.error("KB check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("KB check passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
