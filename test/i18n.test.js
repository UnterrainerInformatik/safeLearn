/**
 * The interface texts and formats (`ui-language`, `locale-formats`), unit by
 * unit: `t()`'s lookup, fallback, parameters and plurals, and every formatter
 * and parser of `format.js` in both formats.
 *
 * No browser, no login, no server: `i18n/t.js` and `i18n/format.js` are the
 * very files the browser loads. The catalogs themselves are checked by
 * `test/i18n-catalog.test.js`, the settings menu and the translated pages
 * against a running instance by `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createFormat, datePattern, parseDate, parseNumber, parseTime, readDate } from "../i18n/format.js";
import { createT, languageOf, localeOf } from "../i18n/t.js";

const en = {
  exam: {
    tests: { emptyList: "No tests yet.", heading: "Online tests", questions_one: "{count} question", questions_other: "{count} questions" },
    greeting: "Hello {name}, {name}!",
    onlyEnglish: "Only in English",
  },
};
const de = {
  exam: {
    tests: { emptyList: "Noch keine Tests.", questions_one: "{count} Frage", questions_other: "{count} Fragen" },
    greeting: "Hallo {name}, {name}!",
  },
};

/** Runs `fn` with console.warn recorded instead of printed. */
function warnings(fn) {
  const recorded = [];
  const original = console.warn;
  console.warn = (...args) => recorded.push(args.join(" "));
  try {
    return { value: fn(), recorded };
  } finally {
    console.warn = original;
  }
}

describe("t()", () => {
  const tDe = createT(de, en, "de");
  const tEn = createT(en, null, "en");

  test("looks a nested key up in the chosen language", () => {
    assert.equal(tDe("exam.tests.emptyList"), "Noch keine Tests.");
    assert.equal(tEn("exam.tests.emptyList"), "No tests yet.");
  });

  test("falls back to English for a key the German catalog lacks", () => {
    assert.equal(tDe("exam.tests.heading"), "Online tests");
    assert.equal(tDe("exam.onlyEnglish"), "Only in English");
  });

  test("fills every occurrence of a parameter and leaves unknown ones", () => {
    assert.equal(tDe("exam.greeting", { name: "Gerald" }), "Hallo Gerald, Gerald!");
    assert.equal(tEn("exam.greeting"), "Hello {name}, {name}!");
  });

  test("chooses the plural form by count and the language's rules", () => {
    assert.equal(tEn("exam.tests.questions", { count: 1 }), "1 question");
    assert.equal(tEn("exam.tests.questions", { count: 0 }), "0 questions");
    assert.equal(tEn("exam.tests.questions", { count: 2 }), "2 questions");
    assert.equal(tDe("exam.tests.questions", { count: 1 }), "1 Frage");
    assert.equal(tDe("exam.tests.questions", { count: 5 }), "5 Fragen");
  });

  test("shows a key in neither catalog in brackets and warns, outside production", () => {
    const { value, recorded } = warnings(() => tDe("exam.nothing.here"));
    assert.equal(value, "[exam.nothing.here]");
    assert.equal(recorded.length, 1);
    assert.match(recorded[0], /exam\.nothing\.here/);
  });

  test("a group is not a text", () => {
    const { value } = warnings(() => tEn("exam.tests"));
    assert.equal(value, "[exam.tests]");
  });

  test("an inherited property name is no key", () => {
    const { value } = warnings(() => tEn("exam.constructor"));
    assert.equal(value, "[exam.constructor]");
  });

  test("an unknown language or format reads as the default", () => {
    assert.equal(languageOf("fr"), "en");
    assert.equal(languageOf(undefined), "en");
    assert.equal(languageOf("de"), "de");
    assert.equal(localeOf("en-US"), "de-AT");
    assert.equal(localeOf("en-GB"), "en-GB");
  });
});

