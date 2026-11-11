/**
 * The partial runs, checked against the full run.
 *
 * No browser, no login, no server: this file reads the test files and
 * `test/coverage-map.json` and calls the pure decisions of `tools/test-run.mjs`.
 * It is what keeps `npm run test:unit` and `npm run test:browser` from drifting
 * away from `npm test`, and what pins the planning rules of
 * `npm run test:changed`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { classify, contentSuite, plan, testFiles } from "../tools/test-run.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const map = JSON.parse(readFileSync(path.join(projectRoot, "test", "coverage-map.json"), "utf8"));
const groups = classify(projectRoot);

test("the unit and browser groups together are exactly the full run", () => {
  const full = testFiles(projectRoot);
  assert.deepEqual([...groups.unit, ...groups.browser].sort(), full);
  const overlap = groups.unit.filter((file) => groups.browser.includes(file));
  assert.deepEqual(overlap, [], `these files are in both groups: ${overlap.join(", ")}`);
});

test("the browser group holds the files that use the server harness", () => {
  for (const file of ["test/smoke.test.js", "test/content.test.js", "test/exam.test.js", "test/anonymous.test.js"]) {
    assert.ok(groups.browser.includes(file), `${file} uses the server harness and belongs to the browser group`);
  }
  assert.ok(groups.unit.includes("test/test-run.test.js"), "this file needs no browser and belongs to the unit group");
});

test("no unit file starts a browser", () => {
  for (const file of groups.unit) {
    const source = readFileSync(path.join(projectRoot, file), "utf8");
    assert.ok(
      !/\bfrom\s+["']puppeteer["']|import\(\s*["']puppeteer["']\s*\)/.test(source),
      `${file} imports puppeteer but is classified as a unit file. It reaches the browser some other way ` +
        `than through ./harness.js, so the classification in tools/test-run.mjs misses it.`
    );
  }
});

test("a single content module selects only that module", () => {
  const planned = plan(["test/checks/rendering.js"], map);
  assert.deepEqual(planned.files, [contentSuite]);
  assert.deepEqual(planned.modules, ["rendering"]);
  assert.deepEqual(planned.unguarded, []);
});

test("the server harness selects the whole content suite and every other harness user", () => {
  const planned = plan(["test/harness.js"], map);
  assert.equal(planned.modules, "all");
  for (const file of groups.browser) {
    assert.ok(planned.files.includes(file), `a change to test/harness.js should run ${file}`);
  }
});

test("a corpus file selects the checks that read it", () => {
  const corpus = "md/test-perms.md";
  const readers = Object.entries(map.checks)
    .filter(([, entry]) => entry.corpus.includes(corpus))
    .map(([key]) => key);
  assert.ok(readers.length > 0, `${corpus} should be read by at least one check`);
  const planned = plan([corpus], map);
  for (const reader of readers) {
    const module = reader.match(/^test\/checks\/(.+)\.js$/);
    if (module) assert.ok(planned.modules.includes(module[1]), `${reader} reads ${corpus} and should run`);
    else assert.ok(planned.files.includes(reader), `${reader} reads ${corpus} and should run`);
  }
  assert.notEqual(planned.modules, "all", "a corpus file read by modules selects those modules, not the whole suite");
});

test("a file no check guards is named, and an empty plan runs nothing", () => {
  const planned = plan(["no/such/file.txt"], map);
  assert.deepEqual(planned.files, []);
  assert.deepEqual(planned.modules, []);
  assert.deepEqual(planned.unguarded, ["no/such/file.txt"]);
});

test("a changed test file runs itself, once", () => {
  const planned = plan(["test/frontmatter.test.js", "test/frontmatter.test.js"], map);
  assert.deepEqual(planned.files, ["test/frontmatter.test.js"]);
  assert.deepEqual(planned.unguarded, []);
});

test("a check file not in the record yet still runs itself", () => {
  const empty = { checks: {} };
  assert.deepEqual(plan(["test/brand-new.test.js"], empty).files, ["test/brand-new.test.js"]);
  const module = plan(["test/checks/brand-new.js"], empty);
  assert.deepEqual(module.files, [contentSuite]);
  assert.deepEqual(module.modules, ["brand-new"]);
});
