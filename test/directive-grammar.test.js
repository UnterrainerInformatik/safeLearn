/**
 * What a permission directive means, decided by the code that decides it.
 *
 * The companion plugin has to reach the same conclusion about a directive line
 * as the renderer does, entry by entry, because the plugin's whole value is that
 * a person can see what the server will do with a document before publishing it.
 * A hand-written mirror of `parsePermissionEntry`, `parsePermissionWindow` and
 * `parseLocalDateTime` will diverge somewhere - those functions are permissive
 * in ways a careful reading gets wrong, and the table below holds the cases that
 * prove it. So the mirror is not checked against a reading of the server: it is
 * checked against the server, through `parseFirstLineForPermissions`, which is
 * the entry point the file-level directive already goes through.
 *
 * No browser, no login, no server process: this file imports two functions and
 * calls them. It is in the content suite rather than beside the Obsidian harness
 * because what it establishes is a fact about `obsidian.js` first and about the
 * plugin second - and because it needs no Obsidian to establish it.
 *
 * The table is the subject of both halves. Each row states what the entries of
 * one directive line come to, and the check asserts that the server agrees; a
 * row whose expectation is wrong therefore fails here rather than teaching the
 * plugin the same wrong thing.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

import { parseFirstLineForPermissions } from "../obsidian.js";
import { resolvePlugin } from "./obsidian/harness.js";

/**
 * Directive lines and the entries the server keeps for each, in order.
 *
 * `timed` is whether the server keeps a *window* for that entry - not whether
 * the window is open at the moment, which nothing here depends on. An entry the
 * server drops entirely does not appear at all, which is the whole of what
 * "unreadable" means: `parsePermissionEntries` filters it out and the role it
 * named addresses nobody.
 */
