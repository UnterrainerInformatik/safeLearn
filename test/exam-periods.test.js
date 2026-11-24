/**
 * The school's periods (`school-periods`), unit by unit: parsing
 * `SCHOOL_PERIODS`, a window from a date and a range of periods and back,
 * and what the sitting form proposes at a given moment.
 *
 * No browser, no login, no server: `exam/client/periods.js` is the very file
 * the browser loads. The form and the displays against a running instance are
 * `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { defaultPeriods, defaultStart, matchPlan, matchStart, matchWindow, nextWeekday, parsePeriods, periodTimes, planFor, startWindowFor, viennaInstant, windowFor } from "../exam/client/periods.js";

/** The school's list, from Gerald on 2026-10-18. */
const schoolList = [
  "0=07:05-07:55",
  "1=08:00-08:50",
  "2=08:55-09:45",
  "3=10:00-10:50",
  "4=10:55-11:45",
  "5=11:50-12:40",
  "6=12:45-13:35",
  "7=13:40-14:30",
  "8=14:35-15:25",
  "9=15:30-16:20",
  "10=16:25-17:15",
  "11=17:20-18:05",
  "12=18:05-18:50",
  "13=19:00-19:45",
  "14=19:45-20:30",
  "15=20:40-21:25",
  "16=21:25-22:10",
].join(",");

const periods = parsePeriods(schoolList);

describe("parsing SCHOOL_PERIODS", () => {
  test("the school's list parses, with period 12 directly after period 11", () => {
    assert.equal(periods.length, 17);
    assert.deepEqual(periods[12], { n: 12, start: "18:05", end: "18:50" });
    assert.equal(periods[11].end, periods[12].start);
  });

  test("unset, empty or blank declares no periods", () => {
    assert.deepEqual(parsePeriods(undefined), []);
    assert.deepEqual(parsePeriods(""), []);
    assert.deepEqual(parsePeriods("   "), []);
  });

  test("whitespace around entries is ignored and the order of entries does not matter", () => {
    assert.deepEqual(parsePeriods(" 2=08:55-09:45 , 1=08:00-08:50 "), [
      { n: 1, start: "08:00", end: "08:50" },
      { n: 2, start: "08:55", end: "09:45" },
    ]);
  });

  test("overlapping periods name both", () => {
    assert.throws(() => parsePeriods("1=08:00-08:50,2=08:45-09:35"), /period 2 \("2=08:45-09:35"\) overlaps period 1/);
  });

  test("a malformed entry is named", () => {
    assert.throws(() => parsePeriods("1=8-9"), /"1=8-9"/);
    assert.throws(() => parsePeriods("1=08:00-08:50,"), /the entry ""/);
    assert.throws(() => parsePeriods("1=08:00-24:00"), /"1=08:00-24:00"/);
  });

  test("a number listed twice is named", () => {
    assert.throws(() => parsePeriods("1=08:00-08:50,1=09:00-09:50"), /period 1 is listed twice/);
  });

  test("a period that does not end after it starts is named", () => {
    assert.throws(() => parsePeriods("3=10:50-10:00"), /period 3 \("3=10:50-10:00"\) does not end after it starts/);
    assert.throws(() => parsePeriods("3=10:00-10:00"), /does not end after it starts/);
  });
});

