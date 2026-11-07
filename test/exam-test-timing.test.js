/**
 * Where a test stands in the teacher's list of tests, unit by unit: done,
 * open right now, coming up within seven days, or later.
 *
 * No browser, no login, no server: `exam/client/test-timing.js` is the very
 * file the browser loads. The list itself against a running instance is
 * `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { SOON_MS, testTiming } from "../exam/client/test-timing.js";

const at = Date.parse("2026-11-07T10:00:00Z");
const sitting = (state, opensAt) => ({ state, opensAt: new Date(opensAt).toISOString() });
const day = 24 * 60 * 60 * 1000;

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

  test("a sitting opening within seven days is soon, at seven days or more it is later", () => {
    assert.equal(testTiming({ sittings: [sitting("scheduled", at + SOON_MS - 60_000)] }, at), "soon");
    assert.equal(testTiming({ sittings: [sitting("scheduled", at + SOON_MS)] }, at), "later");
    assert.equal(testTiming({ sittings: [sitting("scheduled", at + 20 * day)] }, at), "later");
  });

  test("a make-up coming up makes a test soon again, a far one keeps it later, not done", () => {
    assert.equal(testTiming({ sittings: [sitting("over", at - 5 * day), sitting("scheduled", at + 2 * day)] }, at), "soon");
    assert.equal(testTiming({ sittings: [sitting("over", at - 5 * day), sitting("scheduled", at + 30 * day)] }, at), "later");
  });

  test("a planned offline sitting past its time, never started, is soon", () => {
    assert.equal(testTiming({ sittings: [sitting("scheduled", at - day)] }, at), "soon");
  });
});
