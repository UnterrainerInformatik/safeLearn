/**
 * The gradebook's records (`gradebook`): the grading scale, manual entries,
 * overrides with their comments, and the views made of them - a course's
 * overview for teachers, one student's record in a course for teachers, and a
 * student's own results. Plain SQL over the module's database, synchronous
 * like `DatabaseSync`; who may ask for what is the router's business.
 *
 * Proposals are computed on read by `grading.js` and never stored, so they
 * follow every new entry, weight and threshold at once (design.md, D7).
 */

import {
  currentYear,
  getCourse,
  getYear,
  inTransaction,
  InvalidInputError,
  listYears,
  NotFoundError,
  now,
  rosterOf,
  validDate,
} from "./classes.js";
import { entryCategory, gradeFor, proposal, semesters } from "./grading.js";

export const entryKinds = Object.freeze(Object.keys(entryCategory));

// ----------------------------------------------------------------- the scale

/** The grading scale, best grade first: `[{ grade, minPercent }]`. */
export function readScale(db) {
  return db
    .prepare("SELECT grade, min_percent FROM grading_scale ORDER BY grade")
    .all()
    .map((row) => ({ grade: row.grade, minPercent: row.min_percent }));
}

/**
 * Sets the thresholds of grades 1 to 4, in percent, given as
 * `{ 1: 88, 2: 75, 3: 63, 4: 50 }`. Below grade 4's threshold is a 5. Each
 * threshold has to lie above 0 and at most 100, with at most one decimal, and
 * below the one of the grade before it. Every proposal follows at once.
 */
export function updateScale(db, thresholds) {
  if (thresholds === null || typeof thresholds !== "object" || Array.isArray(thresholds)) {
    throw new InvalidInputError("The scale is one threshold in percent for each of the grades 1 to 4.");
  }
  const values = [1, 2, 3, 4].map((grade) => {
    const value = thresholds[grade];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100 || Math.round(value * 10) !== value * 10) {
      throw new InvalidInputError(`The threshold of grade ${grade} has to be a percentage above 0 and at most 100, with at most one decimal.`);
    }
    return value;
  });
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] >= values[i - 1]) {
      throw new InvalidInputError(`Grade ${i + 1} has to start below grade ${i}.`);
    }
  }
  inTransaction(db, () => {
    const update = db.prepare("UPDATE grading_scale SET min_percent = ? WHERE grade = ?");
    values.forEach((value, index) => update.run(value, index + 1));
    update.run(0, 5);
  });
  return readScale(db);
}

// --------------------------------------------------------------- the entries

/** The roster entry of `username` in a course's class, or null. Left students count. */
function rosterEntry(db, course, username) {
  return rosterOf(db, course.classId).find((entry) => entry.username === username) ?? null;
}

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

/** A student of the course: on its class's roster now or before. Anyone else is refused. */
function requireRosterEntry(db, course, username) {
  const key = normalizeUsername(username);
  const entry = rosterEntry(db, course, key);
  if (!entry) throw new InvalidInputError(`${key || "Nobody"} is not on the roster of this course's class.`);
  return entry;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * An entry as a teacher typed it, checked and turned into what is stored:
 *
 * - `kind`: `test`, `plusminus` or `homework`
 * - `mark`: `+` or `-`, for `plusminus` only
 * - `points` and `maxPoints`, or `fraction` (0 to 1), for `test` and `homework`
 * - `date`: inside the course's school year; it decides the semester
 * - `note`: optional, shown to the student with the entry
 */
function normalizeEntry(input, year) {
  const { kind } = input ?? {};
  if (!entryKinds.includes(kind)) {
    throw new InvalidInputError(`An entry is one of ${entryKinds.join(", ")}.`);
  }
  const date = validDate(input.date, "The entry's date");
  if (date < year.startsOn || date > year.endsOn) {
    throw new InvalidInputError(`The entry's date has to lie in the school year ${year.name}, ${year.startsOn} to ${year.endsOn}.`);
  }
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") {
    throw new InvalidInputError("A note is text.");
  }
  const note = input.note?.trim() ? input.note.trim() : null;
  if (note !== null && note.length > 500) throw new InvalidInputError("A note is at most 500 characters.");

  let value;
  let points = null;
  let maxPoints = null;
  if (kind === "plusminus") {
    const mark = typeof input.mark === "string" ? input.mark.trim().replace("−", "-") : null;
    if (mark !== "+" && mark !== "-") throw new InvalidInputError("A participation mark is + or -.");
    value = mark === "+" ? 1 : 0;
  } else if (input.maxPoints !== undefined && input.maxPoints !== null) {
    if (!isNumber(input.maxPoints) || input.maxPoints <= 0) {
      throw new InvalidInputError("The maximum has to be a number of points above 0.");
    }
    if (!isNumber(input.points) || input.points < 0 || input.points > input.maxPoints) {
      throw new InvalidInputError("The points have to lie between 0 and the maximum.");
    }
    points = input.points;
    maxPoints = input.maxPoints;
    value = points / maxPoints;
  } else {
    if (!isNumber(input.fraction) || input.fraction < 0 || input.fraction > 1) {
      throw new InvalidInputError("A result is given as points out of a maximum, or as a fraction from 0 to 1.");
    }
    value = input.fraction;
  }
  return { kind, value, points, maxPoints, date, note };
}