describe("windows and periods", () => {
  test("periods 3 to 4 on 2026-10-20 are 10:00 to 11:45 Vienna time", () => {
    assert.deepEqual(windowFor(periods, "2026-10-20", 3, 4), {
      opensAt: "2026-10-20T08:00:00.000Z",
      closesAt: "2026-10-20T09:45:00.000Z",
    });
    assert.equal(periodTimes(periods, 3, 4), "10:00–11:45");
    assert.equal(periodTimes(periods, 12), "18:05–18:50");
  });

  test("every range round-trips through its window", () => {
    for (const from of periods) {
      for (const to of periods.filter((period) => period.n >= from.n)) {
        const window = windowFor(periods, "2026-10-20", from.n, to.n);
        assert.deepEqual(matchWindow(periods, window.opensAt, window.closesAt), { date: "2026-10-20", from: from.n, to: to.n });
      }
    }
  });

  test("a window one minute off does not match", () => {
    const { opensAt, closesAt } = windowFor(periods, "2026-10-20", 3, 4);
    const minute = 60 * 1000;
    assert.equal(matchWindow(periods, new Date(Date.parse(opensAt) + minute).toISOString(), closesAt), null);
    assert.equal(matchWindow(periods, opensAt, new Date(Date.parse(closesAt) - minute).toISOString()), null);
    assert.equal(matchWindow(periods, "2026-10-20T08:05:00.000Z", "2026-10-20T08:55:00.000Z"), null);
  });

  test("a window across midnight does not match", () => {
    const opens = windowFor(periods, "2026-10-20", 3, 3).opensAt;
    const closes = windowFor(periods, "2026-10-21", 4, 4).closesAt;
    assert.equal(matchWindow(periods, opens, closes), null);
  });

  test("a window that closes before the period it opens with does not match", () => {
    const opens = windowFor(periods, "2026-10-20", 4, 4).opensAt;
    const closes = windowFor(periods, "2026-10-20", 3, 3).closesAt;
    assert.equal(matchWindow(periods, opens, closes), null);
  });

  test("without periods nothing matches", () => {
    assert.equal(matchWindow([], "2026-10-20T08:00:00.000Z", "2026-10-20T09:45:00.000Z"), null);
    assert.equal(defaultPeriods([], new Date()), null);
  });

  test("the DST changeover days come out right", () => {
    // 2026-10-25: summer time ends, UTC+2 → UTC+1 at 03:00.
    assert.deepEqual(windowFor(periods, "2026-10-24", 3, 4), { opensAt: "2026-10-24T08:00:00.000Z", closesAt: "2026-10-24T09:45:00.000Z" });
    assert.deepEqual(windowFor(periods, "2026-10-25", 3, 4), { opensAt: "2026-10-25T09:00:00.000Z", closesAt: "2026-10-25T10:45:00.000Z" });
    assert.deepEqual(windowFor(periods, "2026-10-25", 0, 0), { opensAt: "2026-10-25T06:05:00.000Z", closesAt: "2026-10-25T06:55:00.000Z" });
    // 2027-03-28: summer time starts, UTC+1 → UTC+2 at 02:00.
    assert.deepEqual(windowFor(periods, "2027-03-27", 3, 4), { opensAt: "2027-03-27T09:00:00.000Z", closesAt: "2027-03-27T10:45:00.000Z" });
    assert.deepEqual(windowFor(periods, "2027-03-28", 3, 4), { opensAt: "2027-03-28T08:00:00.000Z", closesAt: "2027-03-28T09:45:00.000Z" });
    assert.deepEqual(windowFor(periods, "2027-03-28", 16, 16), { opensAt: "2027-03-28T19:25:00.000Z", closesAt: "2027-03-28T20:10:00.000Z" });
    for (const date of ["2026-10-25", "2027-03-28"]) {
      const window = windowFor(periods, date, 0, 16);
      assert.deepEqual(matchWindow(periods, window.opensAt, window.closesAt), { date, from: 0, to: 16 });
    }
  });

  test("a Vienna wall-clock time becomes its instant", () => {
    assert.equal(viennaInstant("2026-07-01", "00:00").toISOString(), "2026-06-30T22:00:00.000Z");
    assert.equal(viennaInstant("2026-12-31", "23:59").toISOString(), "2026-12-31T22:59:00.000Z");
  });
});

describe("what the form proposes", () => {
  const at = (date, time) => viennaInstant(date, time);

  test("during a lesson: today and the running period", () => {
    assert.deepEqual(defaultPeriods(periods, at("2026-10-19", "10:20")), { date: "2026-10-19", from: 3, to: 3 });
  });

  test("in a break: today and the next period", () => {
    assert.deepEqual(defaultPeriods(periods, at("2026-10-19", "09:50")), { date: "2026-10-19", from: 3, to: 3 });
    assert.deepEqual(defaultPeriods(periods, at("2026-10-19", "18:55")), { date: "2026-10-19", from: 13, to: 13 });
  });

  test("at the minute one period ends and the next starts: the next one", () => {
    assert.deepEqual(defaultPeriods(periods, at("2026-10-19", "18:05")), { date: "2026-10-19", from: 12, to: 12 });
  });

  test("before the first period: period 0 of today", () => {
    assert.deepEqual(defaultPeriods(periods, at("2026-10-19", "06:30")), { date: "2026-10-19", from: 0, to: 0 });
  });

  test("in the evening: the next day and period 1", () => {
    assert.deepEqual(defaultPeriods(periods, at("2026-10-19", "22:30")), { date: "2026-10-20", from: 1, to: 1 });
    assert.deepEqual(defaultPeriods(periods, at("2026-12-31", "23:00")), { date: "2027-01-01", from: 1, to: 1 });
  });

  test("in the evening without a period numbered 1 or higher: the next day's first period", () => {
    assert.deepEqual(defaultPeriods(parsePeriods("0=07:05-07:55"), at("2026-10-19", "22:30")), { date: "2026-10-20", from: 0, to: 0 });
  });

  test("on the DST changeover days", () => {
    assert.deepEqual(defaultPeriods(periods, at("2026-10-25", "10:20")), { date: "2026-10-25", from: 3, to: 3 });
    assert.deepEqual(defaultPeriods(periods, at("2027-03-28", "10:20")), { date: "2027-03-28", from: 3, to: 3 });
  });
});

