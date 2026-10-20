/**
 * Deleting the records of students who have left (`school-year-change`,
 * exam-year-change design D3-D5). A student on no roster of the current year
 * is a leaver; their records are kept for the retention period after the end
 * of the last school year they were on a roster, and then deleted - only by a
 * teacher, after a report that names counts and never people.
 *
 * What goes: the student's results, overrides, attempts (with everything an
 * attempt holds), sitting participations, roster entries and the student
 * record itself. Courses, columns, tests and sittings stay; a column or a
 * test simply has one result fewer.
 *
 * Plain SQL over the module's database, synchronous like `DatabaseSync`.
 * Rows of a closed year are deleted through the `purge_in_progress` marker
 * (migration 010), the one exception the triggers allow.
 */

import { ConflictError, inTransaction, InvalidInputError } from "./classes.js";

/** The retention period when `EXAM_RETENTION_YEARS` is unset: two years (design D5). */
export const defaultRetentionYears = 2;

/**
 * `EXAM_RETENTION_YEARS` as a number of years: a whole number from 1 to 10,
 * the default when unset or empty. Anything else throws, naming the variable,
 * and the module stays off for that run.
 */
export function parseRetentionYears(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed === "") return defaultRetentionYears;
  const years = /^\d{1,2}$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!(years >= 1 && years <= 10)) {
    throw new Error(`EXAM_RETENTION_YEARS: "${trimmed}" is not a whole number of years from 1 to 10.`);
  }
  return years;
}

/** The ISO date `years` years after `iso`. */
function yearsAfter(iso, years) {
  return `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
}

/**
 * The usernames of the leavers who are due on `today` (`YYYY-MM-DD`, Vienna):
 * on no roster of the current year, and either never on any roster or with
 * their last year's end plus `years` before today. Without a current year
 * nobody is due.
 */
function dueStudents(db, today, years) {
  if (!db.prepare("SELECT 1 FROM school_year WHERE is_current = 1").get()) return [];
  return db
    .prepare(
      `SELECT s.username, MAX(y.ends_on) AS last_ends_on
       FROM student s
       LEFT JOIN roster_entry r ON r.username = s.username
       LEFT JOIN class c ON c.id = r.class_id
       LEFT JOIN school_year y ON y.id = c.school_year_id
       WHERE NOT EXISTS (
         SELECT 1 FROM roster_entry r2
         JOIN class c2 ON c2.id = r2.class_id
         JOIN school_year y2 ON y2.id = c2.school_year_id
         WHERE r2.username = s.username AND y2.is_current = 1
       )
       GROUP BY s.username
       ORDER BY s.username`
    )
    .all()
    .filter((row) => row.last_ends_on === null || yearsAfter(row.last_ends_on, years) < today)
    .map((row) => row.username);
}

/** The kinds of record a purge deletes, each with how its rows of one student are counted. */
const recordKinds = Object.freeze({
  results: "SELECT COUNT(*) AS n FROM manual_entry WHERE username = ?",
  overrides: "SELECT COUNT(*) AS n FROM semester_grade WHERE username = ?",
  attempts: "SELECT COUNT(*) AS n FROM attempt WHERE username = ?",
  sittings: "SELECT COUNT(*) AS n FROM sitting_participant WHERE username = ?",
  rosterEntries: "SELECT COUNT(*) AS n FROM roster_entry WHERE username = ?",
});

/**
 * What a purge on `today` would delete: how many students and how many records
 * of each kind, never who. `years` is the retention period.
 */
export function retentionReport(db, today, years = defaultRetentionYears) {
  const usernames = dueStudents(db, today, years);
  const records = {};
  for (const [kind, sql] of Object.entries(recordKinds)) {
    const count = db.prepare(sql);
    records[kind] = usernames.reduce((sum, username) => sum + count.get(username).n, 0);
  }
  return { years, students: usernames.length, records };
}

/** Whether a report a teacher confirmed still names the counts there are. */
function sameCounts(report, expected) {
  return (
    expected !== null &&
    typeof expected === "object" &&
    expected.students === report.students &&
    Object.keys(recordKinds).every((kind) => expected.records?.[kind] === report.records[kind])
  );
}

/**
 * Deletes the records of every leaver due on `today`, in one transaction,
 * after recomputing the report and comparing it with `expected` - the report
 * the teacher confirmed. Counts that changed meanwhile (a roster changed in
 * between) refuse the purge and delete nothing. Answers the report of what
 * was deleted.
 */
export function purgeLeavers(db, today, expected, years = defaultRetentionYears) {
  if (expected === null || typeof expected !== "object") throw new InvalidInputError("exam.errors.retention.noReport");
  return inTransaction(db, () => {
    const report = retentionReport(db, today, years);
    if (!sameCounts(report, expected)) throw new ConflictError("exam.errors.retention.changed");
    const usernames = dueStudents(db, today, years);
    db.prepare("INSERT INTO purge_in_progress (id) VALUES (1)").run();
    const statements = [
      "DELETE FROM manual_entry WHERE username = ?",
      "DELETE FROM semester_grade WHERE username = ?",
      // An attempt's questions, tokens, answers and refused browsers go with it.
      "DELETE FROM attempt WHERE username = ?",
      "DELETE FROM sitting_participant WHERE username = ?",
      "DELETE FROM roster_entry WHERE username = ?",
      "DELETE FROM student WHERE username = ?",
    ].map((sql) => db.prepare(sql));
    for (const username of usernames) {
      for (const statement of statements) statement.run(username);
    }
    db.prepare("DELETE FROM purge_in_progress").run();
    return report;
  });
}
