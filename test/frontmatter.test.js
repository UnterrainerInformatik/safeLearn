/**
 * What frontmatter is, decided by the one function that decides it
 * (`frontmatter-properties`).
 *
 * Every read of a corpus file - the page views, the handout, the index, search
 * and the attachment check - starts with `splitFrontmatter` and then reads the
 * whole-file directive from line 1 of the body. So the cases below are the
 * cases for all of them: where a block starts and ends, what it yields, and
 * that a file without one comes back exactly as it went in.
 *
 * No browser, no login, no server process: this file imports the splitter and
 * calls it. What the views make of the properties is checked in the content
 * suite against `md/test-frontmatter.md`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFirstLineForPermissions, propertyValuesText, splitFrontmatter } from "../obsidian.js";

/** Runs `fn` with console.warn captured; returns what was warned. */
function warnings(fn) {
  const original = console.warn;
  const seen = [];
  console.warn = (...args) => seen.push(args.join(" "));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return seen;
}

const homework = [
  "---",
  "klasse: 4AHIF",
  "ausgabe: 2026-11-10",
  "abgabe: 2026-12-08",
  "fach: WMC4",
  'footer: "4AHIF - WMC4 - Hausübung 1"',
  "themen:",
  "  - Quarkus CDI",
  "  - REST",
  "---",
  "@@@ teacher",
  "# Hausübung 1",
  "",
  "Text.",
  "",
].join("\n");

test("a homework file: the block is its frontmatter and the directive is line 1 of the body", () => {
  const { body, properties } = splitFrontmatter(homework);
  assert.equal(body, "@@@ teacher\n# Hausübung 1\n\nText.\n");
  assert.deepEqual(
    parseFirstLineForPermissions(body.split("\n")[0]),
    parseFirstLineForPermissions("@@@ teacher")
  );
  assert.deepEqual(properties, [
    ["klasse", "4AHIF"],
    ["ausgabe", "2026-11-10"],
    ["abgabe", "2026-12-08"],
    ["fach", "WMC4"],
    ["footer", "4AHIF - WMC4 - Hausübung 1"],
    ["themen", ["Quarkus CDI", "REST"]],
  ]);
});

test("dates stay the strings the author wrote; numbers stay numbers", () => {
  const { properties } = splitFrontmatter("---\nausgabe: 2026-11-10\nstunden: 4\n---\nx");
  assert.deepEqual(properties, [
    ["ausgabe", "2026-11-10"],
    ["stunden", 4],
  ]);
  assert.equal(typeof properties[0][1], "string");
});

test("a rule later in the file is not frontmatter", () => {
  const text = "# Heading\n\nText\n\n---\n\nMore\n---\n";
  assert.deepEqual(splitFrontmatter(text), { body: text, properties: null });
});

test("an unclosed block is not frontmatter", () => {
  const text = "---\nNot properties\n\nJust a slide.\n";
  assert.deepEqual(splitFrontmatter(text), { body: text, properties: null });
});

test("a file without frontmatter comes back unchanged, only a leading mark dropped", () => {
  for (const text of ["@@@ teacher\n# A\n", "", "plain", "---", "--- \n", "x\n---\ny\n---\n"]) {
    assert.deepEqual(splitFrontmatter(text), { body: text, properties: null });
  }
  assert.equal(splitFrontmatter("﻿@@@ teacher\n").body, "@@@ teacher\n");
  assert.equal(splitFrontmatter("​# A").body, "# A");
});

test("a leading invisible mark does not hide the block", () => {
  const { body, properties } = splitFrontmatter("﻿---\na: b\n---\n@@@ teacher\n");
  assert.equal(body, "@@@ teacher\n");
  assert.deepEqual(properties, [["a", "b"]]);
});

test("CRLF line endings and trailing blanks on the fence lines do not matter", () => {
  const { body, properties } = splitFrontmatter("--- \r\na: 1\r\nb: x\r\n---\t\r\n@@@ teacher\r\nBody\r\n");
  assert.equal(body, "@@@ teacher\r\nBody\r\n");
  assert.equal(body.split("\n")[0].replace(/\r$/, ""), "@@@ teacher");
  assert.deepEqual(properties, [
    ["a", 1],
    ["b", "x"],
  ]);
});

test("a closing line at the end of the file leaves an empty body", () => {
  assert.deepEqual(splitFrontmatter("---\na: b\n---"), { body: "", properties: [["a", "b"]] });
});

test("an empty block is stripped and yields no properties, silently", () => {
  let result;
  assert.deepEqual(warnings(() => (result = splitFrontmatter("---\n---\n# A\n", "e.md"))), []);
  assert.deepEqual(result, { body: "# A\n", properties: null });
});

test("broken YAML is stripped, yields no properties, and is logged with the path", () => {
  let result;
  const logged = warnings(() => {
    result = splitFrontmatter("---\nthemen: [unclosed\n---\n# Body\n", "homework/broken.md");
  });
  assert.deepEqual(result, { body: "# Body\n", properties: null });
  assert.equal(logged.length, 1);
  assert.match(logged[0], /homework\/broken\.md/);
});

test("a block that is not a mapping is stripped and logged", () => {
  for (const block of ["- a\n- b", "just text"]) {
    let result;
    const logged = warnings(() => (result = splitFrontmatter(`---\n${block}\n---\nBody`, "n.md")));
    assert.deepEqual(result, { body: "Body", properties: null }, block);
    assert.equal(logged.length, 1, block);
  }
});

test("properties keep the order of the file", () => {
  const { properties } = splitFrontmatter("---\nz: 1\n10: ten\na: 2\n---\n");
  assert.deepEqual(properties.map(([name]) => name), ["z", "10", "a"]);
});

test("property values as search text: names left out, list items one per line", () => {
  const { properties } = splitFrontmatter(homework);
  assert.equal(
    propertyValuesText(properties),
    "4AHIF\n2026-11-10\n2026-12-08\nWMC4\n4AHIF - WMC4 - Hausübung 1\nQuarkus CDI\nREST"
  );
  assert.equal(propertyValuesText(null), "");
});