describe("the next weekday", () => {
  test("after a Tuesday comes Wednesday; after a Friday, a Saturday or a Sunday, Monday", () => {
    assert.equal(nextWeekday("2026-10-20"), "2026-10-21");
    for (const date of ["2026-10-23", "2026-10-24", "2026-10-25"]) assert.equal(nextWeekday(date), "2026-10-26", date);
  });

  test("across the end of a month and a year", () => {
    assert.equal(nextWeekday("2027-12-31"), "2028-01-03");
  });
});

describe("start windows and periods", () => {
  test("period 4 on 2026-10-20, 5 minutes in, for 10 minutes, is 11:00 to 11:10 Vienna time", () => {
    const window = startWindowFor(periods, "2026-10-20", 4, 5, 10);
    assert.deepEqual(window, { opensAt: "2026-10-20T09:00:00.000Z", closesAt: "2026-10-20T09:10:00.000Z" });
    assert.deepEqual(matchStart(periods, window.opensAt, window.closesAt), { date: "2026-10-20", n: 4, offset: 5, length: 10 });
  });

  test("a start window may run past the end of its period", () => {
    assert.deepEqual(startWindowFor(periods, "2026-10-20", 3, 0, 60), { opensAt: "2026-10-20T08:00:00.000Z", closesAt: "2026-10-20T09:00:00.000Z" });
  });

  test("an older sitting from 10:00 to 11:45 reads as period 3, 0 minutes, 105 minutes", () => {
    const { opensAt, closesAt } = windowFor(periods, "2026-10-20", 3, 4);
    assert.deepEqual(matchStart(periods, opensAt, closesAt), { date: "2026-10-20", n: 3, offset: 0, length: 105 });
  });

  test("the last minute of a period is in it; its end and a break are not", () => {
    const at = (time, length = 10) => {
      const opens = viennaInstant("2026-10-20", time);
      return matchStart(periods, opens.toISOString(), new Date(opens.getTime() + length * 60000).toISOString());
    };
    assert.deepEqual(at("10:49"), { date: "2026-10-20", n: 3, offset: 49, length: 10 });
    assert.equal(at("10:50"), null, "the break before period 4");
    assert.equal(at("07:58"), null, "before the first period");
  });

  test("a start window across midnight matches none, and is not made", () => {
    const opens = viennaInstant("2026-10-20", "21:30");
    assert.equal(matchStart(periods, opens.toISOString(), new Date(opens.getTime() + 3 * 3600000).toISOString()), null);
    assert.throws(() => startWindowFor(periods, "2026-10-20", 16, 40, 180), /does not lie on/);
    assert.throws(() => startWindowFor(periods, "2026-10-20", 99, 5, 10), /no period 99/);
  });

  test("without periods nothing matches", () => {
    assert.equal(matchStart([], "2026-10-20T09:00:00.000Z", "2026-10-20T09:10:00.000Z"), null);
    assert.equal(defaultStart([]), null);
  });

  test("on the DST changeover days the start window keeps its wall-clock times", () => {
    for (const [date, opensAt, closesAt] of [
      ["2026-10-24", "2026-10-24T09:00:00.000Z", "2026-10-24T09:10:00.000Z"],
      ["2026-10-25", "2026-10-25T10:00:00.000Z", "2026-10-25T10:10:00.000Z"],
      ["2027-03-28", "2027-03-28T09:00:00.000Z", "2027-03-28T09:10:00.000Z"],
    ]) {
      assert.deepEqual(startWindowFor(periods, date, 4, 5, 10), { opensAt, closesAt }, date);
      assert.deepEqual(matchStart(periods, opensAt, closesAt), { date, n: 4, offset: 5, length: 10 }, date);
    }
  });

  test("the form proposes the first period whose default start window has not closed", () => {
    const at = (time, date = "2026-10-19") => defaultStart(periods, viennaInstant(date, time));
    assert.deepEqual(at("10:08"), { date: "2026-10-19", n: 3, offset: 5, length: 10 }, "early in period 3");
    assert.deepEqual(at("10:20"), { date: "2026-10-19", n: 4, offset: 5, length: 10 }, "period 3's 10:05-10:15 has closed");
    assert.deepEqual(at("06:00"), { date: "2026-10-19", n: 0, offset: 5, length: 10 }, "before the first period");
    assert.deepEqual(at("22:30"), { date: "2026-10-20", n: 1, offset: 5, length: 10 }, "in the evening");
    assert.deepEqual(defaultStart(parsePeriods("0=07:05-07:55"), viennaInstant("2026-10-19", "22:30")), { date: "2026-10-20", n: 0, offset: 5, length: 10 });
  });
});