const directives = [
  {
    line: "@@@ 4ahif",
    entries: [{ role: "4ahif", timed: false }],
    why: "A plain role. No window, so the entry is permanently active.",
  },
  {
    line: "@@@ Max Mustermann",
    entries: [{ role: "max mustermann", timed: false }],
    why: "A role may contain spaces - being addressed by display name is a documented feature - and is lowercased.",
  },
  {
    line: "@@@ TEACHER",
    entries: [{ role: "teacher", timed: false }],
    why: "`parsePermissionEntry` lowercases the role, so the spelling in the document does not matter.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00]",
    entries: [{ role: "4ahif", timed: true }],
    why: "A window with one timestamp is a start: the block appears at that moment and stays.",
  },
  {
    line: "@@@ 4ahif [2025-11-28T08:00:00]",
    entries: [{ role: "4ahif", timed: true }],
    why: "The pattern allows whitespace between the role and the bracket, and the role is trimmed.",
  },
  {
    line: "@@@ 4ahif[to 2025-11-28T08:00:00]",
    entries: [{ role: "4ahif", timed: true }],
    why: "`to X` is an end alone: active until that moment.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00 to 2025-12-01T10:00:00]",
    entries: [{ role: "4ahif", timed: true }],
    why: "`X to Y` is both ends. The separator needs whitespace on both sides.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00+01:00]",
    entries: [{ role: "4ahif", timed: true }],
    why: "A timezone suffix takes `parseLocalDateTime` down its other branch, straight to the Date constructor.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00Z]",
    entries: [{ role: "4ahif", timed: true }],
    why: "`Z` is the other timezone spelling the suffix test accepts.",
  },
  {
    line: "@@@ 4ahif[2025-11-28]",
    entries: [{ role: "4ahif", timed: true }],
    why: "A date with no time at all is accepted; the time defaults to midnight.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00]",
    entries: [{ role: "4ahif", timed: false }],
    why:
      "The trap this table exists for. A time without seconds leaves `second` undefined rather than " +
      "zero - the guard tests `Number.isNaN(undefined)`, which is false - and the Date constructor " +
      "turns that into an invalid date. The most natural spelling of a window is the one the server " +
      "discards, and it discards it silently: the entry survives with no window and is permanently active.",
  },
  {
    line: "@@@ 4ahif[2025-11-28 08]",
    entries: [{ role: "4ahif", timed: false }],
    why: "The same defect one step further: an hour alone leaves both minute and second undefined.",
  },
  {
    line: "@@@ 4ahif[2025-11-28 ab:cd:ef]",
    entries: [{ role: "4ahif", timed: true }],
    why:
      "And the same defect in the other direction: a time segment that is not a number leaves the " +
      "default of zero standing, so this is a valid window at midnight. Missing is fatal, nonsense " +
      "is not.",
  },
  {
    line: "@@@ 4ahif[2025-13-45]",
    entries: [{ role: "4ahif", timed: true }],
    why:
      "Accepted, although there is no thirteenth month. The Date constructor rolls the overflow over " +
      "into the following year, and nothing checks the range - so this is a window, and it is not the " +
      "one that was written.",
  },
  {
    line: "@@@ 4ahif[2025]",
    entries: [{ role: "4ahif", timed: false }],
    why:
      "Rejected, but not by a range check: the year alone leaves month undefined, `month - 1` is NaN, " +
      "and the date is invalid. A mirror that reasons about what a date *means* gets this pair wrong " +
      "in both directions.",
  },
  {
    line: "@@@ 4ahif[gestern]",
    entries: [{ role: "4ahif", timed: false }],
    why:
      "A window that is not a time at all. The entry keeps its role and loses the restriction, which " +
      "is the case the editor exists to show: the author grants permanently what they meant to bound.",
  },
  {
    line: "@@@ 4ahif[]",
    entries: [],
    why:
      "Empty brackets are not an empty window - the window group needs a character - so the role part " +
      "would have to contain the brackets, and it may not. The whole entry is discarded.",
  },
  {
    line: "@@@ 4ahif]",
    entries: [],
    why: "A bracket in the role part makes the token unreadable. It does not make a window.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00] extra",
    entries: [],
    why: "The closing bracket has to end the token. Text after it costs the entry, window and role alike.",
  },
  {
    line: "@@@ a[b][c]",
    entries: [{ role: "a", timed: false }],
    why: "The window group is greedy and takes `b][c`, which is no time - so the role stands, unbounded.",
  },
  {
    line: "@@@ [2025-11-28T08:00:00]",
    entries: [],
    why: "A window with no role in front of it addresses nobody and is discarded whole.",
  },
  {
    line: "@@@ 4ahif,,5bhif",
    entries: [
      { role: "4ahif", timed: false },
      { role: "5bhif", timed: false },
    ],
    why: "An empty token between two commas is dropped and costs its neighbours nothing.",
  },
  {
    line: "@@@ #exam",
    entries: [{ role: "#exam", timed: false }],
    why: "A view switch is an entry like any other here; only `hasRoles` treats the prefix differently.",
  },
  {
    line: "@@@ #practice",
    entries: [{ role: "#practice", timed: false }],
    why: "The complement of #exam, resolved against the reader's own preference.",
  },
  {
    line: "@@@ #answer",
    entries: [{ role: "#answer", timed: false }],
    why: "The third switch, resolved against the answers preference.",
  },
  {
    line: "@@@ #nonsense",
    entries: [{ role: "#nonsense", timed: false }],
    why:
      "The prefix is recognized more broadly than the three names: `hasRoles` takes every `#` entry " +
      "out of the role test and then resolves exactly three of them. This one restricts nobody and " +
      "switches nothing.",
  },
  {
    line: "@@@ #exam[2025-01-01T00:00:00]",
    entries: [{ role: "#exam", timed: true }],
    why: "A switch may carry a window. The two conclusions are independent of one another.",
  },
  {
    line: "@@@ to 2025-01-01T00:00:00",
    entries: [{ role: "to 2025-01-01t00:00:00", timed: false }],
    why: "Without brackets there is no window to read. The whole text is a role, and it addresses nobody.",
  },
  {
    line: "@@@ 4ahif, teacher[2025-01-01T00:00:00], #exam, ]kaputt, 5bhif[gestern]",
    entries: [
      { role: "4ahif", timed: false },
      { role: "teacher", timed: true },
      { role: "#exam", timed: false },
      { role: "5bhif", timed: false },
    ],
    why:
      "One directive holding every kind at once. The unreadable fourth token costs the four around " +
      "it nothing - which is what the plugin's marking has to show as well.",
  },
  {
    line: "@@@ ]a, b[, [c]",
    entries: [],
    why:
      "A directive with nothing readable in it. `removeForbiddenContent` replaces such a block with " +
      "the empty string, so it is withheld from every reader including an admin - the harshest thing " +
      "a directive can do, and the least visible.",
  },
  {
    line: "@@@",
    entries: [],
    why:
      "The degenerate case of the same thing: on the first line of a document this gates the whole " +
      "file and names no role, so `resolveFileVisibility` reports it invisible to everyone.",
  },
];

