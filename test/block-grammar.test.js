/**
 * Where an inline `@@@` block begins and ends, decided by the code that decides
 * it - on both sides (`permission-block-grammar`).
 *
 * The server hides what a block withholds and the companion plugin frames the
 * same block for the teacher who wrote it. The plugin is only worth anything if
 * the two agree, and they once did not: the server ended a block at the next
 * `@@@` anywhere in the text, the plugin at the next line holding nothing else,
 * and a teacher note mentioning `` `@@@ #exam` `` in a sentence showed a class
 * every model solution of a test. So the table below is not checked against a
 * reading of either implementation. Each row states the block boundaries of one
 * document, as line ranges, and both the server's `resolveInlineBlocks` and the
 * plugin's `resolveBlocks` are held to it. A row one side reads differently fails
 * here, naming that side.
 *
 * Line ranges because that is the unit both sides share: the plugin walks lines,
 * the server offsets. What a reader is then shown of a block is checked against
 * the server alone, in `test/obsidian-syntax.test.js` and
 * `test/attachments.test.js`.
 *
 * Rows that begin with a line of text do so on purpose: a first line starting
 * with `@@@` is the whole-file directive, not a block, and has a row of its own.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFirstLineForPermissions, resolveInlineBlocks } from "../obsidian.js";
import { pluginFunction, pluginModule } from "./obsidian/harness.js";

const fence = "```";
const tilde = "~~~";
const doc = (...lines) => lines.join("\n");

/**
 * The incident document: a test gated to teachers and one class, a teacher note
 * that names the `@@@ #exam` blocks in running text, and six questions each
 * followed by its solution block.
 */
function incident() {
  const lines = [
    "@@@ teacher, 3bhif[2026-11-16T08:00:00 to 2026-11-16T10:00:00]",
    "# Test 1",
    "",
    "@@@ teacher",
    "Die Musterlösung steht in den `@@@ #exam`-Blöcken.",
    "@@@",
  ];
  const blocks = [{ from: 4, to: 6, closed: true }];
  for (let n = 1; n <= 6; n++) {
    lines.push("", `## Aufgabe ${n}`, `Frage ${n}?`, "@@@ #exam", `Lösung ${n}`, "@@@");
    const opener = lines.length - 2;
    blocks.push({ from: opener, to: opener + 2, closed: true });
  }
  return { document: lines.join("\n"), blocks };
}

