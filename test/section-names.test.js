/**
 * The order the per-name commands write names in, and the content each section
 * starts with, decided by the code that decides them.
 *
 * Both are pure: a list of people in, a list of names out; a pasted string in,
 * a section's lines out. None of it needs an editor, so none of it is checked
 * through one. What the command does to a *document* is in
 * `test/obsidian/plugin.test.js`.
 *
 * The functions are taken out of `main.ts` itself, through `pluginModule`, the
 * same way `semester-table.test.js` takes its functions. A copy of a collation
 * rule in a test file agrees with the plugin only until somebody changes one of
 * them.
 *
 * No browser, no login, no server process, and no Obsidian.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { pluginFunction, pluginModule } from "./obsidian/harness.js";

let orderForWriting;
let sectionContentLines;
let sectionContentHoldsMarker;

before(async () => {
  const plugin = await pluginModule();
  orderForWriting = pluginFunction(plugin, "orderForWriting");
  sectionContentLines = pluginFunction(plugin, "sectionContentLines");
  sectionContentHoldsMarker = pluginFunction(plugin, "sectionContentHoldsMarker");
});

/** A person as the picker holds them once the instance sends the name parts. */
function person(firstName, lastName) {
  return { name: [firstName, lastName].filter((part) => part !== "").join(" "), firstName, lastName };
}

/** The plugin's arrays come from another realm; compare them as plain ones. */
function ordered(chosen, typed = []) {
  return [...orderForWriting(chosen, typed)];
}

describe("orderForWriting", () => {
  test("writes chosen people by surname, whatever order the directory gave them in", () => {
    assert.deepEqual(
      ordered([person("Clemens", "Gugerbauer"), person("Anna", "Aigner"), person("Lukas", "Horvath")]),
      ["Anna Aigner", "Clemens Gugerbauer", "Lukas Horvath"]
    );
  });

  test("orders people sharing a surname by their given name", () => {
    assert.deepEqual(ordered([person("Maria", "Huber"), person("Jakob", "Huber")]), ["Jakob Huber", "Maria Huber"]);
  });

  test("sorts an umlaut beside its base letter and ignores case, as a German class list does", () => {
    assert.deepEqual(
      ordered([person("Eva", "oswald"), person("Paul", "Öller"), person("Tim", "Oberhuber")]),
      ["Tim Oberhuber", "Paul Öller", "Eva oswald"]
    );
  });

  test("orders by the whole of a two-word surname, not by its last word", () => {
    // By last word, "Huber Moser" would file under M, after Lang.
    assert.deepEqual(
      ordered([person("Sara", "Lang"), person("Lisa", "Huber Moser")]),
      ["Lisa Huber Moser", "Sara Lang"]
    );
  });

  test("a two-word given name does not move anybody", () => {
    assert.deepEqual(
      ordered([person("Anna Maria", "Zach"), person("Ben", "Bauer")]),
      ["Ben Bauer", "Anna Maria Zach"]
    );
  });

  test("orders people from an instance that sends no name parts by their display name", () => {
    assert.deepEqual(
      ordered([{ name: "Lukas Horvath" }, { name: "Clemens Gugerbauer" }, { name: "Anna Aigner" }]),
      ["Anna Aigner", "Clemens Gugerbauer", "Lukas Horvath"]
    );
  });

  test("a person without a surname is filed under their display name among the others", () => {
    assert.deepEqual(ordered([person("Solo", ""), person("Anna", "Rauch")]), ["Anna Rauch", "Solo"]);
  });

  test("typed names follow the chosen people, in the order they were typed", () => {
    assert.deepEqual(
      ordered([person("Lukas", "Horvath"), person("Anna", "Aigner")], ["Zoe Zauner", "  Bert Berger  ", "", "Adam Adler"]),
      ["Anna Aigner", "Lukas Horvath", "Zoe Zauner", "Bert Berger", "Adam Adler"]
    );
  });

  test("a pasted list where no picker is shown is written in the order it was pasted", () => {
    assert.deepEqual(ordered([], ["Zoe Zauner", "Adam Adler"]), ["Zoe Zauner", "Adam Adler"]);
  });

  test("a typed name that was also chosen is written once, where the chosen person stands", () => {
    assert.deepEqual(
      ordered([person("Lukas", "Horvath"), person("Anna", "Aigner")], ["Lukas Horvath"]),
      ["Anna Aigner", "Lukas Horvath"]
    );
  });

  test("leaves what it was handed as it was", () => {
    const chosen = [person("Lukas", "Horvath"), person("Anna", "Aigner")];
    orderForWriting(chosen, []);
    assert.deepEqual(
      chosen.map((entry) => entry.name),
      ["Lukas Horvath", "Anna Aigner"],
      "the picker's chosen list keeps the directory's order"
    );
  });
});

describe("sectionContentLines", () => {
  test("nothing given is the single blank line a section has always held", () => {
    assert.deepEqual([...sectionContentLines("")], [""]);
    assert.deepEqual([...sectionContentLines("  \n\t\n")], [""]);
  });

  test("keeps the content line by line, with indentation and inner blank lines", () => {
    assert.deepEqual(
      [...sectionContentLines("| Criterion | Points |\n|---|---|\n\n  - indented")],
      ["| Criterion | Points |", "|---|---|", "", "  - indented"]
    );
  });

  test("drops the one line break a paste brings along at the end, and only that one", () => {
    assert.deepEqual([...sectionContentLines("a\nb\n")], ["a", "b"]);
    assert.deepEqual([...sectionContentLines("a\nb\n\n")], ["a", "b", ""]);
  });

  test("reads Windows line endings the same way", () => {
    assert.deepEqual([...sectionContentLines("a\r\nb\r\n")], ["a", "b"]);
  });
});

describe("sectionContentHoldsMarker", () => {
  test("a closing marker or a nested directive anywhere in the content is caught", () => {
    assert.equal(sectionContentHoldsMarker("grid\n@@@\nrest"), true);
    assert.equal(sectionContentHoldsMarker("grid\n  @@@ teacher\n@@@"), true);
  });

  test("content that only mentions the marker inside a line is not", () => {
    assert.equal(sectionContentHoldsMarker("| Note | write @@@ here |\n"), false);
    assert.equal(sectionContentHoldsMarker(""), false);
  });
});
