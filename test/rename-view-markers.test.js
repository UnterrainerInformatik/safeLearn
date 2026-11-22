/**
 * The one-off migration tool for the view-marker rename
 * (`tools/rename-view-markers.mjs`, rename-view-markers-by-mechanism D6).
 *
 * No browser, no server: the rewrite is a pure function over text, and the
 * directory walk runs against a temporary directory.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { remainingOccurrences, renameMarkers, run } from "../tools/rename-view-markers.mjs";

const cases = [
  { what: "a marker line", before: "@@@ #exam", after: "@@@ #variant-private" },
  { what: "the practice marker", before: "@@@ #practice", after: "@@@ #variant-public" },
  { what: "the answer marker", before: "@@@ #answer", after: "@@@ #optional" },
  { what: "an indented marker", before: "  @@@ #exam", after: "  @@@ #variant-private" },
  { what: "a tab-indented marker", before: "\t@@@ #answer", after: "\t@@@ #optional" },
  {
    what: "a mention in inline code",
    before: "Die Musterlösung steht in den `@@@ #exam`-Blöcken.",
    after: "Die Musterlösung steht in den `@@@ #variant-private`-Blöcken.",
  },
  { what: "a mixed directive with a comma", before: "@@@ 4ahif, #exam", after: "@@@ 4ahif, #variant-private" },
  { what: "a mixed directive without a comma", before: "@@@ 4ahif #exam", after: "@@@ 4ahif #variant-private" },
  { what: "two markers", before: "@@@ #exam, #answer", after: "@@@ #variant-private, #optional" },
  { what: "a timed marker", before: "@@@ #exam[2025-01-01T00:00:00]", after: "@@@ #variant-private[2025-01-01T00:00:00]" },
  { what: "upper case", before: "@@@ #EXAM", after: "@@@ #variant-private" },
  { what: "mixed case", before: "@@@ #Practice", after: "@@@ #variant-public" },
  { what: "a bare tag", before: "Tagged #exam for later.", after: "Tagged #exam for later." },
  { what: "a tag before the marker on one line", before: "#exam then `@@@ #exam`", after: "#exam then `@@@ #variant-private`" },
  { what: "a longer word", before: "@@@ #examples", after: "@@@ #examples" },
  { what: "a hyphenated name", before: "@@@ #exam-x", after: "@@@ #exam-x" },
  { what: "a new name", before: "@@@ #variant-private", after: "@@@ #variant-private" },
  { what: "a CRLF line", before: "@@@ #exam\r", after: "@@@ #variant-private\r" },
];

for (const { what, before, after } of cases) {
  test(`rewrites ${what} as expected`, () => {
    assert.equal(renameMarkers(before).text, after);
  });
}

test("rewrites a marker inside a code fence and counts per name", () => {
  const text = ["Intro.", "```", "@@@ #exam", "secret", "@@@", "```", "@@@ #practice", "p", "@@@", "#answer tag"].join("\n");
  const { text: out, counts } = renameMarkers(text);
  assert.equal(
    out,
    ["Intro.", "```", "@@@ #variant-private", "secret", "@@@", "```", "@@@ #variant-public", "p", "@@@", "#answer tag"].join("\n")
  );
  assert.deepEqual(counts, { exam: 1, practice: 1, answer: 0 });
});

test("lists what is left with its line", () => {
  const { text } = renameMarkers("@@@ #exam\nA bare #answer in prose.\n@@@");
  assert.deepEqual(remainingOccurrences(text), [{ line: 2, name: "#answer", text: "A bare #answer in prose." }]);
});

test("a dry run writes nothing, --write rewrites, and a second run finds nothing", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rename-view-markers-"));
  try {
    mkdirSync(path.join(dir, "sub"));
    mkdirSync(path.join(dir, ".obsidian"));
    writeFileSync(path.join(dir, "a.md"), "@@@ #exam\nx\n@@@\n@@@ #practice\ny\n@@@\n");
    writeFileSync(path.join(dir, "sub", "b.md"), "@@@ 4ahif, #answer\nz\n@@@\nTag #exam.\n");
    writeFileSync(path.join(dir, ".obsidian", "c.md"), "@@@ #exam\n");
    writeFileSync(path.join(dir, "notes.txt"), "@@@ #exam\n");

    const dry = run(dir);
    assert.deepEqual(dry.totals, { exam: 1, practice: 1, answer: 1 });
    assert.deepEqual(
      dry.perFile.map(({ file }) => file),
      ["a.md", path.join("sub", "b.md")]
    );
    assert.deepEqual(
      dry.remaining.map(({ file, line, name }) => [file, line, name]),
      [[path.join("sub", "b.md"), 4, "#exam"]]
    );
    assert.match(readFileSync(path.join(dir, "a.md"), "utf8"), /@@@ #exam/, "the dry run wrote nothing");

    run(dir, { write: true });
    assert.equal(readFileSync(path.join(dir, "a.md"), "utf8"), "@@@ #variant-private\nx\n@@@\n@@@ #variant-public\ny\n@@@\n");
    assert.equal(readFileSync(path.join(dir, "sub", "b.md"), "utf8"), "@@@ 4ahif, #optional\nz\n@@@\nTag #exam.\n");
    assert.equal(readFileSync(path.join(dir, ".obsidian", "c.md"), "utf8"), "@@@ #exam\n", "dot-directories are skipped");
    assert.equal(readFileSync(path.join(dir, "notes.txt"), "utf8"), "@@@ #exam\n", "only Markdown is touched");

    const again = run(dir);
    assert.deepEqual(again.totals, { exam: 0, practice: 0, answer: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