describe("offline plans and periods", () => {
  const minutes = ({ opensAt, closesAt }) => (Date.parse(closesAt) - Date.parse(opensAt)) / 60000;

  test("lessons 4 to 6 on 2026-11-30 are 10:55 to 13:35, 160 minutes; 5 minutes in, 155", () => {
    const plan = planFor(periods, "2026-11-30", 4, 0, 6);
    assert.deepEqual(plan, { opensAt: "2026-11-30T09:55:00.000Z", closesAt: "2026-11-30T12:35:00.000Z" });
    assert.equal(minutes(plan), 160);
    assert.deepEqual(matchPlan(periods, plan.opensAt, 160), { date: "2026-11-30", from: 4, offset: 0, to: 6 });
    const late = planFor(periods, "2026-11-30", 4, 5, 6);
    assert.deepEqual(late, { opensAt: "2026-11-30T10:00:00.000Z", closesAt: "2026-11-30T12:35:00.000Z" });
    assert.equal(minutes(late), 155);
    assert.deepEqual(matchPlan(periods, late.opensAt, 155), { date: "2026-11-30", from: 4, offset: 5, to: 6 });
  });

  test("a plan that ends within its start lesson reads as that lesson", () => {
    const opensAt = viennaInstant("2026-11-30", "09:00").toISOString();
    assert.deepEqual(matchPlan(periods, opensAt, 20), { date: "2026-11-30", from: 2, offset: 5, to: 2 });
    assert.deepEqual(matchPlan(periods, opensAt, 45), { date: "2026-11-30", from: 2, offset: 5, to: 2 }, "to the end of lesson 2");
    assert.equal(minutes(planFor(periods, "2026-11-30", 2, 5, 2)), 45);
  });

  test("a plan that ends off the period ends, after its start lesson, matches none", () => {
    const opensAt = viennaInstant("2026-11-30", "10:55").toISOString();
    assert.equal(matchPlan(periods, opensAt, 100), null, "ends at 12:35, within lesson 5");
  });

  test("a plan starting 07:58 matches none, nor one in a break", () => {
    assert.equal(matchPlan(periods, viennaInstant("2026-11-30", "07:58").toISOString(), 50), null);
    assert.equal(matchPlan(periods, viennaInstant("2026-11-30", "09:50").toISOString(), 10), null);
    assert.equal(matchPlan([], viennaInstant("2026-11-30", "10:55").toISOString(), 50), null);
  });

  test("a reversed range, an unknown period, an offset past the lesson and a plan past midnight are not made", () => {
    assert.throws(() => planFor(periods, "2026-11-30", 5, 0, 4), /no plan from period 5 to period 4/);
    assert.throws(() => planFor(periods, "2026-11-30", 99, 0, 99), /no plan/);
    assert.throws(() => planFor(periods, "2026-11-30", 3, 50, 3), /do not lie within period 3/);
    assert.throws(() => planFor(parsePeriods("1=23:30-23:59"), "2026-11-30", 1, 30, 1), /do not lie within/);
    const opensAt = viennaInstant("2026-11-30", "21:30").toISOString();
    assert.equal(matchPlan(periods, opensAt, 180), null, "across midnight");
  });

  test("on the DST changeover days the plan keeps its wall-clock times", () => {
    for (const [date, opensAt, closesAt] of [
      ["2026-10-25", "2026-10-25T09:55:00.000Z", "2026-10-25T12:35:00.000Z"],
      ["2027-03-28", "2027-03-28T08:55:00.000Z", "2027-03-28T11:35:00.000Z"],
    ]) {
      assert.deepEqual(planFor(periods, date, 4, 0, 6), { opensAt, closesAt }, date);
      assert.deepEqual(matchPlan(periods, opensAt, 160), { date, from: 4, offset: 0, to: 6 }, date);
    }
  });
});
