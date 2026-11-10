/**
 * Where a test stands in the teacher's list of tests, unit by unit: done,
 * open right now, coming up within the next six calendar days, or later.
 *
 * No browser, no login, no server: `exam/client/test-timing.js` is the very
 * file the browser loads. The list itself against a running instance is
 * `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { viennaInstant } from "../exam/client/periods.js";
import { testTiming } from "../exam/client/test-timing.js";

const at = Date.parse("2026-11-07T10:00:00Z");
const sitting = (state, opensAt) => ({ state, opensAt: new Date(opensAt).toISOString() });
const day = 24 * 60 * 60 * 1000;
/** An instant given as Vienna wall-clock date and time. */
const vienna = (date, time) => viennaInstant(date, time).getTime();
const timing = (opensAt, now) => testTiming({ sittings: [sitting("scheduled", opensAt)] }, now);

describe("testTiming", () => {
  test("a test without a sitting is later", () => {
    assert.equal(testTiming({ sittings: [] }, at), "later");
  });

  test("a test whose sittings are all over is done", () => {
    assert.equal(testTiming({ sittings: [sitting("over", at - 3 * day), sitting("over", at - day)] }, at), "done");
  });

  test("a test open now is open, even beside a sitting over or one coming up", () => {
    assert.equal(testTiming({ sittings: [sitting("open", at - 60_000)] }, at), "open");
    assert.equal(testTiming({ sittings: [sitting("over", at - 5 * day), sitting("open", at - 60_000)] }, at), "open");
    assert.equal(testTiming({ sittings: [sitting("open", at - 60_000), sitting("scheduled", at + day)] }, at), "open");
  });

  test("on Monday 10:00, Sunday 23:00 is soon and next Monday 08:00 is later", () => {
    const monday = vienna("2026-11-09", "10:00");
    assert.equal(timing(vienna("2026-11-15", "23:00"), monday), "soon");
    assert.equal(timing(vienna("2026-11-16", "08:00"), monday), "later");
    assert.equal(timing(vienna("2026-11-16", "00:00"), vienna("2026-11-09", "23:59")), "later");
    assert.equal(timing(vienna("2026-11-29", "08:00"), monday), "later");
  });

  test("a sitting later today is soon", () => {
    assert.equal(timing(vienna("2026-11-09", "23:00"), vienna("2026-11-09", "08:00")), "soon");
  });

  test("the day counts in Vienna, not in UTC", () => {
    // 00:30 Vienna on Sunday is still Saturday in UTC; six Vienna days on is Saturday.
    assert.equal(timing(vienna("2026-11-14", "23:30"), vienna("2026-11-08", "00:30")), "soon");
    assert.equal(timing(vienna("2026-11-15", "00:30"), vienna("2026-11-08", "23:30")), "later");
  });

  test("across a DST changeover the count is in days, not hours", () => {
    // Autumn: the week from 2026-10-22 has a 25-hour day.
    assert.equal(timing(vienna("2026-10-28", "23:30"), vienna("2026-10-22", "00:30")), "soon");
    assert.equal(timing(vienna("2026-10-29", "00:30"), vienna("2026-10-22", "23:30")), "later");
    // Spring: the week from 2027-03-25 has a 23-hour day.
    assert.equal(timing(vienna("2027-03-31", "23:30"), vienna("2027-03-25", "00:30")), "soon");
    assert.equal(timing(vienna("2027-04-01", "00:30"), vienna("2027-03-25", "23:30")), "later");
  });

  test("a make-up coming up makes a test soon again, a far one keeps it later, not done", () => {
    assert.equal(testTiming({ sittings: [sitting("over", at - 5 * day), sitting("scheduled", at + 2 * day)] }, at), "soon");
    assert.equal(testTiming({ sittings: [sitting("over", at - 5 * day), sitting("scheduled", at + 30 * day)] }, at), "later");
  });

  test("a planned offline sitting past its time, never started, is soon", () => {
    assert.equal(testTiming({ sittings: [sitting("scheduled", at - day)] }, at), "soon");
  });
});