function entryFromRow(row, scale) {
  return {
    id: row.id,
    courseId: row.course_id,
    username: row.username,
    kind: row.kind,
    category: entryCategory[row.kind],
    value: row.value,
    points: row.points,
    maxPoints: row.max_points,
    // A participation mark is + or -, not a grade.
    grade: row.kind === "plusminus" ? null : gradeFor(row.value, scale),
    date: row.entered_on,
    note: row.note,
  };
}

/**
 * Every result of a course that counts towards its proposals, for one student
 * or for all, oldest first. Today these are the manual entries; online tests
 * add theirs in P3 under the category `onlineTests`.
 */
function courseEntries(db, courseId, scale, username = null) {
  const rows =
    username === null
      ? db.prepare("SELECT * FROM manual_entry WHERE course_id = ? ORDER BY entered_on, id").all(courseId)
      : db
          .prepare("SELECT * FROM manual_entry WHERE course_id = ? AND username = ? ORDER BY entered_on, id")
          .all(courseId, username);
  return rows.map((row) => entryFromRow(row, scale));
}

function getEntry(db, id) {
  const row = db.prepare("SELECT * FROM manual_entry WHERE id = ?").get(id);
  if (!row) throw new NotFoundError(`There is no entry ${id}.`);
  return row;
}

/**
 * Records entries for students of a course, all of them or none: a paper test
 * for the whole class is one call. Each item is an entry as `normalizeEntry`
 * takes it plus the `username` it is for. Answers the entries created.
 */
