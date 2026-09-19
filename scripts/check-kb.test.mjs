import assert from "node:assert/strict";
import { test } from "node:test";
import {
  padPbi,
  pbisFromCommitMessages,
  splitSections,
  isEmptyOrTbd,
} from "./check-kb.mjs";

test("padPbi zero-pads", () => {
  assert.equal(padPbi("1"), "001");
  assert.equal(padPbi("20"), "020");
});

test("pbisFromCommitMessages extracts feat refs", () => {
  const text = "feat(PBI-2): foo\nmerge feat(PBI-001): bar";
  assert.deepEqual(pbisFromCommitMessages(text), ["001", "002"]);
});

test("isEmptyOrTbd rejects bare TBD", () => {
  assert.equal(isEmptyOrTbd("TBD"), true);
  assert.equal(isEmptyOrTbd("- Next.js scaffold shipped"), false);
});

test("splitSections finds required headings", () => {
  const md = "## PBI / ACs / TCs\n\n- foo\n\n## Shipped vs spec\n\n| x | done |\n";
  const sections = splitSections(md);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].heading, "PBI / ACs / TCs");
});
