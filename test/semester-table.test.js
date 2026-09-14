/**
 * The dates a semester table is made of, decided by the code that decides them.
 *
 * The command that writes the table is the one part of the plugin that is pure
 * arithmetic: a walk from one date to another, a weekday test, and a grid of
 * strings. It also has the edge cases nobody notices while writing it - the
 * daylight-saving switch a semester crosses twice, the year boundary in the
 * middle of the winter term, and a machine whose timezone is not the author's.
 * None of that needs an editor, so none of it is checked through one; what the
 * command does to a *document* is in `test/obsidian/plugin.test.js` instead.
 *
 * The functions are taken out of `main.ts` itself, through `pluginModule` - not
 * reimplemented here. A copy of a date walk in a test file agrees with the
 * plugin exactly until somebody changes one of them, and then it goes on
 * passing.
 *
 * No browser, no login, no server process, and no Obsidian: this file transpiles
 * one source file and calls three functions in it.
 */

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { pluginFunction, pluginModule } from "./obsidian/harness.js";

/** `getDay()`'s numbering, so a check can say which weekday it means. */
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SUN = 0;

/**
 * The winter semester of the files this command exists for - `md/*` in
 * secureLectures carry exactly this span. It crosses the October switch to
 * winter time, the turn of the month twice over, the turn of the year, and the
 * Christmas holidays.
 */
const WS = { from: "2026-09-21", to: "2027-02-08" };

let lessonDates;
let semesterTableLines;
let subjectHeadings;
let subjectHeading;
let readDateField;

before(async () => {
  const plugin = await pluginModule();
  lessonDates = pluginFunction(plugin, "lessonDates");
  semesterTableLines = pluginFunction(plugin, "semesterTableLines");
  subjectHeadings = pluginFunction(plugin, "subjectHeadings");
  subjectHeading = pluginFunction(plugin, "subjectHeading");
  readDateField = pluginFunction(plugin, "readDateField");
});

/** The rows a span and a set of weekdays produce, as `dd.MM.yyyy` strings. */
function datesOf(from, to, weekdays) {
  const dates = lessonDates(readDateField(from), readDateField(to), new Set(weekdays));
  return Array.from(dates, (date) => cellsOf(rowFor(date))[2]);
}

/** One date as the table writes it, without going through the table. */
function rowFor(date) {
  return semesterTableLines([date], [])[2];
}

