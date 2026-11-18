/**
 * Conventions the browser checks follow, checked against their source.
 *
 * No browser, no login, no server: this file only reads the check files. It
 * turns "every click goes through the harness's `click`" and "every
 * navigation goes through the harness's `openPage`" from rules in
 * docs-testing.md into failures that name the file and line breaking them.
 *
 * Why the rule exists: `page.click(selector)` resolves the selector once and
 * clicks that node. When the client script redraws the element right after the
 * page loads, the node is detached or has no box yet, and the check fails or
 * passes depending on which of the two was faster. The harness's `click`
 * waits for an element that is attached, visible and still, and re-resolves it.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

/** `page.click(`, `teacher.page.click(`, `frame.click(` and the like: a direct click on a page or frame. */
const directClick = /\b(?:\w+\.)*(?:page|frame)\.click\(/;

/** A line that is only a comment, where the call may be named without being made. */
const commentLine = /^\s*(?:\/\/|\/?\*)/;

/** This file, whose fixture names the calls it looks for. */
const self = `test/${path.basename(import.meta.filename)}`;

/** Every file a browser check's clicks live in: the test files, the check modules and the harness. */
function browserCheckFiles() {
  const testDir = path.join(projectRoot, "test");
  const checksDir = path.join(testDir, "checks");
  return [
    ...readdirSync(testDir)
      .filter((entry) => entry.endsWith(".test.js"))
      .filter((entry) => `test/${entry}` !== self)
      .map((entry) => `test/${entry}`),
    ...readdirSync(checksDir)
      .filter((entry) => entry.endsWith(".js"))
      .map((entry) => `test/checks/${entry}`),
    "test/harness.js",
  ];
}

/** The lines of `source` that click a page or frame directly, as `file:line: text`. */
function directClicks(file, source) {
  return source
    .split("\n")
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => !commentLine.test(text) && directClick.test(text))
    .map(({ text, line }) => `${file}:${line}: ${text.trim()}`);
}

test("the scan finds a direct click and passes over a call through the harness", () => {
  const source = [
    'await click(page, ".ok");',
    "// page.click(selector) is what this replaces",
    'await teacher.page.click(".planted");',
    'await page.mouse.click(1, 1);',
  ].join("\n");
  assert.deepEqual(directClicks("fixture.js", source), ['fixture.js:3: await teacher.page.click(".planted");']);
});

test("no browser check clicks a page or frame directly instead of through the harness's click", () => {
  const found = browserCheckFiles().flatMap((file) =>
    directClicks(file, readFileSync(path.join(projectRoot, file), "utf8"))
  );
  assert.deepEqual(
    found,
    [],
    `click through the harness's \`click(page, selector)\`, which waits for an actionable element:\n${found.join("\n")}`
  );
});

/**
 * `page.goto(`, `student.page.goto(` and the like: a navigation outside the
 * harness. `page.goto` resolves once the document has loaded, before the
 * client script has filled or shown the page, so a check that reads or clicks
 * right after it races the script. The harness's `openPage` waits until the
 * element the check needs is shown.
 */
const directGoto = /\b(?:\w+\.)*page\.goto\(/;

/** The lines of `source` that navigate a page directly, as `file:line: text`. */
function directGotos(file, source) {
  return source
    .split("\n")
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => !commentLine.test(text) && directGoto.test(text))
    .map(({ text, line }) => `${file}:${line}: ${text.trim()}`);
}

test("the scan finds a direct navigation and passes over one through the harness", () => {
  const source = [
    'await openPage(student, "/exam/my", ".sl-exam-results");',
    "// page.goto(address) is what this replaces",
    'await teacher.page.goto(`${applicationUrl}/exam/`, { waitUntil: "domcontentloaded" });',
    'await keycloak.goto(endSessionUrl());',
  ].join("\n");
  assert.deepEqual(directGotos("fixture.js", source), [
    'fixture.js:3: await teacher.page.goto(`${applicationUrl}/exam/`, { waitUntil: "domcontentloaded" });',
  ]);
});

test("no browser check navigates a page directly instead of through the harness's openPage", () => {
  const found = browserCheckFiles()
    .filter((file) => file !== "test/harness.js")
    .flatMap((file) => directGotos(file, readFileSync(path.join(projectRoot, file), "utf8")));
  assert.deepEqual(
    found,
    [],
    `navigate through the harness's \`openPage(session, path, readySelector)\`, which waits until the page shows what the check needs:\n${found.join("\n")}`
  );
});
