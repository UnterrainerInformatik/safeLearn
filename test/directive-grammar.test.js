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
import { test } from "node:test";

import { parseFirstLineForPermissions } from "../obsidian.js";
import { pluginFunction, pluginModule } from "./obsidian/harness.js";

/**
 * Directive lines and the entries the server keeps for each, in order.
 *
 * `window` is what the server makes of the entry's window: `none` when none was
 * written, `timed` when it keeps one, and `closed` when the entry is closed at
 * every moment - a window it cannot read, in whole or in any part, or a token
 * it cannot read as an entry at all (fail-closed-fence-entries D1). Not whether
 * a kept window is open at the moment, which nothing here depends on. Only an
 * empty token is dropped; every other one stays, and a closed one admits nobody.
 */
const directives = [
  {
    line: "@@@ 4ahif",
    entries: [{ role: "4ahif", window: "none" }],
    why: "A plain role. No window, so the entry is permanently active.",
  },
  {
    line: "@@@ Max Mustermann",
    entries: [{ role: "max mustermann", window: "none" }],
    why: "A role may contain spaces - being addressed by display name is a documented feature - and is lowercased.",
  },
  {
    line: "@@@ TEACHER",
    entries: [{ role: "teacher", window: "none" }],
    why: "`parsePermissionEntry` lowercases the role, so the spelling in the document does not matter.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00]",
    entries: [{ role: "4ahif", window: "timed" }],
    why: "A window with one timestamp is a start: the block appears at that moment and stays.",
  },
  {
    line: "@@@ 4ahif [2025-11-28T08:00:00]",
    entries: [{ role: "4ahif", window: "timed" }],
    why: "The pattern allows whitespace between the role and the bracket, and the role is trimmed.",
  },
  {
    line: "@@@ 4ahif[to 2025-11-28T08:00:00]",
    entries: [{ role: "4ahif", window: "timed" }],
    why: "`to X` is an end alone: active until that moment.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00 to 2025-12-01T10:00:00]",
    entries: [{ role: "4ahif", window: "timed" }],
    why: "`X to Y` is both ends. The separator needs whitespace on both sides.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00+01:00]",
    entries: [{ role: "4ahif", window: "timed" }],
    why: "A timezone suffix takes `parseLocalDateTime` down its other branch, straight to the Date constructor.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00Z]",
    entries: [{ role: "4ahif", window: "timed" }],
    why: "`Z` is the other timezone spelling the suffix test accepts.",
  },
  {
    line: "@@@ 4ahif[2025-11-28]",
    entries: [{ role: "4ahif", window: "timed" }],
    why: "A date with no time at all is accepted; the time defaults to midnight.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00]",
    entries: [{ role: "4ahif", window: "closed" }],
    why:
      "The trap this table exists for. A time without seconds leaves `second` undefined rather than " +
      "zero - the guard tests `Number.isNaN(undefined)`, which is false - and the Date constructor " +
      "turns that into an invalid date. The most natural spelling of a window is one the server " +
      "cannot read, and the entry is closed for good: what the author meant to show for a while is " +
      "never shown.",
  },
  {
    line: "@@@ 4ahif[2025-11-28 08]",
    entries: [{ role: "4ahif", window: "closed" }],
    why: "The same defect one step further: an hour alone leaves both minute and second undefined.",
  },
  {
    line: "@@@ 4ahif[2025-11-28 ab:cd:ef]",
    entries: [{ role: "4ahif", window: "timed" }],
    why:
      "And the same defect in the other direction: a time segment that is not a number leaves the " +
      "default of zero standing, so this is a valid window at midnight. Missing is fatal, nonsense " +
      "is not.",
  },
  {
    line: "@@@ 4ahif[2025-13-45]",
    entries: [{ role: "4ahif", window: "timed" }],
    why:
      "Accepted, although there is no thirteenth month. The Date constructor rolls the overflow over " +
      "into the following year, and nothing checks the range - so this is a window, and it is not the " +
      "one that was written.",
  },
  {
    line: "@@@ 4ahif[2025]",
    entries: [{ role: "4ahif", window: "closed" }],
    why:
      "Rejected, but not by a range check: the year alone leaves month undefined, `month - 1` is NaN, " +
      "and the date is invalid. A mirror that reasons about what a date *means* gets this pair wrong " +
      "in both directions.",
  },
  {
    line: "@@@ 4ahif[gestern]",
    entries: [{ role: "4ahif", window: "closed" }],
    why:
      "A window that is not a time at all. The entry keeps its role and is closed: it used to lose " +
      "the restriction instead, granting permanently what the author meant to bound.",
  },
  {
    line: "@@@ 4bhif[2026-11-01T08:00:00 to nächste Woche]",
    entries: [{ role: "4bhif", window: "closed" }],
    why: "Half a window is no window. Keeping the readable start alone would make it open-ended.",
  },
  {
    line: "@@@ 4bhif[gestern to 2026-11-01T08:00:00]",
    entries: [{ role: "4bhif", window: "closed" }],
    why: "The other half: an unreadable start with a readable end is closed as well.",
  },
  {
    line: "@@@ 4bhif[to nächste Woche]",
    entries: [{ role: "4bhif", window: "closed" }],
    why: "An end alone that cannot be read.",
  },
  {
    line: "@@@ 4ahif[]",
    entries: [{ role: "4ahif", window: "closed" }],
    why:
      "Empty brackets are not an empty window - the window group needs a character - so the token " +
      "does not read as an entry. It is kept as a closed entry naming the text in front of the bracket.",
  },
  {
    line: "@@@ 4ahif]",
    entries: [{ role: "4ahif", window: "closed" }],
    why: "A bracket in the role part makes the token unreadable. It does not make a window, and it does not vanish.",
  },
  {
    line: "@@@ 4ahif[2025-11-28T08:00:00] extra",
    entries: [{ role: "4ahif", window: "closed" }],
    why: "The closing bracket has to end the token. Text after it closes the entry, window and role alike.",
  },
  {
    line: "@@@ a[b][c]",
    entries: [{ role: "a", window: "closed" }],
    why: "The window group is greedy and takes `b][c`, which is no time - so the entry is closed.",
  },
  {
    line: "@@@ [2025-11-28T08:00:00]",
    entries: [{ role: "", window: "closed" }],
    why: "A window with no role in front of it names nobody. It is still a written role, and a closed one.",
  },
  {
    line: "@@@ #optional[",
    entries: [{ role: "#optional", window: "closed" }],
    why: "An unreadable token beginning with the prefix is a closed switch, which no reader ever satisfies.",
  },
  {
    line: "@@@ 4ahif,,5bhif",
    entries: [
      { role: "4ahif", window: "none" },
      { role: "5bhif", window: "none" },
    ],
    why: "An empty token between two commas is dropped and costs its neighbours nothing.",
  },
  {
    line: "@@@ #variant-private",
    entries: [{ role: "#variant-private", window: "none" }],
    why: "A view switch is an entry like any other here; only `hasRoles` treats the prefix differently.",
  },
  {
    line: "@@@ #variant-public",
    entries: [{ role: "#variant-public", window: "none" }],
    why: "The complement of #variant-private, resolved against the reader's own preference.",
  },
  {
    line: "@@@ #optional",
    entries: [{ role: "#optional", window: "none" }],
    why: "The third switch, resolved against the answers preference.",
  },
  {
    line: "@@@ #nonsense",
    entries: [{ role: "#nonsense", window: "none" }],
    why:
      "The prefix is recognized more broadly than the three names: `hasRoles` takes every `#` entry " +
      "out of the role test and then resolves exactly three of them. Any other one, this one and the " +
      "retired #exam alike, hides its block from everyone.",
  },
  {
    line: "@@@ #variant-private #optional",
    entries: [{ role: "#variant-private #optional", window: "none" }],
    why:
      "Entries are separated by commas, switches included. Without the comma this is one switch of " +
      "an unknown name, and it hides its block from everyone.",
  },
  {
    line: "@@@ #variant-private, #optional",
    entries: [
      { role: "#variant-private", window: "none" },
      { role: "#optional", window: "none" },
    ],
    why: "Two switches, combined with AND by `hasRoles`: the teacher-only revealable solution.",
  },
  {
    line: "@@@ #variant-private[2025-01-01T00:00:00]",
    entries: [{ role: "#variant-private", window: "timed" }],
    why: "A switch may carry a window. While it is shut, the switch cannot be satisfied.",
  },
  {
    line: "@@@ to 2025-01-01T00:00:00",
    entries: [{ role: "to 2025-01-01t00:00:00", window: "none" }],
    why: "Without brackets there is no window to read. The whole text is a role, and it addresses nobody.",
  },
  {
    line: "@@@ 4ahif, teacher[2025-01-01T00:00:00], #variant-private, ]kaputt, 5bhif[gestern]",
    entries: [
      { role: "4ahif", window: "none" },
      { role: "teacher", window: "timed" },
      { role: "#variant-private", window: "none" },
      { role: "", window: "closed" },
      { role: "5bhif", window: "closed" },
    ],
    why:
      "One directive holding every kind at once. The unreadable fourth token and the broken window " +
      "of the fifth close themselves and nothing else - which is what the plugin's marking has to " +
      "show as well.",
  },
  {
    line: "@@@ ]a, b[, [c]",
    entries: [
      { role: "", window: "closed" },
      { role: "b", window: "closed" },
      { role: "", window: "closed" },
    ],
    why:
      "A directive with nothing open in it. `removeForbiddenContent` replaces such a block with the " +
      "empty string, so it is withheld from every reader including an admin - the harshest thing a " +
      "directive can do, and the least visible.",
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
  return parsed.map((entry) => ({
    role: entry.role,
    window: entry.window === null ? "none" : entry.window.invalid ? "closed" : "timed",
  }));
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
 * where those two imports are stubs — see `stubModule` for what those stubs
 * answer and why they answer more than they are asked.
 *
 * The source rather than the built `main.js`: rollup removes what nothing calls,
 * so a bundle would only hold the grammar once the editor uses it, and this
 * check would then be asserting that the wiring exists rather than that the
 * grammar is right. Whether the wiring exists is the Obsidian harness's
 * question, and it asks it against a real Obsidian.
 */
/**
 * The plugin's reading of a directive, taken out of its own module.
 *
 * The loading itself - transpiling `main.ts` with the checkout's TypeScript and
 * running it in a `vm` with its imports stubbed - moved into the Obsidian
 * harness when `plugin-semester-table-command` needed the same thing for the
 * date walk. Two copies of it would have been free to disagree about how the
 * plugin is loaded, which is the one thing both checks have to agree about.
 *
 * Absent is still an error: a check that called nothing would pass against a
 * plugin that had lost the very function it is about. `pluginFunction` says so
 * in those words.
 */
async function pluginGrammar() {
  return pluginFunction(await pluginModule(), "parseDirectiveEntries");
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
    text: entry.text,
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
    closed: entry.closed,
    viewSwitch: entry.viewSwitch,
    resolvedSwitch: entry.resolvedSwitch,
    conflictingSwitch: entry.conflictingSwitch,
  }));
}