describe("format.js", () => {
  const deAT = createFormat("de-AT", "de");
  const enGB = createFormat("en-GB", "en");
  const mixed = createFormat("de-AT", "en");
  const tenOClock = "2026-10-20T08:00:00.000Z";

  test("dates, times and numbers as the spec's examples", () => {
    assert.equal(deAT.date("2026-10-20"), "20.10.2026");
    assert.equal(enGB.date("2026-10-20"), "20/10/2026");
    assert.equal(deAT.time(tenOClock), "10:00");
    assert.equal(enGB.time(tenOClock), "10:00");
    assert.equal(deAT.number(1.5), "1,5");
    assert.equal(enGB.number(1.5), "1.5");
  });

  test("date-only values never shift by a day, on either DST changeover", () => {
    for (const format of [deAT, enGB]) {
      assert.equal(format.date("2026-10-25"), format === deAT ? "25.10.2026" : "25/10/2026");
      assert.equal(format.date("2027-03-28"), format === deAT ? "28.03.2027" : "28/03/2027");
    }
  });

  test("instants are shown in Vienna, whatever the process's zone", () => {
    // 23:30 UTC on the 24th is 01:30 on the 25th in Vienna (summer time).
    assert.equal(deAT.date("2026-10-24T23:30:00Z"), "25.10.2026");
    assert.equal(deAT.dateTime("2026-10-24T23:30:00Z"), "25.10.2026, 01:30");
    assert.equal(enGB.dateTime(tenOClock), "20/10/2026, 10:00");
    assert.equal(deAT.clock("2026-10-20T08:00:05Z"), "10:00:05");
  });

  test("the weekday follows the language, the day the format", () => {
    assert.equal(deAT.weekdayDay(tenOClock), "Di. 20.10.");
    assert.equal(enGB.weekdayDay(tenOClock), "Tue 20/10");
    assert.equal(mixed.weekdayDay(tenOClock), "Tue 20.10.");
    assert.equal(deAT.weekdayDay("2026-10-20"), "Di. 20.10.");
  });

  test("a calendar's heading, column heads and day names follow the language", () => {
    assert.equal(deAT.monthYear("2026-10-20"), "Oktober 2026");
    assert.equal(mixed.monthYear("2026-10-20"), "October 2026");
    assert.equal(deAT.longDate("2026-10-20"), "Dienstag, 20. Oktober 2026");
    assert.deepEqual(deAT.weekdayNames(), ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
    assert.equal(enGB.weekdayNames()[0], "Mon");
  });

  test("numbers and percent", () => {
    assert.equal(deAT.number(2), "2");
    assert.equal(deAT.number(1.255, 2), "1,26");
    assert.equal(enGB.number(1.25, 1), "1.3");
    assert.equal(deAT.percent(0.42), "42\u00a0%");
    assert.equal(enGB.percent(0.42), "42%");
    assert.equal(enGB.percent(0.425, 1), "42.5%");
  });
});

describe("parsing typed values", () => {
  test("each format's date pattern comes from Intl", () => {
    assert.deepEqual(datePattern("de-AT"), { order: ["day", "month", "year"], separator: "." });
    assert.deepEqual(datePattern("en-GB"), { order: ["day", "month", "year"], separator: "/" });
  });

  test("a date in either format, with single digits and a trailing separator", () => {
    assert.equal(parseDate("20.10.2026", "de-AT"), "2026-10-20");
    assert.equal(parseDate(" 1.9.2026. ", "de-AT"), "2026-09-01");
    assert.equal(parseDate("20/10/2026", "en-GB"), "2026-10-20");
    assert.equal(parseDate("29.02.2028", "de-AT"), "2028-02-29");
  });

  test("invalid days and months, two-digit years and the other format are refused", () => {
    for (const text of ["32.10.2026", "29.02.2027", "31.04.2026", "0.10.2026", "20.13.2026", "20.0.2026", "20.10.26", "20/10/2026", "2026-10-20", "", "heute"]) {
      assert.equal(parseDate(text, "de-AT"), null, text);
    }
    assert.equal(parseDate("20.10.2026", "en-GB"), null);
  });

  test("what the date field takes: the value, or why not, with min and max", () => {
    const range = { min: "2026-09-07", max: "2027-07-02" };
    assert.deepEqual(readDate("20.10.2026", "de-AT", range), { value: "2026-10-20", problem: null });
    assert.deepEqual(readDate("20/10/2026", "en-GB", range), { value: "2026-10-20", problem: null });
    assert.deepEqual(readDate("07.09.2026", "de-AT", range), { value: "2026-09-07", problem: null }, "min itself is allowed");
    assert.deepEqual(readDate("02/07/2027", "en-GB", range), { value: "2027-07-02", problem: null }, "max itself is allowed");
    assert.deepEqual(readDate("06.09.2026", "de-AT", range), { value: "2026-09-06", problem: "tooEarly" });
    assert.deepEqual(readDate("03/07/2027", "en-GB", range), { value: "2027-07-03", problem: "tooLate" });
    assert.deepEqual(readDate("32.10.2026", "de-AT", range), { value: null, problem: "unreadable" });
    assert.deepEqual(readDate("20.10.26", "de-AT", range), { value: null, problem: "unreadable" });
    assert.deepEqual(readDate("", "de-AT", range), { value: null, problem: null });
    assert.deepEqual(readDate("  ", "de-AT", { ...range, required: true }), { value: null, problem: "missing" });
  });

  test("times of day", () => {
    assert.equal(parseTime("9:05"), "09:05");
    assert.equal(parseTime("23:59"), "23:59");
    assert.equal(parseTime("24:00"), null);
    assert.equal(parseTime("10:60"), null);
    assert.equal(parseTime("10"), null);
  });

  test("numbers with a comma or a point", () => {
    assert.equal(parseNumber("1,5"), 1.5);
    assert.equal(parseNumber("1.5"), 1.5);
    assert.equal(parseNumber(" 12 "), 12);
    assert.equal(parseNumber(",5"), 0.5);
    assert.equal(parseNumber(""), null);
    assert.equal(parseNumber("1,5,0"), null);
    assert.equal(parseNumber("abc"), null);
  });
});
