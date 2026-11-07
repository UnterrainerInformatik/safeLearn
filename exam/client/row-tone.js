/**
 * The module's shared row colours (`data-tone` on a `<tr>`, styled in
 * `css/exam.css`): good, bad, warn, info, or none for neutral. No DOM, so a
 * unit test loads the very file the browser does (`test/exam-row-tone.test.js`).
 */

/**
 * The tone of a row that stands for a grade: a 5 is bad, a 1 or 2 good,
 * anything else (3, 4, no grade) neutral. Takes numbers and numeric strings.
 */
export function gradeTone(grade) {
  if (grade === null || grade === undefined || grade === "") return null;
  const value = Number(grade);
  if (value === 5) return "bad";
  if (value === 1 || value === 2) return "good";
  return null;
}

/** The tone of each state of a test in the list of tests (`test-timing.js`). */
export const timingTone = Object.freeze({ open: "bad", soon: "warn", later: "info", done: "good" });

/** Sets `data-tone` on an element, or removes it for neutral. The one writer of the attribute. */
export function setTone(element, tone) {
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}
