/**
 * The coverage record, checked against the repository.
 *
 * No browser, no login, no server: this file only reads `test/coverage-map.json`
 * and the file system. It is what turns "a record naming a check file that no
 * longer exists is treated as a defect" into an actual failure instead of a good
 * intention.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const mapPath = path.join(projectRoot, "test", "coverage-map.json");
const map = JSON.parse(readFileSync(mapPath, "utf8"));

/** Every path the map names, with the entry it belongs to. */
function namedPaths() {
  const named = [];
  for (const [check, entry] of Object.entries(map.checks)) {
    named.push({ check, kind: "check file", value: check });
    for (const guarded of entry.guards) named.push({ check, kind: "guarded file", value: guarded });
    for (const corpus of entry.corpus) named.push({ check, kind: "corpus file", value: corpus });
  }
  return named;
}

/** Every file in `test/` the runner would pick up, and every check module. */
function checkFilesOnDisk() {
  const files = readdirSync(path.join(projectRoot, "test"))
    .filter((entry) => entry.endsWith(".test.js"))
    .map((entry) => `test/${entry}`);
  const checksDir = path.join(projectRoot, "test", "checks");
  const modules = existsSync(checksDir)
    ? readdirSync(checksDir)
        .filter((entry) => entry.endsWith(".js"))
        .map((entry) => `test/checks/${entry}`)
    : [];
  return [...files, ...modules];
}

test("every path the coverage record names is a file that exists", () => {
  for (const named of namedPaths()) {
    assert.ok(
      existsSync(path.join(projectRoot, named.value)),
      `${mapPath} names ${named.value} as a ${named.kind} of ${named.check}, but there is no such file. ` +
        `Either the file moved and the record was not updated, or the entry should be deleted.`
    );
  }
});

test("every check the suite contains appears in the coverage record", () => {
  for (const file of checkFilesOnDisk()) {
    assert.ok(
      file in map.checks,
      `${file} is part of the suite but is not in ${mapPath}. A change that adds a check updates the record in the same change.`
    );
  }
});

test("the coverage record names no check that is gone", () => {
  const onDisk = new Set(checkFilesOnDisk());
  for (const check of Object.keys(map.checks)) {
    assert.ok(
      onDisk.has(check),
      `${mapPath} names ${check}, which no longer exists. A record naming a check file that is gone is a defect.`
    );
  }
});

/**
 * Checks under `test/checks/` that read no corpus by nature — Keycloak account
 * and directory data, not `md/` content — so an empty `corpus` is not a check
 * somebody forgot to fill in. Named here rather than dropping the requirement
 * for every check in the directory, so a real content check that ends up with
 * an empty `corpus` still fails loudly.
 */
const corpusExemptChecks = new Set(["test/checks/directory-search.js"]);

test("every entry says what it guards and what it reads", () => {
  for (const [check, entry] of Object.entries(map.checks)) {
    assert.ok(
      typeof entry.what === "string" && entry.what.length > 0,
      `${check} should say what it covers`
    );
    assert.ok(Array.isArray(entry.guards), `${check} should list the source files it guards`);
    assert.ok(Array.isArray(entry.corpus), `${check} should list the corpus files it reads`);
    if (check.startsWith("test/checks/")) {
      assert.ok(
        entry.guards.length > 0,
        `${check} is a content check and should name the source files it guards`
      );
      if (!corpusExemptChecks.has(check)) {
        assert.ok(
          entry.corpus.length > 0,
          `${check} is a content check and should name the corpus files it reads`
        );
      }
    }
  }
});

// A file under `md/` that an ignore rule excludes exists only in the working
// tree it was written in: every other checkout verifies a corpus without it,
// and a check that reads it fails there for no visible reason. The author who
// has the file is the only one who can see the mistake, so it is caught here,
// before a commit, rather than by the check that reads the file elsewhere.
test("no file under md/ is excluded from version control", (t) => {
  const listed = spawnSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "--", "md/"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (listed.error || listed.status !== 0) {
    t.skip(`git could not list the ignored files of md/ here: ${listed.error?.message ?? listed.stderr.trim()}`);
    return;
  }
  const ignored = listed.stdout.split("\n").filter(Boolean);
  assert.deepEqual(
    ignored,
    [],
    `these files under md/ are ignored by git, so no other checkout has them: ${ignored.join(", ")}. ` +
      "Add a negated rule for each to .gitignore, or move it out of md/."
  );
});
