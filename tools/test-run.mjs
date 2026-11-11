#!/usr/bin/env node
/**
 * Runs part of the verification: one of the two groups, or the checks that
 * guard the files a change touched.
 *
 *   node tools/test-run.mjs --group unit       every test file that needs no server and no browser
 *   node tools/test-run.mjs --group browser    every test file that uses the server harness
 *   node tools/test-run.mjs [--dry-run] [--] [paths…]
 *                                              the checks test/coverage-map.json names for the
 *                                              changed files (or for the paths given)
 *
 * `npm test` stays the full run. This tool only decides which part of it to
 * start, and its decisions — `classify` and `plan` — are pure exported
 * functions that `test/test-run.test.js` checks against fixed inputs.
 *
 * It lives in `tools/` rather than `test/` so that `test/coverage.test.js`
 * does not count it as a check.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(import.meta.dirname, "..");

/** The environment variable `test/content.test.js` reads its module selection from. */
export const checksVariable = "SAFELEARN_TEST_CHECKS";

/** The content suite, which runs a selection of its modules when `checksVariable` is set. */
export const contentSuite = "test/content.test.js";

const harnessImport = /\bfrom\s+["']\.\/harness\.js["']/;
const moduleKey = /^test\/checks\/([^/]+)\.js$/;
const testFileKey = /^test\/[^/]+\.test\.js$/;

/** Every file the full run picks up: what `test/*.test.js` matches, sorted. */
export function testFiles(root = defaultRoot) {
  return readdirSync(path.join(root, "test"))
    .filter((entry) => entry.endsWith(".test.js"))
    .sort()
    .map((entry) => `test/${entry}`);
}

/**
 * Splits the full run into the two groups. A test file belongs to the browser
 * group if it imports the server harness `./harness.js`; every other file is a
 * unit file. Computed from the files every time, so a new file lands in a group
 * without anyone assigning it.
 */
export function classify(root = defaultRoot) {
  const unit = [];
  const browser = [];
  for (const file of testFiles(root)) {
    const source = readFileSync(path.join(root, file), "utf8");
    (harnessImport.test(source) ? browser : unit).push(file);
  }
  return { unit, browser };
}

/**
 * Turns a list of changed paths (repository-relative, forward slashes) into a
 * plan: the test files to run, the content modules to select (`"all"` for the
 * whole content suite), the paths no check guards, and why each file runs.
 *
 * A path selects a check key if it is the key itself, one of its `guards`, or
 * one of its `corpus` files. A check file that is not in the map yet still
 * selects itself.
 */
export function plan(changedPaths, map) {
  const checks = map?.checks ?? {};
  const reasons = new Map();
  const note = (key, why) => {
    if (!reasons.has(key)) reasons.set(key, []);
    if (!reasons.get(key).includes(why)) reasons.get(key).push(why);
  };

  const modules = new Set();
  let wholeContent = false;
  const files = new Set();
  const unguarded = [];

  const select = (key, changed) => {
    const asModule = key.match(moduleKey);
    if (asModule) {
      // Rule 1: a module key selects that content module.
      modules.add(asModule[1]);
      note(key, changed);
    } else if (key === contentSuite) {
      // Rule 2: a module file selects itself only, even though the content
      // suite lists it among its guards.
      if (moduleKey.test(changed) && changed !== key) return false;
      wholeContent = true;
      note(key, changed);
    } else {
      // Rule 3: any other key is a test file to run.
      files.add(key);
      note(key, changed);
    }
    return true;
  };

  for (const changed of [...new Set(changedPaths)]) {
    let selected = false;
    for (const [key, entry] of Object.entries(checks)) {
      const hit = changed === key || (entry.guards ?? []).includes(changed) || (entry.corpus ?? []).includes(changed);
      if (hit && select(key, changed)) selected = true;
    }
    // A changed check file runs itself, mapped yet or not.
    if (!selected && !(changed in checks) && (moduleKey.test(changed) || testFileKey.test(changed))) {
      selected = select(changed, changed);
    }
    // Rule 5: report what nothing guards.
    if (!selected) unguarded.push(changed);
  }

  // Rule 4: the content suite runs whole, or with the selected modules.
  if (wholeContent || modules.size > 0) files.add(contentSuite);
  const content = wholeContent ? "all" : [...modules].sort();
  if (wholeContent) {
    for (const key of [...reasons.keys()]) {
      if (moduleKey.test(key)) {
        for (const why of reasons.get(key)) note(contentSuite, why);
        reasons.delete(key);
      }
    }
  } else if (modules.size > 0) {
    const via = [];
    for (const key of [...reasons.keys()]) {
      if (moduleKey.test(key)) {
        via.push(`${key.match(moduleKey)[1]} ← ${reasons.get(key).join(", ")}`);
        reasons.delete(key);
      }
    }
    reasons.set(contentSuite, via);
  }

  return {
    files: [...files].sort(),
    modules: files.has(contentSuite) ? content : [],
    unguarded,
    reasons: Object.fromEntries([...reasons.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * The changed paths and where they came from: the paths given explicitly, else
 * the working tree against `HEAD` plus untracked files, else the last commit.
 * Returns `{ paths: null }` when there is nothing to compare against.
 */
export function changedPaths(root = defaultRoot, explicit = []) {
  if (explicit.length > 0) {
    const paths = explicit.map((given) => {
      const relative = path.relative(root, path.resolve(process.cwd(), given));
      return relative.split(path.sep).join("/");
    });
    return { source: "the paths given", paths };
  }
  const tracked = git(root, ["diff", "--name-only", "HEAD"]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]);
  if (tracked === null || untracked === null) {
    return { source: "git (not available here)", paths: null };
  }
  const working = [...new Set([...tracked, ...untracked])];
  if (working.length > 0) return { source: "the working tree against HEAD, untracked files included", paths: working };
  const last = git(root, ["diff", "--name-only", "HEAD~1", "HEAD"]);
  if (last === null) return { source: "the last commit (HEAD~1 does not exist)", paths: null };
  return { source: "the last commit (HEAD~1..HEAD), the working tree is clean", paths: last };
}

/** Starts `node --test` on `files`, inheriting the terminal, and returns its exit code. */
function runNodeTest(root, files, env = {}) {
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
    cwd: root,
    stdio: "inherit",
    env: Object.fromEntries(
      Object.entries({ ...process.env, ...env }).filter(([, value]) => value !== undefined)
    ),
  });
  if (result.error) {
    console.error(`could not start node --test: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function describePlan(source, planned, dryRun) {
  const lines = [`changed files taken from ${source}.`];
  if (planned.files.length === 0) {
    lines.push("no changed file is guarded by any check — nothing to run.");
  } else {
    lines.push(dryRun ? "would run:" : "running:");
    for (const file of planned.files) {
      let label = file;
      if (file === contentSuite) {
        label += planned.modules === "all" ? " (every module)" : ` (${checksVariable}=${planned.modules.join(",")})`;
      }
      lines.push(`  - ${label}`);
      for (const why of planned.reasons[file] ?? []) lines.push(`      because of ${why}`);
    }
  }
  if (planned.unguarded.length > 0) {
    lines.push("guarded by no check:");
    for (const file of planned.unguarded) lines.push(`  - ${file}`);
  }
  return lines.join("\n");
}

function main(argv) {
  const root = defaultRoot;
  const args = [...argv];
  let dryRun = false;
  let group = null;
  const explicit = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") {
      explicit.push(...args.slice(index + 1));
      break;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--group") {
      group = args[++index];
    } else if (arg.startsWith("--group=")) {
      group = arg.slice("--group=".length);
    } else if (arg.startsWith("--")) {
      console.error(`unknown option ${arg}`);
      return 2;
    } else {
      explicit.push(arg);
    }
  }

  if (group !== null) {
    const groups = classify(root);
    if (!(group in groups)) {
      console.error(`unknown group "${group}". Known groups: ${Object.keys(groups).join(", ")}.`);
      return 2;
    }
    const files = groups[group];
    if (dryRun) {
      console.log(`the ${group} group:\n${files.map((file) => `  - ${file}`).join("\n")}`);
      return 0;
    }
    return runNodeTest(root, files, { [checksVariable]: undefined });
  }

  const { source, paths } = changedPaths(root, explicit);
  if (paths === null) {
    console.log(`nothing to compare against: ${source}. Nothing to run.`);
    return 0;
  }
  const map = JSON.parse(readFileSync(path.join(root, "test", "coverage-map.json"), "utf8"));
  const planned = plan(paths, map);

  // A deleted check cannot run; say so rather than let node --test fail on it.
  const gone = planned.files.filter((file) => !existsSync(path.join(root, file)));
  planned.files = planned.files.filter((file) => !gone.includes(file));
  if (Array.isArray(planned.modules)) {
    const missing = planned.modules.filter((name) => !existsSync(path.join(root, "test", "checks", `${name}.js`)));
    gone.push(...missing.map((name) => `test/checks/${name}.js`));
    planned.modules = planned.modules.filter((name) => !missing.includes(name));
    if (planned.modules.length === 0) planned.files = planned.files.filter((file) => file !== contentSuite);
  }

  console.log(describePlan(source, planned, dryRun));
  if (gone.length > 0) console.log(`deleted, so not run: ${gone.join(", ")}`);
  if (dryRun || planned.files.length === 0) return 0;

  // The whole content suite runs with the variable removed, even if the shell set it.
  const env = {
    [checksVariable]: Array.isArray(planned.modules) && planned.files.includes(contentSuite)
      ? planned.modules.join(",")
      : undefined,
  };
  console.log("");
  return runNodeTest(root, planned.files, env);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
