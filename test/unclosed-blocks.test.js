/**
 * The corpus has no unclosed inline block (`content-verification`,
 * nest-permission-blocks D5).
 *
 * A block with no closing line of its own runs to the end of its document, at
 * every nesting level, and hides everything after its directive from everyone
 * it does not admit. A forgotten closing line - an inner one above all, since
 * the closing line that follows then closes the inner block and leaves the
 * outer one open - would only ever show as missing content. This check reads
 * every Markdown file of `md/` and names each such block with file and line.
 *
 * Offline: no browser, no login, no server. Blocks are found by the one block
 * grammar (`resolveInlineBlocks`), so marker lines inside a closed code fence or
 * a comment and `@@@` mentioned in running text do not count. The server's
 * `[Blocks] unclosed` log line covers content outside `md/`.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { commentRanges, parseFirstLineForPermissions, resolveInlineBlocks, splitFrontmatter } from "../obsidian.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const corpusRoot = path.join(projectRoot, "md");

/** `text` with its Obsidian comments blanked out, newlines kept, so line numbers stay true. */
function blankComments(text) {
  let out = text;
  for (const [start, end] of [...commentRanges(text)].reverse()) {
    out = out.slice(0, start) + out.slice(start, end).replace(/[^\n]/g, "") + out.slice(end);
  }
  return out;
}

/** The line of every unclosed block's directive, counted from 1 in the file as written, frontmatter included. */
function unclosedBlocks(raw) {
  const { body } = splitFrontmatter(raw);
  const offset = raw.split("\n").length - body.split("\n").length;
  const firstLine = body.split("\n", 1)[0].replace(/\r$/, "");
  const { blocks } = resolveInlineBlocks(blankComments(body), {
    fileDirective: parseFirstLineForPermissions(firstLine) !== null,
  });
  return blocks.filter((block) => !block.closed).map((block) => offset + block.fromLine);
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

test("no inline block in md/ is left unclosed", () => {
  const files = markdownFiles(corpusRoot);
  assert.ok(files.length > 0, `found no Markdown file under ${corpusRoot}`);
  const failures = [];
  for (const file of files) {
    for (const line of unclosedBlocks(readFileSync(path.join(corpusRoot, file), "utf8"))) {
      failures.push(`md/${file}:${line}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    "these blocks have no closing line of their own, so each runs to the end of its document and hides " +
      "everything after its directive from everyone it does not admit. A closing line closes the innermost " +
      "open block; add the missing `@@@`:\n" +
      failures.join("\n")
  );
});

test("a forgotten inner closing line is named by the outer block's line", () => {
  const raw = ["---", "title: x", "---", "Intro.", "@@@ 4bhif", "a", "@@@ #optional", "b", "@@@", "c"].join("\n");
  assert.deepEqual(unclosedBlocks(raw), [5]);
});

test("an unclosed marker line inside a closed code fence or a comment is not", () => {
  const raw = ["Intro.", "```", "@@@ teacher", "x", "```", "%% @@@ teacher %%", "@@@ #optional", "y", "@@@"].join("\n");
  assert.deepEqual(unclosedBlocks(raw), []);
});

test("a whole-file directive is no block, and so never unclosed", () => {
  assert.deepEqual(unclosedBlocks("@@@ teacher\n# Title\nText.\n"), []);
});
