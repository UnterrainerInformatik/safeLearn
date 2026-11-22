#!/usr/bin/env node
/**
 * Renames the retired view markers in a content directory
 * (rename-view-markers-by-mechanism, design D6):
 *
 *   #exam     → #variant-private
 *   #practice → #variant-public
 *   #answer   → #optional
 *
 *   node tools/rename-view-markers.mjs <dir>           dry run: counts per file and per name
 *   node tools/rename-view-markers.mjs <dir> --write   rewrites the files
 *
 * A name is rewritten only where it stands after `@@@` on the same line: marker
 * lines (indented or not, inside a code fence or not) and `@@@ #exam`-style
 * mentions in running text or inline code, so a note that explains the syntax
 * stays correct. A bare `#exam` with no `@@@` before it on its line is left
 * alone, because in Obsidian that is a tag.
 *
 * After either run it lists every occurrence of an old name that is still in
 * the files (tags, prose), with file and line, to be judged by hand.
 *
 * Plain Node, no dependencies, any directory - not only `md/`.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The retired names and what each becomes. */
export const renames = Object.freeze({
  exam: "variant-private",
  practice: "variant-public",
  answer: "optional",
});

/** One retired name as a whole marker: `#exam`, not `#examples` or `#exam-x`. */
const oldName = /#(exam|practice|answer)(?![\w-])/gi;

/**
 * Rewrites the retired names in `text` where they follow `@@@` on their line.
 * Returns the new text and how many of each old name were rewritten.
 */
export function renameMarkers(text) {
  const counts = { exam: 0, practice: 0, answer: 0 };
  const lines = text.split("\n").map((line) => {
    const at = line.indexOf("@@@");
    if (at === -1) return line;
    const head = line.slice(0, at);
    const tail = line.slice(at).replace(oldName, (_match, name) => {
      const key = name.toLowerCase();
      counts[key] += 1;
      return `#${renames[key]}`;
    });
    return head + tail;
  });
  return { text: lines.join("\n"), counts };
}

/** Every occurrence of a retired name left in `text`: `{ line, name, text }`, lines from 1. */
export function remainingOccurrences(text) {
  const found = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(oldName)) {
      found.push({ line: index + 1, name: `#${match[1].toLowerCase()}`, text: line.replace(/\r$/, "") });
    }
  });
  return found;
}

/** Every `.md` file under `dir`, relative paths, sorted; dot-directories are skipped. */
export function markdownFiles(dir) {
  const files = [];
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const next = relative === "" ? entry.name : path.join(relative, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(next);
    }
  };
  walk("");
  return files.sort();
}

/** Runs the tool over `dir`; returns the per-file counts, the totals and the remaining occurrences. */
export function run(dir, { write = false } = {}) {
  const perFile = [];
  const totals = { exam: 0, practice: 0, answer: 0 };
  const remaining = [];
  for (const file of markdownFiles(dir)) {
    const absolute = path.join(dir, file);
    const before = readFileSync(absolute, "utf8");
    const { text, counts } = renameMarkers(before);
    const changed = counts.exam + counts.practice + counts.answer;
    if (changed > 0) {
      perFile.push({ file, counts });
      for (const key of Object.keys(totals)) totals[key] += counts[key];
      if (write) writeFileSync(absolute, text);
    }
    // What is left after the rewrite, whether or not it was written.
    for (const occurrence of remainingOccurrences(text)) remaining.push({ file, ...occurrence });
  }
  return { perFile, totals, remaining };
}

function main(argv) {
  const args = argv.filter((arg) => arg !== "--write");
  const write = args.length !== argv.length;
  if (args.length !== 1) {
    console.error("usage: node tools/rename-view-markers.mjs <dir> [--write]");
    return 2;
  }
  const dir = path.resolve(args[0]);
  const { perFile, totals, remaining } = run(dir, { write });
  console.log(write ? `Rewritten in ${dir}:` : `Dry run over ${dir} (nothing written; pass --write to apply):`);
  for (const { file, counts } of perFile) {
    const parts = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([name, n]) => `#${name} ${n}`);
    console.log(`  ${file}: ${parts.join(", ")}`);
  }
  console.log(
    `${perFile.length} files; #exam ${totals.exam}, #practice ${totals.practice}, #answer ${totals.answer}` +
      ` → #variant-private, #variant-public, #optional`
  );
  console.log(
    remaining.length === 0
      ? "No old name remains anywhere."
      : `${remaining.length} occurrence(s) of an old name remain${write ? "" : " after the rewrite"} (not after @@@ on their line; judge by hand):`
  );
  for (const { file, line, name, text } of remaining) console.log(`  ${file}:${line}: ${name}  ${text.trim()}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
