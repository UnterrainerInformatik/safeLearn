/**
 * The corpus names no unknown view marker (`content-verification`,
 * rename-view-markers-by-mechanism D5).
 *
 * An entry carrying the `#` prefix is a view marker, and exactly three are
 * known. Any other - a retired name such as `#exam`, a typo such as
 * `#variant-privat` - hides its block from every session (`role-resolution`),
 * so a leftover would only ever show as missing content. This check reads every
 * Markdown file of `md/` and names each one, with file, line and marker.
 *
 * Offline: no browser, no login, no server. Blocks are found by the one block
 * grammar (`resolveInlineBlocks`), so marker lines inside a closed code fence
 * and `@@@` mentioned in running text do not count, for free.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  commentRanges,
  parseFirstLineForPermissions,
  resolveInlineBlocks,
  splitFrontmatter,
} from "../obsidian.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const corpusRoot = path.join(projectRoot, "md");

/** The three view markers `hasRoles` resolves. */
const knownMarkers = new Set(["#variant-private", "#variant-public", "#optional"]);

/** The `#` tokens of one entry that are not a known marker. */
function unknownIn(entries) {
  const unknown = [];
  for (const { role } of entries) {
    for (const token of role.split(/\s+/)) {
      if (token.startsWith("#") && !knownMarkers.has(token)) unknown.push(token);
    }
  }
  return unknown;
}

/** `text` with its Obsidian comments blanked out, newlines kept, so line numbers stay true. */
function blankComments(text) {
  let out = text;
  for (const [start, end] of [...commentRanges(text)].reverse()) {
    out = out.slice(0, start) + out.slice(start, end).replace(/[^\n]/g, "") + out.slice(end);
  }
  return out;
}

/**
 * Every unknown view marker in one file's text: `{ line, marker }`, lines
 * counted from 1 in the file as written, frontmatter included.
 */
function unknownViewMarkers(raw) {
  const { body } = splitFrontmatter(raw);
  const offset = raw.split("\n").length - body.split("\n").length;
  const firstLine = body.split("\n", 1)[0].replace(/\r$/, "");
  const fileDirective = parseFirstLineForPermissions(firstLine);
  const found = [];
  if (fileDirective !== null) {
    for (const marker of unknownIn(fileDirective)) found.push({ line: offset + 1, marker });
  }
  const { blocks } = resolveInlineBlocks(blankComments(body), { fileDirective: fileDirective !== null });
  for (const block of blocks) {
    for (const marker of unknownIn(block.entries)) found.push({ line: offset + block.fromLine, marker });
  }
  return found;
}

function markdownFiles(dir, relative = "") {
  const files = [];
  for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const next = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...markdownFiles(dir, next));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(next);
  }
  return files.sort();
}

test("no directive in md/ names an unknown view marker", () => {
  const files = markdownFiles(corpusRoot);
  assert.ok(files.length > 0, `found no Markdown file under ${corpusRoot}`);
  const failures = [];
  for (const file of files) {
    const raw = readFileSync(path.join(corpusRoot, file), "utf8");
    for (const { line, marker } of unknownViewMarkers(raw)) failures.push(`md/${file}:${line}: ${marker}`);
  }
  assert.deepEqual(
    failures,
    [],
    "these directives name a view marker the server does not know, so their blocks are hidden from " +
      "everyone. Known: #variant-private, #variant-public, #optional; the retired names are " +
      "#exam → #variant-private, #practice → #variant-public, #answer → #optional " +
      "(node tools/rename-view-markers.mjs md):\n" +
      failures.join("\n")
  );
});

test("a test page still carrying a retired name is named with its line", () => {
  const raw = ["---", "title: x", "---", "Intro.", "@@@ #exam", "Solution.", "@@@", "@@@ 4ahif, #Answer", "a", "@@@"].join("\n");
  assert.deepEqual(unknownViewMarkers(raw), [
    { line: 5, marker: "#exam" },
    { line: 8, marker: "#answer" },
  ]);
});

test("a retired name as the whole-file directive is named", () => {
  assert.deepEqual(unknownViewMarkers("@@@ #practice\n# Title\n"), [{ line: 1, marker: "#practice" }]);
});

test("a retired name in a syntax example is not", () => {
  const raw = [
    "Die Musterlösung steht in den `@@@ #exam`-Blöcken.",
    "```",
    "@@@ #exam",
    "x",
    "@@@",
    "```",
    "%% @@@ #exam %%",
    "@@@ #variant-private",
    "Solution.",
    "@@@",
  ].join("\n");
  assert.deepEqual(unknownViewMarkers(raw), []);
});