/** The entries the plugin says the server keeps, in the table's own form. */
function pluginKept(parse, line) {
  return pluginEntries(parse, line)
    .filter((entry) => entry.text !== "")
    .map((entry) => ({
      role: entry.role?.text ?? null,
      window: entry.closed ? "closed" : entry.timed ? "timed" : "none",
    }));
}

test("the plugin reaches the server's conclusion about every entry", async () => {
  const parse = await pluginGrammar();

  for (const { line, entries, why } of directives) {
    const kept = pluginKept(parse, line);

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
  const resolved = ["#variant-private", "#variant-public", "#optional"];

  for (const { line, why } of directives) {
    const kept = pluginEntries(parse, line).filter((entry) => entry.text !== "");
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
          `is closed for good by it and nothing else but a server log line reports it.`
      );
    }
  }
});

test("the table covers every conclusion the grammar has to reach", () => {
  const kept = directives.flatMap((row) => row.entries);
  const known = ["#variant-private", "#variant-public", "#optional"];
  const reached = {
    "a plain role": kept.some((e) => e.window === "none" && !e.role.startsWith("#")),
    "a role with spaces": kept.some((e) => e.role.includes(" ")),
    "a window the server keeps": kept.some((e) => e.window === "timed"),
    "a window the server cannot read": directives.some((row) =>
      row.entries.some((e) => e.window === "closed") && /\[[^\]]+\]$/.test(row.line)
    ),
    "half a window": directives.some((row) => / to /.test(row.line) && row.entries.some((e) => e.window === "closed")),
    "a token that does not read as an entry": kept.some((e) => e.role === ""),
    "an empty token, dropped": directives.some((row) => row.line.includes(",,")),
    "each of the three view switches": known.every((name) => kept.some((e) => e.role === name)),
    "a switch that is none of the three": kept.some((e) => e.role.startsWith("#") && !known.includes(e.role)),
    "two switches in one directive": directives.some((row) => row.entries.filter((e) => known.includes(e.role)).length > 1),
    "a directive with nothing open in it": directives.some(
      (row) => row.entries.length > 0 && row.entries.every((e) => e.window === "closed")
    ),
    "a directive with nothing in it": directives.some((row) => row.entries.length === 0),
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

/**
 * What the plugin marks on a whole directive, against what the server does with
 * it: a directive withheld from every reader, and the two variants named
 * together (`plugin-editor-decorations`).
 */
test("the plugin marks a directive withheld exactly where the server refuses everyone", async () => {
  const module = await pluginModule();
  const parse = pluginFunction(module, "parseDirectiveEntries");
  const withholds = pluginFunction(module, "withholdsFromEveryone");
  const cases = [
    ["@@@ 4ahif", false],
    ["@@@ ]a, b[, [c]", true],
    ["@@@ teacher[morgen]", true],
    ["@@@ 4ahif[gestern], #optional", true],
    ["@@@ 4ahif [], #optional", true],
    ["@@@ teacher, 4ahif[gestern], #optional", false],
    ["@@@ #optional", false],
    ["@@@", true],
  ];
  for (const [line, expected] of cases) {
    assert.equal(
      withholds(parse(line)),
      expected,
      `${JSON.stringify(line)} - the server refuses a directive to everyone when every entry is ` +
        `closed, or when it names roles and all of them are closed; the switches beside them do ` +
        `not decide in their place.`
    );
  }
});

test("the plugin marks both variants in one directive, and only then", async () => {
  const parse = await pluginGrammar();
  for (const line of ["@@@ #variant-public, 4ahif, #variant-private", "@@@ #variant-private, #variant-public"]) {
    const switches = pluginEntries(parse, line).filter((entry) => entry.viewSwitch);
    assert.deepEqual(
      switches.map((entry) => [entry.role.text, entry.resolvedSwitch, entry.conflictingSwitch]),
      [...switches].map((entry) => [entry.role.text, true, true]),
      `${JSON.stringify(line)} - the server combines switches with AND and the two variants are ` +
        `complements, so the block is hidden from everyone; both are marked as the error.`
    );
  }
  const solution = pluginEntries(parse, "@@@ #variant-private, #optional");
  assert.deepEqual(
    solution.map((entry) => [entry.role.text, entry.resolvedSwitch, entry.conflictingSwitch]),
    [
      ["#variant-private", true, false],
      ["#optional", true, false],
    ],
    "A variant combined with the optional switch is two working switches."
  );
});
