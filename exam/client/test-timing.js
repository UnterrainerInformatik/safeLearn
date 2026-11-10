/**
 * Where a test stands in the teacher's list of tests: open right now, done,
 * coming up within the next six calendar days, or later. No DOM, so a unit
 * test loads the very file the browser does (`test/exam-test-timing.test.js`).
 */

import { viennaLocal } from "./periods.js";

/** How many calendar days after today a sitting still counts as coming up. */
export const SOON_DAYS = 6;

/**
 * The instant's Vienna calendar day as a whole-day number. The wall-clock
 * date is read as a UTC midnight, so a DST changeover does not shift it.
 */
function viennaDay(instant) {
  const [year, month, day] = viennaLocal(instant).date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * "open" while one of a test's sittings is open (an offline one once
 * started), "done" once it has sittings and every one is over, "soon" while
 * one opens on a Vienna calendar day at most `SOON_DAYS` after the day of
 * `at`, the time of day not counting (later today included, and a planned
 * offline sitting past its time too, since it still waits for its start),
 * otherwise "later" - no sitting yet, or only ones further out.
 */
export function testTiming(test, at = Date.now()) {
  if (test.sittings.length === 0) return "later";
  if (test.sittings.some((sitting) => sitting.state === "open")) return "open";
  const pending = test.sittings.filter((sitting) => sitting.state !== "over");
  if (pending.length === 0) return "done";
  const today = viennaDay(at);
  return pending.some((sitting) => viennaDay(Date.parse(sitting.opensAt)) - today <= SOON_DAYS) ? "soon" : "later";
}
