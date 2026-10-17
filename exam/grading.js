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
 * The entries a semester's proposal is made of: those dated in the winter
 * semester for `ws`, and every entry of the school year for `ss`, whose grade
 * is the year grade.
 */
export function entriesOfSemester(entries, semester, year) {
  if (semester === "ss") return entries;
  return entries.filter((entry) => semesterOf(entry.date, year) === "ws");
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
