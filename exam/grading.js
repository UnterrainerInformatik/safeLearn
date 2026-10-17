/**
 * How a semester grade is proposed (`gradebook`), as pure functions: no
 * database, no clock, no request. `gradebook.js` reads the records and hands
 * them here; the unit tests call these directly.
 *
 * Every result is a fraction from 0 to 1. A category's fraction is the mean of
 * its entries, the proposal is the mean of the category fractions weighted by
 * the course's config sheet, and the grading scale turns a fraction into a
 * grade. A category without entries is left out and the remaining weights are
 * scaled up (design.md, D7).
 *
 * The year grade is not a semester's proposal over the whole year: it combines
 * the winter semester's result and the summer semester's own by the course's
 * winter share (`yearProposal`, `year-grade`).
 */

/** The semesters of a school year. `ss`'s proposal is the grade for the whole year. */
export const semesters = Object.freeze(["ws", "ss"]);

/** The category each kind of manual entry counts towards. */
export const entryCategory = Object.freeze({
  test: "manualTests",
  plusminus: "participation",
  homework: "homework",
});

/**
 * A fraction in basis points (0.815 → 8150), rounded to 4 decimal places, so
 * that 0.75 computed as 0.7499999999 counts as 0.75 and reaches its threshold.
 */
function basisPoints(fraction) {
  return Math.round(fraction * 10000);
}

/**
 * The grade `fraction` reaches on `scale` (a list of `{ grade, minPercent }`):
 * the best grade whose threshold it reaches. A fraction exactly on a threshold
 * gets the better grade.
 */
export function gradeFor(fraction, scale) {
  const reached = basisPoints(fraction);
  const ordered = [...scale].sort((a, b) => a.grade - b.grade);
  for (const { grade, minPercent } of ordered) {
    if (reached >= Math.round(minPercent * 100)) return grade;
  }
  return 5;
}

/** The semester an ISO date falls in, for `year` (`{ summerStartsOn }`). */
export function semesterOf(date, year) {
  return date < year.summerStartsOn ? "ws" : "ss";
}

/**
 * The entries a semester's own proposal is made of: those dated in it. The
 * summer semester counts summer entries only; the winter semester reaches the
 * year grade through `yearProposal`, not by being counted again.
 */
export function entriesOfSemester(entries, semester, year) {
  return entries.filter((entry) => semesterOf(entry.date, year) === semester);
}

/**
 * One fraction per category that has entries: `{ category: { fraction, count } }`.
 * Each entry is `{ category, value }`. A category without entries is absent,
 * not zero.
 */
export function categoryFractions(entries) {
  const sums = {};
  for (const { category, value } of entries) {
    const sum = (sums[category] ??= { total: 0, count: 0 });
    sum.total += value;
    sum.count += 1;
  }
  return Object.fromEntries(
    Object.entries(sums).map(([category, { total, count }]) => [category, { fraction: total / count, count }])
  );
}

/**
 * The mean of the category fractions present, weighted by `weights` (whole
 * percentages per category) scaled to the categories present. Null when no
 * category is present, or when every present category weighs nothing.
 */
export function weightedMean(categories, weights) {
  let weighted = 0;
  let total = 0;
  for (const [category, { fraction }] of Object.entries(categories)) {
    const weight = weights[category] ?? 0;
    weighted += weight * fraction;
    total += weight;
  }
  return total > 0 ? weighted / total : null;
}

/**
 * The proposal for one student's semester: each category's fraction and grade,
 * the weighted mean and its grade. `fraction` and `grade` are null for a
 * student without any entry that counts.
 */
export function proposal(entries, { semester, year, weights, scale }) {
  const counted = entriesOfSemester(entries, semester, year);
  const fractions = categoryFractions(counted);
  const categories = Object.fromEntries(
    Object.entries(fractions).map(([category, value]) => [category, { ...value, grade: gradeFor(value.fraction, scale) }])
  );
  const fraction = weightedMean(fractions, weights);
  return { categories, fraction, grade: fraction === null ? null : gradeFor(fraction, scale) };
}

/**
 * The fraction that stands for `grade` on `scale`: the middle of its range,
 * from its own threshold up to the next better grade's, or up to 100 % for a 1.
 * Computed from the scale as it is now, so it follows a change of the scale.
 */
export function bandMidpoint(grade, scale) {
  const own = scale.find((step) => step.grade === grade);
  const better = scale.find((step) => step.grade === grade - 1);
  if (!own) throw new Error(`The scale has no grade ${grade}.`);
  return (own.minPercent + (better ? better.minPercent : 100)) / 200;
}

/**
 * The year proposal: the winter semester's fraction times `share` (whole
 * percent) plus the summer semester's own fraction times the rest. The winter
 * fraction is its proposal's, or the band midpoint of its override - the
 * caller decides which. A side without a fraction leaves the other; with
 * neither there is no year proposal (null).
 */
export function yearProposal(winterFraction, summerFraction, share, scale) {
  let fraction;
  if (winterFraction === null && summerFraction === null) return null;
  if (winterFraction === null) fraction = summerFraction;
  else if (summerFraction === null) fraction = winterFraction;
  else fraction = (winterFraction * share + summerFraction * (100 - share)) / 100;
  return { fraction, grade: gradeFor(fraction, scale) };
}
