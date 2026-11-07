/**
 * Where a test stands in the teacher's list of tests: open right now, done,
 * coming up within seven days, or later. No DOM, so a unit test loads the very file the
 * browser does (`test/exam-test-timing.test.js`).
 */

/** How far ahead a sitting counts as coming up next. */
export const SOON_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "open" while one of a test's sittings is open (an offline one once
 * started), "done" once it has sittings and every one is over, "soon" while
 * one opens within seven days of `at` (a planned offline sitting past its
 * time included, since it still waits for its start), otherwise "later" - no
 * sitting yet, or only ones further out.
 */
export function testTiming(test, at = Date.now()) {
  if (test.sittings.length === 0) return "later";
  if (test.sittings.some((sitting) => sitting.state === "open")) return "open";
  const pending = test.sittings.filter((sitting) => sitting.state !== "over");
  if (pending.length === 0) return "done";
  return pending.some((sitting) => Date.parse(sitting.opensAt) - at < SOON_MS) ? "soon" : "later";
}
