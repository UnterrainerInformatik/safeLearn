/**
 * The interface catalogs against the source tree (`ui-language`, design.md,
 * D8): both catalogs hold the same keys, every key the code passes to `t()`
 * is in the English one, no key is left that nothing uses, and no date or
 * number is formatted outside `i18n/format.js`.
 *
 * No browser, no login, no server: this file only reads `i18n/*.json` and the
 * source files. A key is found where the code writes `t("…")` with a literal,
 * and for refusals wherever an `"exam.errors.…"` literal stands; a key built
 * at run time is allowed only from the list below, which names every key it
 * can become.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { languages } from "../i18n/t.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

/**
 * Keys the code builds from a closed set, by the exact expression it passes
 * to `t()`, with every key that expression can become.
 */
const computedKeys = {
  // readableMessage() in exam/classes.js: the key a refusal or a problem was
  // raised with, each found as an "exam.errors.…" literal where it is raised.
  "item.key": [],
};

function catalog(lang) {
  return JSON.parse(readFileSync(path.join(projectRoot, "i18n", `${lang}.json`), "utf8"));
}

/** Every text's key in a nested catalog. */
function leafKeys(tree, prefix = "") {
  return Object.entries(tree).flatMap(([key, value]) =>
    value !== null && typeof value === "object" ? leafKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  );
}

/** The files whose `t()` calls are checked: the app's own code, not its tests. */
function sourceFiles() {
  const files = ["app.js", "obsidian.js", "obsidian-page.js", "utils.js"];
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(projectRoot, dir), { withFileTypes: true })) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "migrations") walk(relative);
      } else if (/\.m?js$/.test(entry.name)) {
        files.push(relative);
      }
    }
  };
  walk("exam");
  walk("i18n");
  // Comments describe calls (`t(key, params)`) without making them. Emptied
  // rather than removed, so a finding's line number stays right.
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, "")).replace(/^\s*\/\/.*$/gm, "");
  return files.map((file) => ({ file, text: code(readFileSync(path.join(projectRoot, file), "utf8")) }));
}

/** `{ literal: [{ file, key }], computed: [{ file, expression }] }` over the sources. */
function calls() {
  const literal = [];
  const computed = [];
  for (const { file, text } of sourceFiles()) {
    // The lookup itself, whose own documentation writes `t(key, params)`.
    if (file.startsWith(`i18n${path.sep}`)) continue;
    for (const match of text.matchAll(/(?<![\w$])t\(\s*([^\s,)][^,)]*)/g)) {
      const argument = match[1].trim();
      const plain = /^(["'`])([\w.]+)\1$/.exec(argument);
      if (plain) literal.push({ file, key: plain[2] });
      else computed.push({ file, expression: argument });
    }
    // A refusal or a problem names its text by key where it is raised
    // (`new InvalidInputError("exam.errors.…")`, `problemAt(field, "exam.errors.…")`)
    // and is translated where it is answered, so the key stands alone there.
    for (const match of text.matchAll(/(["'`])(exam\.errors\.[\w.]+)\1/g)) {
      literal.push({ file, key: match[2] });
    }
  }
  return { literal, computed };
}

const catalogs = Object.fromEntries(languages.map((lang) => [lang, catalog(lang)]));
const keysOf = Object.fromEntries(languages.map((lang) => [lang, new Set(leafKeys(catalogs[lang]))]));

/** The catalog keys a used key stands for: itself, or its plural forms. */
function standsFor(key, keys) {
  if (keys.has(key)) return [key];
  return [...keys].filter((candidate) => candidate.startsWith(`${key}_`) && /^(zero|one|two|few|many|other)$/.test(candidate.slice(key.length + 1)));
}

test("both catalogs hold the same keys", () => {
  const [first, ...rest] = languages;
  for (const lang of rest) {
    const missing = [...keysOf[first]].filter((key) => !keysOf[lang].has(key));
    const extra = [...keysOf[lang]].filter((key) => !keysOf[first].has(key));
    assert.deepEqual(missing, [], `i18n/${lang}.json lacks keys i18n/${first}.json has`);
    assert.deepEqual(extra, [], `i18n/${lang}.json has keys i18n/${first}.json lacks`);
  }
});

test("no text in a catalog is empty", () => {
  for (const lang of languages) {
    const empty = [...keysOf[lang]].filter((key) => {
      const value = key.split(".").reduce((node, segment) => node[segment], catalogs[lang]);
      return typeof value !== "string" || value.trim() === "";
    });
    assert.deepEqual(empty, [], `i18n/${lang}.json holds empty or non-text values`);
  }
});

test("every key the code uses is in the English catalog", () => {
  const missing = calls()
    .literal.filter(({ key }) => standsFor(key, keysOf.en).length === 0)
    .map(({ file, key }) => `${file}: ${key}`);
  assert.deepEqual(missing, [], "these keys are in no catalog; add them to i18n/en.json and i18n/de.json");
});

test("a key built at run time comes from the list of computed keys", () => {
  const unlisted = calls()
    .computed.filter(({ expression }) => !Object.hasOwn(computedKeys, expression))
    .map(({ file, expression }) => `${file}: t(${expression})`);
  assert.deepEqual(unlisted, [], "pass t() a literal key, or list the expression with every key it becomes in computedKeys");
  for (const [expression, keys] of Object.entries(computedKeys)) {
    for (const key of keys) {
      assert.ok(standsFor(key, keysOf.en).length > 0, `computedKeys lists ${key} for ${expression}, but no catalog has it`);
    }
  }
});

test("every key in the catalogs is used", () => {
  const used = new Set();
  const { literal, computed } = calls();
  for (const { key } of literal) for (const found of standsFor(key, keysOf.en)) used.add(found);
  for (const { expression } of computed) {
    for (const key of computedKeys[expression] ?? []) for (const found of standsFor(key, keysOf.en)) used.add(found);
  }
  const unused = [...keysOf.en].filter((key) => !used.has(key));
  assert.deepEqual(unused, [], "nothing uses these keys; remove them from both catalogs");
});

test("no date or number is formatted outside i18n/format.js", () => {
  // periods.js keeps its Vienna arithmetic: it converts, it shows nothing.
  const allowed = new Set([path.join("i18n", "format.js"), path.join("exam", "client", "periods.js")]);
  const found = [];
  for (const { file, text } of sourceFiles()) {
    if (allowed.has(file)) continue;
    for (const [index, line] of text.split("\n").entries()) {
      if (/toLocale\w*String\(|Intl\.(DateTimeFormat|NumberFormat|RelativeTimeFormat)\(/.test(line)) {
        found.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(found, [], "format through createFormat() of i18n/format.js, with the reader's locale");
});