/** A table line split into its cells, with the leading and trailing pipe dropped. */
function cellsOf(line) {
  return line
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** The whole table for a span, as the command would write it. */
function tableFor(from, to, weekdays, subjects = []) {
  const dates = lessonDates(readDateField(from), readDateField(to), new Set(weekdays));
  if (dates.length === 0) return [];
  return semesterTableLines(dates, subjectHeadings(subjects));
}

describe("every date in the range is written and none is skipped", () => {
  test("one weekday over a semester is one row a week, both ends included", () => {
    // 21.09.2026 and 08.02.2027 are both Mondays: the requirement is that a
    // range beginning or ending on a ticked weekday has a row for that day, and
    // a walk written with `<` instead of `<=` loses the last lesson of the term
    // without losing anything else - which is why this asserts both ends by name.
    const dates = datesOf(WS.from, WS.to, [MON]);

    assert.equal(dates[0], "21.09.2026", `The first Monday of the range has no row. Got ${dates[0]}.`);
    assert.equal(
      dates.at(-1),
      "08.02.2027",
      `The last day of the range is a Monday and has no row. Got ${dates.at(-1)}.`
    );
    assert.equal(new Set(dates).size, dates.length, "A date is written twice.");

    for (const [index, date] of dates.slice(1).entries()) {
      assert.equal(
        Math.round((asDate(date) - asDate(dates[index])) / 86400000),
        7,
        `${dates[index]} and ${date} are not a week apart. A walk that adds 86_400_000 ` +
          `milliseconds instead of a calendar day drifts by an hour at the switch, and the drift ` +
          `shows up here as a gap of six days or eight.`
      );
    }
  });

  test("a holiday inside the range is a row like any other", () => {
    // The plugin holds no calendar of school holidays and is required not to:
    // they are local, they change yearly, and the row is where the break gets
    // written down. Christmas is the one every reader of the table knows about.
    const dates = datesOf(WS.from, WS.to, [MON]);

    for (const holiday of ["28.12.2026", "04.01.2027"]) {
      assert.ok(
        dates.includes(holiday),
        `${holiday} is a Monday in the range and has no row. An unbroken run of weeks is the ` +
          `overview the table exists to give; the break in the teaching is written into the row ` +
          `it falls on, by the person who knows what it is.`
      );
    }
  });

  test("several weekdays are interleaved in date order, not grouped by weekday", () => {
    const dates = datesOf("2026-09-21", "2026-10-05", [MON, WED, FRI]);

    assert.deepEqual(
      dates,
      [
        "21.09.2026",
        "23.09.2026",
        "25.09.2026",
        "28.09.2026",
        "30.09.2026",
        "02.10.2026",
        "05.10.2026",
      ],
      "Every occurrence of each ticked weekday is written, in date order. Grouped by weekday " +
        "the table would read as three separate terms laid end to end."
    );
  });

  test("the range rolls over a month and a year boundary", () => {
    assert.deepEqual(datesOf("2026-12-28", "2027-01-04", [MON]), ["28.12.2026", "04.01.2027"]);
    assert.deepEqual(datesOf("2026-11-30", "2026-12-01", [MON, TUE]), ["30.11.2026", "01.12.2026"]);
  });

  test("a span that describes no lessons produces no rows at all", () => {
    assert.deepEqual(
      tableFor("2026-10-01", "2026-09-01", [MON]),
      [],
      "An end before the start describes no lessons, and a heading row over nothing is not a " +
        "semester table - it is a thing to delete before the dialog can be answered properly."
    );
    assert.deepEqual(tableFor(WS.from, WS.to, []), [], "No weekday ticked is no lesson.");
    assert.deepEqual(
      tableFor("2026-09-22", "2026-09-24", [SUN]),
      [],
      "A range too short to hold one occurrence of the ticked weekday is no lesson either."
    );
  });

  test("a range of one day is that day, when its weekday was ticked", () => {
    assert.deepEqual(datesOf("2026-09-21", "2026-09-21", [MON]), ["21.09.2026"]);
    assert.deepEqual(datesOf("2026-09-21", "2026-09-21", [TUE]), []);
  });
});

describe("the dates do not depend on the machine that writes them", () => {
  const timezones = [
    "UTC",
    "Europe/Vienna",
    // West of UTC: where `new Date("2026-09-21")` - UTC midnight - reads back
    // through `getDate()` as the 20th, and a whole table is shifted by a day.
    "America/Los_Angeles",
    // Far east of UTC, the same trap in the other direction.
    "Pacific/Auckland",
    // A zone whose clocks jump at midnight, so that the day the walk lands on
    // has no midnight at all and the walk is an hour off it from there on.
    "America/Santiago",
  ];
  const original = process.env.TZ;

  after(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  test("the same span writes the same table in every timezone", () => {
    const written = new Map();
    for (const timezone of timezones) {
      process.env.TZ = timezone;
      written.set(timezone, tableFor(WS.from, WS.to, [MON, THU], ["0WMC<br>(UNTEG)"]).join("\n"));
    }

    const [reference, ...rest] = [...written];
    for (const [timezone, table] of rest) {
      assert.equal(
        table,
        reference[1],
        `The table written in ${timezone} is not the one written in ${reference[0]}. The corpus is ` +
          `shared, so the same inputs have to produce the same table for everybody who runs the ` +
          `command - a date built by parsing a string rather than from its components is read as ` +
          `UTC midnight and lands on the day before west of UTC.`
      );
    }
  });

  test("a range across a daylight-saving switch loses and repeats nothing", () => {
    // Vienna switches on 25.10.2026 and again on 28.03.2027; Santiago's switch
    // is the one that skips midnight outright. Every day is ticked, so the rows
    // have to be the plain run of days and the weekday column has to advance by
    // exactly one each row.
    const everyDay = [0, 1, 2, 3, 4, 5, 6];
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (const timezone of timezones) {
      process.env.TZ = timezone;
      for (const [from, to, days] of [
        ["2026-10-19", "2026-11-09", 22],
        ["2027-03-15", "2027-04-12", 29],
        ["2026-09-01", "2026-09-14", 14],
      ]) {
        const rows = tableFor(from, to, everyDay).slice(2).map(cellsOf);
        const dates = rows.map((cells) => cells[2]);

        assert.equal(
          dates.length,
          days,
          `${from} to ${to} in ${timezone} is ${days} days and produced ${dates.length} rows.`
        );
        assert.equal(new Set(dates).size, days, `A date is repeated in ${timezone}: ${dates.join(", ")}`);

        const first = names.indexOf(rows[0][1]);
        for (const [index, cells] of rows.entries()) {
          assert.equal(
            cells[1],
            names[(first + index) % 7],
            `The weekday column drifts in ${timezone}: ${cells[1]} against ${cells[2]}. A walk ` +
              `that adds a fixed number of milliseconds lands at 23:00 the previous day once the ` +
              `clocks go back, and every row after it names the wrong weekday.`
          );
        }
      }
    }
  });
});

describe("the table is written in the shape the corpus already uses", () => {
  test("the columns are the marker, Day, Date, the subjects as given, and Info", () => {
    const table = tableFor("2026-09-21", "2026-09-28", [MON], [
      "0WMC<br>(UNTEG)",
      "1WMC<br>(UNTEG+LANDH)",
    ]);

    assert.deepEqual(cellsOf(table[0]), [
      "",
      "Day",
      "Date",
      "0WMC<br>(UNTEG)",
      "1WMC<br>(UNTEG+LANDH)",
      "Info",
    ]);
    assert.deepEqual(
      cellsOf(table[2]),
      ["x", "Mon", "21.09.2026", "", ""].concat(""),
      "A row carries its weekday, its date as dd.MM.yyyy, and nothing else - the subject and " +
        "info cells are the teacher's to fill in."
    );
  });

  test("a table with no subject column at all is still well-formed", () => {
    const table = tableFor("2026-09-21", "2026-09-28", [MON]);

    assert.deepEqual(cellsOf(table[0]), ["", "Day", "Date", "Info"]);
    assert.match(
      table[1],
      /^\| -{3,} \| -{3,} \| -{3,} \| -{3,} \|$/,
      `The delimiter row has one cell per column, filled with dashes. Got ${JSON.stringify(table[1])}.`
    );
  });

  test("the first data row carries the marker and the rest do not", () => {
    const table = tableFor(WS.from, WS.to, [MON]);
    const rows = table.slice(2);

    assert.equal(
      cellsOf(rows[0])[0],
      "x",
      "The marker is how the table says which lesson is next, and at the moment it is generated " +
        "that is its first row. There is no cell background in Markdown, which is why it is a " +
        "character in a column of its own."
    );
    for (const row of rows.slice(1)) {
      assert.equal(cellsOf(row)[0], "", `A row after the first carries the marker: ${JSON.stringify(row)}`);
    }
  });

  test("a subject heading is written as it was given, with only a pipe escaped", () => {
    const table = tableFor("2026-09-21", "2026-09-21", [MON], [
      "  0WMC<br>(UNTEG)  ",
      "",
      "   ",
      "A|B",
    ]);

    const headings = cellsOf(table[0]);
    assert.deepEqual(
      headings.slice(3, -1),
      ["0WMC<br>(UNTEG)", "A\\|B"],
      "The markup in a heading is there on purpose and is not normalized; a blank line is no " +
        "column; and a pipe is escaped, because an unescaped one ends the cell early and shifts " +
        "every column after it."
    );
    for (const line of table) {
      assert.equal(
        cellsOf(line).length,
        headings.length,
        `Every line has the same number of cells. ${JSON.stringify(line)} does not, which is what ` +
          `an unescaped pipe does to a table.`
      );
    }
  });

  test("a heading is built from the two halves the dialog asks for", () => {
    // The headings in the corpus are a subject over the teachers who take it,
    // and the line break between them is markup. Nobody laying out a semester
    // should have to know that, so the dialog asks for the two halves and the
    // plugin puts them together.
    assert.equal(subjectHeading("0WMC", "(UNTEG)"), "0WMC<br>(UNTEG)");
    assert.equal(subjectHeading("  1WMC  ", "  (UNTEG+LANDH)  "), "1WMC<br>(UNTEG+LANDH)");

    assert.equal(
      subjectHeading("0WMC", ""),
      "0WMC",
      "One half alone is that half. A <br> written above nothing leaves a heading sitting oddly " +
        "high in its row, and somebody who filled in one field meant one line."
    );
    assert.equal(subjectHeading("", "(UNTEG)"), "(UNTEG)");
    assert.equal(subjectHeading("  ", ""), "", "Neither half is no column at all.");
  });

  test("every line of the table is padded to one width", () => {
    const table = tableFor("2026-09-21", "2026-10-12", [MON, THU], ["0WMC<br>(UNTEG)"]);

    assert.equal(
      new Set(table.map((line) => line.length)).size,
      1,
      `The table is written aligned, which is what the corpus looks like and what Obsidian's ` +
        `table editor would reformat it into on the first edit anyway. Widths: ` +
        `${JSON.stringify(table.map((line) => line.length))}`
    );
  });

  test("the marker column is wide enough to be a cell and a delimiter", () => {
    const table = tableFor("2026-09-21", "2026-09-21", [MON]);

    assert.match(
      table[0],
      /^\| {3,} \|/,
      "The marker heading is empty, and a column padded to nothing would leave `||` - which is " +
        "no cell at all."
    );
    assert.match(table[1], /^\| -{3,} \|/, "Three dashes is the least a delimiter cell is written with.");
  });
});

describe("the generated table is a table to a GitHub-flavoured renderer", () => {
  // The corpus is rendered by the server as well as by Obsidian, and the server
  // renders with `marked` under `gfm: true, breaks: true, pedantic: false` -
  // copied from app.js deliberately, because what is asserted here is the shape
  // of the Markdown rather than the configuration it meets. That the reading
  // view shows a table is checked in the Obsidian suite, where a reading view
  // exists.
  let marked;

  before(async () => {
    const { Marked } = await import("marked");
    marked = new Marked();
    marked.use({ gfm: true, breaks: true, pedantic: false });
  });

  test("it renders as one table with a row per lesson", async () => {
    const table = tableFor("2026-09-21", "2026-10-12", [MON], ["0WMC<br>(UNTEG)"]);
    const html = await marked.parse(table.join("\n"));

    assert.equal((html.match(/<table>/g) ?? []).length, 1, `Not one table: ${html}`);
    assert.equal((html.match(/<th[ >]/g) ?? []).length, 5, `Five headings: ${html}`);
    assert.equal(
      (html.match(/<tr>/g) ?? []).length,
      1 + table.length - 2,
      `A heading row and one row per lesson: ${html}`
    );
  });

  test("a table written under a paragraph is still a table", async () => {
    // The command writes a blank line above the heading row when the line above
    // is not already blank, and this is that table: prose, the blank line, the
    // table. It renders as one table, which is the requirement.
    //
    // This renderer turns out to read the table without the blank line as well -
    // asserted below so that the leniency is recorded rather than assumed, and
    // so that a `marked` which stops being lenient turns this check red rather
    // than a person's document. The blank line is what keeps the document from
    // resting on that leniency in the first place, and it is also what the
    // tables already in the corpus have; that the command writes it is checked
    // in the Obsidian suite, against a real document.
    const table = tableFor("2026-09-21", "2026-10-12", [MON], ["0WMC<br>(UNTEG)"]);

    const separated = await marked.parse(["Some prose.", "", ...table].join("\n"));
    assert.equal(
      (separated.match(/<table>/g) ?? []).length,
      1,
      `A table under a paragraph, separated by the blank line the command writes: ${separated}`
    );

    const touching = await marked.parse(["Some prose.", ...table].join("\n"));
    assert.equal(
      (touching.match(/<table>/g) ?? []).length,
      1,
      "This renderer reads a table directly beneath a paragraph too. Should that change, the " +
        "blank line the command writes is what keeps every generated table rendering, and this " +
        "line is the record of when the leniency went away."
    );
  });
});

/** A `dd.MM.yyyy` cell back as a date, for asserting the distance between two of them. */
function asDate(written) {
  const [day, month, year] = written.split(".").map(Number);
  return new Date(year, month - 1, day).getTime();
}