/** What the server keeps for a directive line, as the table writes it. */
function serverEntries(line) {
  const parsed = parseFirstLineForPermissions(line);
  assert.notEqual(parsed, null, `${JSON.stringify(line)} is not a directive line to the server at all.`);
  return parsed.map((entry) => ({ role: entry.role, timed: entry.window !== null }));
}

test("the server reads every directive of the table the way the table says", () => {
  for (const { line, entries, why } of directives) {
    assert.deepEqual(
      serverEntries(line),
      entries,
      `${JSON.stringify(line)} - ${why}\nThe table and obsidian.js disagree about this line. The ` +
        `table is what the plugin is held to, so a wrong row here teaches the plugin the wrong rule.`
    );
  }
});

/**
 * The plugin's own grammar, loaded out of its source.
 *
 * `main.ts` is one module that imports Obsidian and CodeMirror, neither of which
 * exists in a Node process - `obsidian` ships types and no code at all - so it
 * is transpiled with the compiler the plugin builds with and run in a context
 * where those two imports are stubs. Nothing in the module does anything at load
 * time except register a view plugin, which is what the stub is for.
 *
 * The source rather than the built `main.js`: rollup removes what nothing calls,
 * so a bundle would only hold the grammar once the editor uses it, and this
 * check would then be asserting that the wiring exists rather than that the
 * grammar is right. Whether the wiring exists is the Obsidian harness's
 * question, and it asks it against a real Obsidian.
 */