const rows = [
  {
    why: "`@@@` in a sentence inside a block is text; the block ends at its own closing line",
    document: doc(
      "Intro.",
      "@@@ teacher",
      "Die Musterlösung steht in den `@@@ #exam`-Blöcken.",
      "@@@",
      "After."
    ),
    blocks: [{ from: 2, to: 4, closed: true }],
  },
  {
    why: "`@@@` in the middle of a line outside any block opens nothing",
    document: doc("Intro.", "Syntax: `@@@ 4ahif` … `@@@`", "After."),
    blocks: [],
  },
  {
    why: "a line beginning with inline code that holds `@@@` is no marker",
    document: doc("Intro.", "`@@@ #exam` marks a solution.", "`@@@`", "After."),
    blocks: [],
  },
  {
    why: "marker lines in a closed backtick fence are code",
    document: doc("Example:", fence, "@@@ teacher", "secret", "@@@", fence, "After."),
    blocks: [],
  },
  {
    why: "marker lines in a closed tilde fence are code",
    document: doc("Example:", tilde, "@@@ teacher", "secret", "@@@", tilde, "After."),
    blocks: [],
  },
  {
    why: "a longer fence is closed only by one at least as long, and an info string is allowed",
    document: doc("Example:", "````markdown", "@@@ teacher", fence, "@@@", "````", "After."),
    blocks: [],
  },
  {
    why: "a fence inside a block hides its markers from the block, too",
    document: doc("Intro.", "@@@ #exam", "Solution:", fence, "@@@ teacher", "@@@", fence, "More.", "@@@", "After."),
    blocks: [{ from: 2, to: 9, closed: true }],
  },
  {
    why: "an unclosed fence protects nothing, so the block after it is a block",
    document: doc("Intro.", fence, "never closed", "@@@ #exam", "sol", "@@@", "After."),
    blocks: [{ from: 4, to: 6, closed: true }],
  },
  {
    why: "a stray closing line closes nothing and does not shift the block after it",
    document: doc("Intro.", "@@@", "Text.", "@@@ #exam", "sol", "@@@"),
    blocks: [{ from: 4, to: 6, closed: true }],
  },
  {
    why: "an opener inside an open block opens nothing; the blocks after it stay where they are",
    document: doc("Intro.", "@@@ 4ahif", "Q", "@@@ #exam", "sol", "@@@", "After.", "@@@ teacher", "t", "@@@"),
    blocks: [
      { from: 2, to: 6, closed: true },
      { from: 8, to: 10, closed: true },
    ],
  },
  {
    why: "a block that is never closed runs to the end of the document",
    document: doc("Intro.", "@@@ teacher", "text", "more"),
    blocks: [{ from: 2, to: 4, closed: false }],
  },
  {
    why: "a block that is never closed counts the line after a final newline as its last",
    document: doc("Intro.", "@@@ teacher", "text", ""),
    blocks: [{ from: 2, to: 4, closed: false }],
  },
  {
    why: "indented markers in a list item open and close a block, spaces or a tab",
    document: doc("- item", "  @@@ #exam", "  sol", "  @@@", "- next", "\t@@@ teacher", "\tt", "\t@@@  "),
    blocks: [
      { from: 2, to: 4, closed: true },
      { from: 6, to: 8, closed: true },
    ],
  },
  {
    why: "CRLF line endings read as LF ones",
    document: ["Intro.", "@@@ teacher", "Die Musterlösung steht in den `@@@ #exam`-Blöcken.", "@@@", "After."].join("\r\n"),
    blocks: [{ from: 2, to: 4, closed: true }],
  },
  {
    why: "a first line beginning with `@@@` is the whole-file directive and no block",
    document: doc("@@@ 4ahif", "@@@ #exam", "sol", "@@@", "After."),
    blocks: [{ from: 2, to: 4, closed: true }],
  },
  {
    why: "the incident: six solutions after a teacher note naming `@@@ #exam` in running text",
    ...incident(),
  },
];

/** The server's reading: the callers split the whole-file directive off first, the resolver is told so. */
function serverBlocks(document) {
  const firstLine = document.split("\n", 1)[0].replace(/\r$/, "");
  const { blocks } = resolveInlineBlocks(document, {
    fileDirective: parseFirstLineForPermissions(firstLine) !== null,
  });
  return blocks.map((block) => ({ from: block.fromLine, to: block.toLine, closed: block.closed }));
}

async function pluginBlocks() {
  const context = await pluginModule();
  const resolveBlocks = pluginFunction(context, "resolveBlocks");
  const linesOfText = pluginFunction(context, "linesOfText");
  return (document) =>
    resolveBlocks(linesOfText(document))
      .blocks.filter((block) => block.kind === "permission")
      .map((block) => ({ from: block.from, to: block.to, closed: block.closed }));
}

test("the server resolves every document of the table to the blocks the table states", () => {
  for (const row of rows) {
    assert.deepEqual(serverBlocks(row.document), row.blocks, `server: ${row.why}\n${JSON.stringify(row.document)}`);
  }
});

test("the plugin resolves every document of the table to the blocks the table states", async () => {
  const resolve = await pluginBlocks();
  for (const row of rows) {
    // Plain objects across the vm boundary, so `deepEqual` compares values, not realms.
    const found = JSON.parse(JSON.stringify(resolve(row.document)));
    assert.deepEqual(found, row.blocks, `plugin: ${row.why}\n${JSON.stringify(row.document)}`);
  }
});
