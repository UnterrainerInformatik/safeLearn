/**
 * What an Obsidian comment is, decided by the one function that decides it
 * (`obsidian-comments`).
 *
 * Every read of a corpus file - the page views, the handout, the index, search
 * and the attachment check - calls `stripComments` right after the whole-file
 * directive has been decided. So the cases below are the cases for all of them.
 * They follow what Obsidian 1.15.0 showed in its reading view (the change's
 * design.md, "Reference behavior"): a `%%` that begins a line opens a block
 * comment up to the next `%%` or the end, any other `%%` closes on its own line
 * or is text, and `%%` in code is neither.
 *
 * No browser, no login, no server process. What the views, search and the
 * attachment check make of it is checked in the content suite against
 * `md/test-comments.md`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { stripComments } from "../obsidian.js";

const fence = "```";

test("an inline comment is removed with both marks, the spaces around it stay", () => {
  assert.equal(
    stripComments("Die Lösung ist %%Lösung: 42%% im Skript.\n"),
    "Die Lösung ist  im Skript.\n"
  );
});

test("a block comment between two paragraphs leaves both paragraphs and no note", () => {
  assert.equal(
    stripComments("Absatz eins.\n\n%%\nNotiz eins\nNotiz zwei\n%%\n\nAbsatz zwei.\n"),
    "Absatz eins.\n\n\n\nAbsatz zwei.\n"
  );
});

test("a block comment runs across blank lines and a rule, and ends at a mark mid-line", () => {
  const text = "Vor.\n\n%%start\n\nMitte\n\n---\n\nEnde x%% danach.\n\nNach.\n";
  assert.equal(stripComments(text), "Vor.\n\n danach.\n\nNach.\n");
});

test("a block comment opens after indentation, a blockquote marker or a list marker", () => {
  assert.equal(stripComments("  %%\nnote\n\nmore\n%%\nNach.\n"), "  \nNach.\n");
  assert.equal(stripComments("> Q\n> %%\n> note\n>\n> %%\n> R\n"), "> Q\n> \n> R\n");
  assert.equal(stripComments("- item\n  %%\n  note\n  %%\n- two\n"), "- item\n  \n- two\n");
  assert.equal(stripComments("1. %%note\n\nmore%% after\n"), "1.  after\n");
});

test("two comments on one line both go, the text between them stays", () => {
  assert.equal(stripComments("A %%x%% B %%y%% C\n"), "A  B  C\n");
});

test("an unclosed block comment removes everything from its mark to the end", () => {
  assert.equal(stripComments("Eins.\n\nZwei.\n\n%%\nnote\n\nmore\n"), "Eins.\n\nZwei.\n\n");
  assert.equal(stripComments("Eins.\n\n%%note text\n\nmore\n"), "Eins.\n\n");
});

test("an unpaired mark within a line is text, even when a later line holds a mark", () => {
  assert.equal(stripComments("Drei vor %%offen\n\nVier.\n"), "Drei vor %%offen\n\nVier.\n");
  assert.equal(stripComments("A %%x\ny%% B\n"), "A %%x\ny%% B\n");
  assert.equal(stripComments("Text %%a\n\nb%% after\n"), "Text %%a\n\nb%% after\n");
});

test("after a comment closes, the next mark is judged anew", () => {
  // Line-start pair, then an unpaired mark within the line: text.
  assert.equal(stripComments("%%note%% b %%c\n"), " b %%c\n");
  // An inline pair, then an unpaired one.
  assert.equal(stripComments("A %%n%% B %%c\n"), "A  B %%c\n");
  // An unpaired mark within a line, then a block comment on its own lines.
  assert.equal(
    stripComments("Text %%x\n\n%%\nnote\n%%\n\nNach.\n"),
    "Text %%x\n\n\n\nNach.\n"
  );
  // Text after the closing mark of a block stays.
  assert.equal(stripComments("%%\nnote\n%% trailing\n"), " trailing\n");
  // Four marks in a row are an empty comment.
  assert.equal(stripComments("A %%%%B\n"), "A B\n");
});

test("a block comment in the middle of a paragraph splits it", () => {
  assert.equal(stripComments("Text\n%%\nnote\n%%\nmore\n"), "Text\n\nmore\n");
});

test("a format string in a fenced block keeps its marks, and the paragraph after it stays", () => {
  const text = `${fence}java\nString.format("%.1f%%", rate);\n${fence}\n\nDanach sichtbar.\n`;
  assert.equal(stripComments(text), text);
});

test("inline code protects a mark", () => {
  const text = "Mit `%%` beginnt ein Kommentar.\n\nWeiter.\n";
  assert.equal(stripComments(text), text);
});

test("a code span in front of a mark does not make it a block opener", () => {
  const text = "`x` %%offen\n\nWeiter.\n";
  assert.equal(stripComments(text), text);
});

test("a tilde fence protects a mark", () => {
  const text = "~~~\nx %% y\n~~~\n\nDanach.\n";
  assert.equal(stripComments(text), text);
});

test("Mermaid's own comment inside its block is left to Mermaid", () => {
  const text = `${fence}mermaid\nflowchart LR\n%% layout note\nA-->B\n${fence}\n\nDanach.\n`;
  assert.equal(stripComments(text), text);
});

test("a fenced block inside a comment is removed with it", () => {
  const text = `Davor.\n\n%%\n${fence}\ncode in comment\n${fence}\nnote\n%%\n\nDanach.\n`;
  assert.equal(stripComments(text), "Davor.\n\n\n\nDanach.\n");
});

test("a stray backtick in a comment cannot mask a mark past a blank line", () => {
  // The backtick inside the comment pairs with the one in the next paragraph
  // only if a span may cross the blank line; it may not, so `y` closes the
  // comment and the next paragraph's code span stays.
  assert.equal(
    stripComments("Text %%note ` stray%% after\n\nmore `x` end\n"),
    "Text  after\n\nmore `x` end\n"
  );
  // Across a blank line, each mark is within its own line and unpaired: text.
  const text = "Text %%note with ` stray\n\nmore%% after `x` end\n";
  assert.equal(stripComments(text), text);
});

test("comments in a table cell, a list item and a heading are removed on their line", () => {
  assert.equal(stripComments("| x %%n%% | y |\n"), "| x  | y |\n");
  assert.equal(stripComments("- item %%n%%\n- two\n"), "- item \n- two\n");
  assert.equal(stripComments("# Head %%n%% tail\n"), "# Head  tail\n");
});

test("a text without marks outside code comes back identical", () => {
  for (const text of [
    "",
    "# Titel\n\nText mit 100 % Sicherheit.\n",
    "@@@ teacher\n# Titel\n",
    "Windows: `%%i` in einer Schleife.\n",
    `${fence}bat\nfor %%i in (*) do echo %%i\n${fence}\n`,
  ]) {
    assert.equal(stripComments(text), text);
  }
});

test("anything that is not a string is returned as is", () => {
  assert.equal(stripComments(undefined), undefined);
  assert.equal(stripComments(null), null);
});