function pluginGrammar() {
  const dir = resolvePlugin();
  const compiler = path.join(dir, "node_modules", "typescript", "lib", "typescript.js");
  if (!existsSync(compiler)) {
    throw new Error(
      `The plugin checkout at ${dir} has no TypeScript to read its own source with. Run ` +
        `\`npm install\` there once; this check does not install anything as a side effect.`
    );
  }
  return import(pathToFileURL(compiler)).then((module) => {
    const ts = module.default ?? module;
    const source = path.join(dir, "main.ts");
    const transpiled = ts.transpileModule(readFileSync(source, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;

    const stubs = {
      obsidian: { Plugin: class {} },
      "@codemirror/view": {
        Decoration: { mark: () => ({ range: () => ({}) }), line: () => ({ range: () => ({}) }) },
        ViewPlugin: { fromClass: () => ({}) },
        EditorView: class {},
      },
      "@codemirror/state": {},
    };
    const context = vm.createContext({
      module: { exports: {} },
      exports: {},
      console,
      require: (name) => stubs[name] ?? {},
    });
    vm.runInContext(transpiled, context, { filename: source });

    const parse = vm.runInContext(
      "typeof parseDirectiveEntries === 'function' ? parseDirectiveEntries : null",
      context
    );
    if (!parse) {
      throw new Error(
        `${source} declares no parseDirectiveEntries. The plugin's reading of a directive is what ` +
          `this check holds against the server, and without it nothing here means anything.`
      );
    }
    return parse;
  });
}

/**
 * What the plugin keeps for a directive line, in the table's own form.
 *
 * The records are projected into plain values before anything is compared: they
 * are built in the module's own context, and a deep comparison against objects
 * from this one fails on the prototypes alone. `Array.from` for the same reason
 * - an array the module's own `map` produced belongs to that context too, and
 * the failure it causes shows two values that print identically.
 */
function pluginEntries(parse, line) {
  const entries = parse(line);
  assert.notEqual(entries, null, `${JSON.stringify(line)} is not a directive line to the plugin at all.`);
  return Array.from(entries, (entry) => ({
    index: entry.index,
    length: entry.length,
    role: entry.role === null ? null : { index: entry.role.index, length: entry.role.length, text: entry.role.text },
    window:
      entry.window === null
        ? null
        : { index: entry.window.index, length: entry.window.length, text: entry.window.text },
    readable: entry.readable,
    timed: entry.timed,
    brokenWindow: entry.brokenWindow,
    viewSwitch: entry.viewSwitch,
    resolvedSwitch: entry.resolvedSwitch,
  }));
}

test("the plugin reaches the server's conclusion about every entry", async () => {
  const parse = await pluginGrammar();

  for (const { line, entries, why } of directives) {
    const kept = pluginEntries(parse, line)
      .filter((entry) => entry.readable)
      .map((entry) => ({ role: entry.role.text, timed: entry.timed }));

    assert.deepEqual(
      kept,
      serverEntries(line),
      `${JSON.stringify(line)} - ${why}\nThe plugin and obsidian.js disagree about this line. A ` +
        `marking that says something the server will not do is worse than no marking: the plugin ` +
        `enforces nothing, and being able to see what the server will do is the whole of what it ` +
        `is for. Either the mirror in main.ts is wrong, or the divergence is deliberate and belongs ` +
        `in AI/architecture.md section 9.`
    );
  }
});

test("the plugin tells a view switch from an address the way hasRoles does", async () => {
  const parse = await pluginGrammar();
  const resolved = ["#exam", "#practice", "#answer"];

  for (const { line, why } of directives) {
    const kept = pluginEntries(parse, line).filter((entry) => entry.readable);
    const server = serverEntries(line);

    assert.deepEqual(
      kept.map((entry) => ({ switch: entry.viewSwitch, resolves: entry.resolvedSwitch })),
      server.map((entry) => ({
        switch: entry.role.startsWith("#"),
        resolves: resolved.includes(entry.role),
      })),
      `${JSON.stringify(line)} - ${why}\n\`hasRoles\` takes every entry whose role begins with # ` +
        `out of the role test and then resolves exactly ${resolved.join(", ")}. An entry marked as ` +
        `an address that is really a switch tells a person the document restricts an audience when ` +
        `it selects a variant, and one marked as a working switch when it is none of the three ` +
        `hides that it decides nothing at all.`
    );
  }
});

test("every entry the plugin reports covers the text it is about", async () => {
  const parse = await pluginGrammar();

  for (const { line, why } of directives) {
    for (const entry of pluginEntries(parse, line)) {
      const covered = line.slice(entry.index, entry.index + entry.length);
      assert.equal(
        covered,
        covered.trim(),
        `${JSON.stringify(line)} - ${why}\nAn entry's extent takes in whitespace around the token. ` +
          `A marking is drawn on exactly this range, and one that reaches past the token says the ` +
          `server acts on characters it never sees.`
      );

      if (entry.role !== null) {
        assert.equal(
          line.slice(entry.role.index, entry.role.index + entry.role.length).trim().toLowerCase(),
          entry.role.text,
          `${JSON.stringify(line)} - the role's extent does not cover the role it reports.`
        );
      }

      if (entry.window !== null) {
        assert.equal(
          line.slice(entry.window.index, entry.window.index + entry.window.length),
          entry.window.text,
          `${JSON.stringify(line)} - the window's extent does not cover the window it reports.`
        );
        assert.equal(
          `${line[entry.window.index - 1]}${line[entry.window.index + entry.window.length]}`,
          "[]",
          `${JSON.stringify(line)} - the window's extent is not the text between a pair of ` +
            `brackets. Only a bracketed part is a window to the server; a bracket found by ` +
            `searching the line is not.`
        );
      }

      assert.equal(
        entry.brokenWindow,
        entry.window !== null && !entry.timed,
        `${JSON.stringify(line)} - an entry is broken exactly when a window was written and the ` +
          `server will not keep it. That is the case the editor exists to show, because the entry ` +
          `survives it unbounded and nothing else anywhere reports it.`
      );
    }
  }
});

test("the table covers every conclusion the grammar has to reach", () => {
  const kept = directives.flatMap((row) => row.entries);
  const reached = {
    "a plain role": kept.some((e) => !e.timed && !e.role.startsWith("#")),
    "a role with spaces": kept.some((e) => e.role.includes(" ")),
    "a window the server keeps": kept.some((e) => e.timed),
    "a window the server discards": directives.some((row) =>
      row.entries.some((e) => !e.timed) && /\[[^\]]/.test(row.line)
    ),
    "a token the server discards whole": directives.some(
      (row) => row.entries.length < row.line.slice(3).split(",").length
    ),
    "each of the three view switches": ["#exam", "#practice", "#answer"].every((name) =>
      kept.some((e) => e.role === name)
    ),
    "a switch that is none of the three": kept.some(
      (e) => e.role.startsWith("#") && !["#exam", "#practice", "#answer"].includes(e.role)
    ),
    "a directive with nothing readable in it": directives.some((row) => row.entries.length === 0),
  };

  assert.deepEqual(
    Object.entries(reached)
      .filter(([, covered]) => !covered)
      .map(([name]) => name),
    [],
    "The table lost a case it was written to carry. Each of these is a conclusion the plugin's " +
      "grammar has to reach, and a row that stops covering one takes the check for it with it."
  );
});