export function addEntries(db, courseId, items) {
  const course = getCourse(db, courseId);
  if (!Array.isArray(items) || items.length === 0) {
    throw new InvalidInputError("Nothing to record: the entries are a list of at least one.");
  }
  const scale = readScale(db);
  return inTransaction(db, () => {
    const insert = db.prepare(
      `INSERT INTO manual_entry (course_id, username, kind, value, points, max_points, entered_on, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    return items.map((item) => {
      const { username } = requireRosterEntry(db, course, item?.username);
      const entry = normalizeEntry(item, course.year);
      const stamp = now();
      const { lastInsertRowid } = insert.run(
        courseId,
        username,
        entry.kind,
        entry.value,
        entry.points,
        entry.maxPoints,
        entry.date,
        entry.note,
        stamp,
        stamp
      );
      return entryFromRow(getEntry(db, Number(lastInsertRowid)), scale);
    });
  });
}

/** Replaces an entry's kind, value, date and note. Whose entry it is stays. */
export function updateEntry(db, id, input) {
  const row = getEntry(db, id);
  const course = getCourse(db, row.course_id);
  const entry = normalizeEntry(input, course.year);
  db.prepare(
    `UPDATE manual_entry SET kind = ?, value = ?, points = ?, max_points = ?, entered_on = ?, note = ?, updated_at = ?
     WHERE id = ?`
  ).run(entry.kind, entry.value, entry.points, entry.maxPoints, entry.date, entry.note, now(), id);
  return entryFromRow(getEntry(db, id), readScale(db));
}

export function deleteEntry(db, id) {
  const row = getEntry(db, id);
  db.prepare("DELETE FROM manual_entry WHERE id = ?").run(id);
  return { deleted: id, courseId: row.course_id, username: row.username };
}

// ----------------------------------------------------- overrides and comments

function normalizeSemester(semester) {
  if (!semesters.includes(semester)) {
    throw new InvalidInputError(`A semester is ${semesters.join(" or ")}.`);
  }
  return semester;
}

/** The overrides and comments of a course, as `Map("username/semester" → row)`. */
function courseGrades(db, courseId) {
  const grades = new Map();
  for (const row of db.prepare("SELECT * FROM semester_grade WHERE course_id = ?").all(courseId)) {
    grades.set(`${row.username}/${row.semester}`, {
      override: row.override,
      comment: row.comment,
      commentVisible: row.comment_visible === 1,
    });
  }
  return grades;
}

/**
 * Sets, changes or removes a teacher's override and comment for one student's
 * semester. `override` is a grade from 1 to 5, or null for none - the proposal
 * is the grade again. The comment reaches the student only while
 * `commentVisible` is true. Neither override nor comment: nothing is kept.
 */
export function setSemesterGrade(db, courseId, username, semester, { override = null, comment = null, commentVisible = false } = {}) {
  const course = getCourse(db, courseId);
  const entry = requireRosterEntry(db, course, username);
  normalizeSemester(semester);
  if (override !== null && !(Number.isInteger(override) && override >= 1 && override <= 5)) {
    throw new InvalidInputError("An override is a grade from 1 to 5, or none.");
  }
  if (comment !== null && typeof comment !== "string") throw new InvalidInputError("A comment is text.");
  const text = comment?.trim() ? comment.trim() : null;
  if (text !== null && text.length > 2000) throw new InvalidInputError("A comment is at most 2000 characters.");
  if (typeof commentVisible !== "boolean") throw new InvalidInputError("Whether the student sees the comment is yes or no.");

  if (override === null && text === null) {
    db.prepare("DELETE FROM semester_grade WHERE course_id = ? AND username = ? AND semester = ?").run(
      courseId,
      entry.username,
      semester
    );
  } else {
    db.prepare(
      `INSERT INTO semester_grade (course_id, username, semester, override, comment, comment_visible, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (course_id, username, semester) DO UPDATE SET
         override = excluded.override, comment = excluded.comment,
         comment_visible = excluded.comment_visible, updated_at = excluded.updated_at`
    ).run(courseId, entry.username, semester, override, text, commentVisible ? 1 : 0, now());
  }
  return studentRecord(db, courseId, entry.username);
}

// ------------------------------------------------------------------ the views

/** The semester `today` (an ISO date) falls in for `year`; WS before the year starts. */
export function semesterToday(year, today = now().slice(0, 10)) {
  return today >= year.summerStartsOn ? "ss" : "ws";
}

/**
 * One student's semester as a teacher sees it: the categories, the proposal,
 * the override and comment if any, and the effective grade - the override
 * where there is one, the proposal otherwise.
 */
function teacherSemester(entries, grades, username, semester, course, scale) {
  const proposed = proposal(entries, { semester, year: course.year, weights: course.weights, scale });
  const set = grades.get(`${username}/${semester}`) ?? null;
  return {
    categories: proposed.categories,
    proposal: proposed.grade === null ? null : { fraction: proposed.fraction, grade: proposed.grade },
    override: set?.override ?? null,
    comment: set?.comment ?? null,
    commentVisible: set?.commentVisible ?? false,
    effective: set?.override ?? proposed.grade,
  };
}

/**
 * A course's overview for teachers, for one semester: a row per student on
 * the class's roster, those who left the roster separately.
 */
export function courseOverview(db, courseId, semester) {
  const course = getCourse(db, courseId);
  normalizeSemester(semester);
  const scale = readScale(db);
  const entries = courseEntries(db, courseId, scale);
  const grades = courseGrades(db, courseId);
  const byStudent = new Map();
  for (const entry of entries) {
    if (!byStudent.has(entry.username)) byStudent.set(entry.username, []);
    byStudent.get(entry.username).push(entry);
  }
  const rows = rosterOf(db, course.classId).map((student) => {
    const own = byStudent.get(student.username) ?? [];
    return {
      ...student,
      entries: own.length,
      ...teacherSemester(own, grades, student.username, semester, course, scale),
    };
  });
  return {
    course,
    semester,
    scale,
    students: rows.filter((row) => !row.leftAt),
    left: rows.filter((row) => row.leftAt),
  };
}

/** One student's record in a course, for teachers: every entry, and both semesters. */
export function studentRecord(db, courseId, username) {
  const course = getCourse(db, courseId);
  const key = normalizeUsername(username);
  const student = rosterEntry(db, course, key);
  if (!student) throw new NotFoundError(`${key} is not on the roster of this course's class.`);
  const scale = readScale(db);
  const entries = courseEntries(db, courseId, scale, key);
  const grades = courseGrades(db, courseId);
  return {
    course,
    student,
    scale,
    entries,
    semesters: Object.fromEntries(
      semesters.map((semester) => [semester, teacherSemester(entries, grades, key, semester, course, scale)])
    ),
  };
}

/**
 * Finds a course by class, subject and school year, the way a page names it
 * in a block: `yearName` like `2026/27`, the current year when it is not
 * given. Null if there is none.
 */
export function findCourse(db, { className, subject, yearName = null }) {
  const year =
    yearName === null
      ? currentYear(db)
      : (listYears(db).find((candidate) => candidate.name === String(yearName).trim()) ?? null);
  if (!year || typeof className !== "string" || typeof subject !== "string") return null;
  const row = db
    .prepare(
      `SELECT k.id FROM course k JOIN class c ON c.id = k.class_id
       WHERE c.school_year_id = ? AND c.name = ? AND k.subject = ? COLLATE NOCASE`
    )
    .get(year.id, className.trim().toLowerCase(), subject.trim());
  return row ? getCourse(db, row.id) : null;
}

/**
 * A student's own results in one school year (the current one unless `yearId`
 * names another), for that student only: every course of a class whose roster
 * they are or were on, with their own entries and, per semester, the category
 * fractions and the grade. While no override exists that is the proposal;
 * once one does, it is the override, and the proposal is not part of the
 * answer. A comment is part of it only while the teacher marks it visible. The
 * year grade (`ss`) is shown once the summer semester has begun, or once a
 * teacher set it.
 */
export function resultsOf(db, username, { yearId = null, today = now().slice(0, 10) } = {}) {
  const key = normalizeUsername(username);
  const years = db
    .prepare(
      `SELECT DISTINCT y.id FROM roster_entry r JOIN class c ON c.id = r.class_id JOIN school_year y ON y.id = c.school_year_id
       WHERE r.username = ? ORDER BY y.starts_on`
    )
    .all(key)
    .map((row) => getYear(db, row.id));
  const year = yearId === null ? (currentYear(db) ?? years.at(-1) ?? null) : getYear(db, yearId);
  if (!year) return { year: null, years, courses: [] };

  const scale = readScale(db);
  const rows = db
    .prepare(
      `SELECT k.id, r.left_at FROM roster_entry r JOIN class c ON c.id = r.class_id JOIN course k ON k.class_id = c.id
       WHERE r.username = ? AND c.school_year_id = ? ORDER BY k.subject COLLATE NOCASE`
    )
    .all(key, year.id);
  const courses = rows.map((row) => {
    const course = getCourse(db, row.id);
    const entries = courseEntries(db, course.id, scale, key);
    const grades = courseGrades(db, course.id);
    const shown = semesters.filter(
      (semester) =>
        semester === "ws" || today >= year.summerStartsOn || (grades.get(`${key}/${semester}`)?.override ?? null) !== null
    );
    return {
      id: course.id,
      subject: course.subject,
      className: course.className,
      leftAt: row.left_at,
      entries: entries.map(({ id, kind, category, value, points, maxPoints, grade, date, note }) => ({
        id,
        kind,
        category,
        value,
        points,
        maxPoints,
        grade,
        date,
        note,
      })),
      semesters: Object.fromEntries(
        shown.map((semester) => {
          const proposed = proposal(entries, { semester, year, weights: course.weights, scale });
          const set = grades.get(`${key}/${semester}`) ?? null;
          const overridden = (set?.override ?? null) !== null;
          return [
            semester,
            {
              categories: proposed.categories,
              grade: overridden ? set.override : proposed.grade,
              fraction: overridden ? null : proposed.fraction,
              overridden,
              comment: set?.commentVisible ? set.comment : null,
            },
          ];
        })
      ),
    };
  });
  return { year, years, courses };
}
