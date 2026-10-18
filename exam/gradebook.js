/**
 * The gradebook's records (`gradebook`, `gradebook-sheet`, `year-grade`): the
 * grading scale, a course's columns and the results in them, overrides with
 * their comments, and the views made of them - a course's sheet for teachers,
 * one student's record in a course for teachers, and a student's own results. Plain SQL over the module's database, synchronous
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
  weightCategories,
} from "./classes.js";
import { bandMidpoint, entryCategory, gradeFor, proposal, semesterOf, semesters, yearProposal } from "./grading.js";
import { viennaDate } from "./tests.js";

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
    throw new InvalidInputError("exam.errors.gradebook.scaleShape");
  }
  const values = [1, 2, 3, 4].map((grade) => {
    const value = thresholds[grade];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100 || Math.round(value * 10) !== value * 10) {
      throw new InvalidInputError("exam.errors.gradebook.thresholdRange", { grade });
    }
    return value;
  });
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] >= values[i - 1]) {
      throw new InvalidInputError("exam.errors.gradebook.thresholdOrder", { grade: i + 1, better: i });
    }
  }
  inTransaction(db, () => {
    const update = db.prepare("UPDATE grading_scale SET min_percent = ? WHERE grade = ?");
    values.forEach((value, index) => update.run(value, index + 1));
    update.run(0, 5);
  });
  return readScale(db);
}

// ------------------------------------------------------------ the columns

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
  if (!entry) {
    throw key ? new InvalidInputError("exam.errors.gradebook.notOnCourseRoster", { username: key }) : new InvalidInputError("exam.errors.gradebook.nobodyOnRoster");
  }
  return entry;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** A column's date: inside the course's school year, since it decides the semester. */
function columnDate(value, year) {
  const date = validDate(value, "exam.errors.gradebook.columnDateFormat");
  if (date < year.startsOn || date > year.endsOn) {
    throw new InvalidInputError("exam.errors.gradebook.columnDateRange", { year: year.name, from: year.startsOn, to: year.endsOn });
  }
  return date;
}

/** A column's name, trimmed; empty means "named by its date". */
function columnName(value, date) {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new InvalidInputError("exam.errors.gradebook.columnNameText");
  }
  const name = value?.trim() ? value.trim() : date;
  if (name.length > 100) throw new InvalidInputError("exam.errors.gradebook.columnNameLength");
  return name;
}

/** A column's maximum: null for a column in percent, or a number of points above 0. */
function columnMax(value, kind) {
  if (value === undefined || value === null) return null;
  if (kind === "plusminus") throw new InvalidInputError("exam.errors.gradebook.participationMax");
  if (!isNumber(value) || value <= 0) throw new InvalidInputError("exam.errors.gradebook.maxPositive");
  return value;
}

function columnFromRow(row, results = 0) {
  return {
    id: row.id,
    courseId: row.course_id,
    kind: row.kind,
    category: entryCategory[row.kind],
    name: row.name,
    date: row.held_on,
    maxPoints: row.max_points,
    results,
  };
}

function getColumnRow(db, id) {
  const row = db.prepare("SELECT * FROM assessment WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.gradebook.noColumn", { id });
  return row;
}

function resultCount(db, id) {
  return db.prepare("SELECT COUNT(*) AS n FROM manual_entry WHERE assessment_id = ?").get(id).n;
}

export function getColumn(db, id) {
  return columnFromRow(getColumnRow(db, id), resultCount(db, id));
}

/**
 * The columns of a course as the sheet shows them: grouped by category in the
 * config sheet's order, then by date, then by when they were added. With
 * `semester`, only the columns dated in it.
 */
export function courseColumns(db, courseId, semester = null) {
  const course = getCourse(db, courseId);
  const counts = new Map(
    db
      .prepare(
        `SELECT e.assessment_id AS id, COUNT(*) AS n FROM manual_entry e JOIN assessment a ON a.id = e.assessment_id
         WHERE a.course_id = ? GROUP BY e.assessment_id`
      )
      .all(courseId)
      .map((row) => [row.id, row.n])
  );
  const order = (column) => weightCategories.indexOf(column.category);
  const manual = db
    .prepare("SELECT * FROM assessment WHERE course_id = ? ORDER BY held_on, created_at, id")
    .all(courseId)
    .map((row) => columnFromRow(row, counts.get(row.id) ?? 0));
  return [...onlineColumns(db, courseId), ...manual]
    .filter((column) => semester === null || semesterOf(column.date, course.year) === semester)
    .sort((a, b) => order(a) - order(b));
}

/**
 * Adds a column to a course: a manual test, a participation round or a
 * homework, with a name, a date inside the school year and, for a test or a
 * homework, optionally a maximum. Without a maximum its results are percent.
 */
export function createColumn(db, courseId, input) {
  const course = getCourse(db, courseId);
  const { kind } = input ?? {};
  if (!entryKinds.includes(kind)) {
    throw new InvalidInputError("exam.errors.gradebook.columnKind", { kinds: entryKinds.join(", ") });
  }
  const date = columnDate(input.date, course.year);
  const name = columnName(input.name, date);
  const maxPoints = columnMax(input.maxPoints, kind);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO assessment (course_id, kind, name, held_on, max_points, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(courseId, kind, name, date, maxPoints, now());
  return getColumn(db, Number(lastInsertRowid));
}

/**
 * Renames, re-dates or changes the maximum of a column; what `input` leaves
 * out stays. A new maximum recomputes every result from its points in one
 * transaction, and is refused while a result has more points than it. A column
 * holding results keeps counting in points or in percent: switching between
 * the two would change what every typed result means.
 */
export function updateColumn(db, id, input = {}) {
  const row = getColumnRow(db, id);
  const course = getCourse(db, row.course_id);
  const date = input.date === undefined ? row.held_on : columnDate(input.date, course.year);
  const name = input.name === undefined ? row.name : columnName(input.name, date);
  const maxPoints = input.maxPoints === undefined ? row.max_points : columnMax(input.maxPoints, row.kind);
  const results = resultCount(db, id);
  if (results > 0 && (maxPoints === null) !== (row.max_points === null)) {
    throw new InvalidInputError(row.max_points === null ? "exam.errors.gradebook.percentKeepsNoMax" : "exam.errors.gradebook.pointsKeepMax");
  }
  if (maxPoints !== null && maxPoints !== row.max_points) {
    const highest = db.prepare("SELECT MAX(points) AS p FROM manual_entry WHERE assessment_id = ?").get(id).p;
    if (highest !== null && highest > maxPoints) {
      throw new InvalidInputError("exam.errors.gradebook.resultAboveMax", { highest, max: maxPoints });
    }
  }
  inTransaction(db, () => {
    db.prepare("UPDATE assessment SET name = ?, held_on = ?, max_points = ? WHERE id = ?").run(name, date, maxPoints, id);
    if (maxPoints !== null && maxPoints !== row.max_points) {
      db.prepare("UPDATE manual_entry SET value = points / ?, updated_at = ? WHERE assessment_id = ?").run(maxPoints, now(), id);
    }
  });
  return getColumn(db, id);
}

/** Deletes a column and every result in it. */
export function deleteColumn(db, id) {
  const row = getColumnRow(db, id);
  const results = inTransaction(db, () => {
    const { changes } = db.prepare("DELETE FROM manual_entry WHERE assessment_id = ?").run(id);
    db.prepare("DELETE FROM assessment WHERE id = ?").run(id);
    return changes;
  });
  return { deleted: id, courseId: row.course_id, results };
}

// ------------------------------------------------------------ the results

/**
 * A result as typed into a column's field, turned into what is stored: `mark`
 * (`+` or `-`) for participation, `points` (0 to the maximum) for a column
 * with a maximum, `percent` (0 to 100) for one without.
 */
function normalizeResult(input, column) {
  if (column.kind === "plusminus") {
    const mark = typeof input?.mark === "string" ? input.mark.trim().replace("−", "-") : null;
    if (mark !== "+" && mark !== "-") throw new InvalidInputError("exam.errors.gradebook.participationMark");
    return { value: mark === "+" ? 1 : 0, points: null };
  }
  if (column.max_points !== null) {
    const points = input?.points;
    if (!isNumber(points) || points < 0 || points > column.max_points) {
      throw new InvalidInputError("exam.errors.gradebook.pointsRange", { max: column.max_points });
    }
    return { value: points / column.max_points, points };
  }
  const percent = input?.percent;
  if (!isNumber(percent) || percent < 0 || percent > 100) {
    throw new InvalidInputError("exam.errors.gradebook.percentRange");
  }
  return { value: percent / 100, points: null };
}

/**
 * Sets one student's result in one column, replacing the one there was: a
 * student has at most one result per column. Answers the student's row of the
 * sheet for the column's semester, recomputed.
 */
export function setResult(db, columnId, username, input) {
  const column = getColumnRow(db, columnId);
  const course = getCourse(db, column.course_id);
  const student = requireRosterEntry(db, course, username);
  const { value, points } = normalizeResult(input, column);
  const stamp = now();
  db.prepare(
    `INSERT INTO manual_entry (assessment_id, username, value, points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (assessment_id, username) DO UPDATE SET value = excluded.value, points = excluded.points, updated_at = excluded.updated_at`
  ).run(columnId, student.username, value, points, stamp, stamp);
  return sheetRow(db, course, student.username, semesterOf(column.held_on, course.year));
}

/** Removes one student's result in one column, if there is one. Answers the row as `setResult` does. */
export function deleteResult(db, columnId, username) {
  const column = getColumnRow(db, columnId);
  const course = getCourse(db, column.course_id);
  const student = requireRosterEntry(db, course, username);
  db.prepare("DELETE FROM manual_entry WHERE assessment_id = ? AND username = ?").run(columnId, student.username);
  return sheetRow(db, course, student.username, semesterOf(column.held_on, course.year));
}

function entryFromRow(row, scale) {
  return {
    id: row.id,
    columnId: row.assessment_id,
    username: row.username,
    kind: row.kind,
    category: entryCategory[row.kind],
    value: row.value,
    points: row.points,
    maxPoints: row.max_points,
    // A participation mark is + or -, not a grade.
    grade: row.kind === "plusminus" ? null : gradeFor(row.value, scale),
    date: row.held_on,
    name: row.name,
  };
}

/**
 * The online tests of a course that have a sitting, as columns of the
 * category `onlineTests` (exam-online-tests design D3): named by the test,
 * dated by its first sitting's start in Vienna - which decides the semester,
 * also for a later make-up - and out of its number of questions. Their
 * results are the attempts', so the sheet shows them and never edits them.
 */
function onlineColumns(db, courseId) {
  return db
    .prepare(
      `SELECT t.id, t.name, t.created_at, MIN(s.opens_at) AS first_opens_at,
         (SELECT COUNT(*) FROM test_question q WHERE q.test_id = t.id) AS questions,
         (SELECT COUNT(*) FROM attempt a WHERE a.test_id = t.id AND a.submitted_at IS NOT NULL) AS results
       FROM test t JOIN sitting s ON s.test_id = t.id
       WHERE t.course_id = ?
       GROUP BY t.id
       ORDER BY MIN(s.opens_at), t.created_at, t.id`
    )
    .all(courseId)
    .map((row) => ({
      id: `test-${row.id}`,
      testId: row.id,
      courseId,
      kind: "online",
      category: "onlineTests",
      name: row.name,
      date: viennaDate(row.first_opens_at),
      maxPoints: row.questions,
      results: row.results,
      readOnly: true,
    }));
}

/** The submitted attempts of a course's online tests as entries - one student's, or everyone's. */
function onlineEntries(db, courseId, scale, username = null) {
  const columns = new Map(onlineColumns(db, courseId).map((column) => [column.testId, column]));
  const select = `SELECT a.id, a.test_id, a.username, a.score, a.question_count FROM attempt a JOIN test t ON t.id = a.test_id
    WHERE t.course_id = ? AND a.submitted_at IS NOT NULL`;
  const rows =
    username === null
      ? db.prepare(`${select} ORDER BY a.id`).all(courseId)
      : db.prepare(`${select} AND a.username = ? ORDER BY a.id`).all(courseId, username);
  return rows.map((row) => {
    const column = columns.get(row.test_id);
    const value = row.question_count === 0 ? 0 : row.score / row.question_count;
    return {
      id: `attempt-${row.id}`,
      columnId: column.id,
      username: row.username,
      kind: "online",
      category: "onlineTests",
      value,
      points: row.score,
      maxPoints: row.question_count,
      grade: gradeFor(value, scale),
      date: column.date,
      name: column.name,
    };
  });
}

/**
 * Every result of a course that counts towards its proposals, for one student
 * or for all, oldest first, each with its column's kind, name, date and
 * maximum: the manual columns' results and the submitted attempts of the
 * course's online tests, under the category `onlineTests`.
 */
function courseEntries(db, courseId, scale, username = null) {
  const select = `SELECT e.id, e.assessment_id, e.username, e.value, e.points, a.kind, a.name, a.held_on, a.max_points
    FROM manual_entry e JOIN assessment a ON a.id = e.assessment_id WHERE a.course_id = ?`;
  const rows =
    username === null
      ? db.prepare(`${select} ORDER BY a.held_on, a.created_at, a.id`).all(courseId)
      : db.prepare(`${select} AND e.username = ? ORDER BY a.held_on, a.created_at, a.id`).all(courseId, username);
  const manual = rows.map((row) => entryFromRow(row, scale));
  const online = onlineEntries(db, courseId, scale, username);
  if (online.length === 0) return manual;
  // A stable sort: entries of one date keep the order they had.
  return [...online, ...manual].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ----------------------------------------------------- overrides and comments

function normalizeSemester(semester) {
  if (!semesters.includes(semester)) {
    throw new InvalidInputError("exam.errors.gradebook.semester", { semesters: semesters.join(" or ") });
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
 * `commentVisible` is true. What `input` leaves out stays as it is, so a sheet
 * can save the override alone. Neither override nor comment: nothing is kept.
 */
export function setSemesterGrade(db, courseId, username, semester, input = {}) {
  const course = getCourse(db, courseId);
  const entry = requireRosterEntry(db, course, username);
  normalizeSemester(semester);
  const stored = courseGrades(db, courseId).get(`${entry.username}/${semester}`) ?? null;
  const override = input.override === undefined ? (stored?.override ?? null) : input.override;
  const comment = input.comment === undefined ? (stored?.comment ?? null) : input.comment;
  const commentVisible = input.commentVisible === undefined ? (stored?.commentVisible ?? false) : input.commentVisible;
  if (override !== null && !(Number.isInteger(override) && override >= 1 && override <= 5)) {
    throw new InvalidInputError("exam.errors.gradebook.override");
  }
  if (comment !== null && typeof comment !== "string") throw new InvalidInputError("exam.errors.gradebook.commentText");
  const text = comment?.trim() ? comment.trim() : null;
  if (text !== null && text.length > 2000) throw new InvalidInputError("exam.errors.gradebook.commentLength");
  if (typeof commentVisible !== "boolean") throw new InvalidInputError("exam.errors.gradebook.commentVisible");

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
 * The fraction the winter semester brings into the year grade, and the grade
 * shown for it: its proposal's while it has no override, the middle of the
 * override grade's band on the scale once it has one (`year-grade`).
 */
function winterContribution(entries, set, course, scale) {
  const proposed = proposal(entries, { semester: "ws", year: course.year, weights: course.weights, scale });
  const override = set?.override ?? null;
  if (override !== null) return { fraction: bandMidpoint(override, scale), grade: override, overridden: true };
  return { fraction: proposed.fraction, grade: proposed.grade, overridden: false };
}

/**
 * What a semester proposes for one student: the categories of its own
 * entries, and the proposal - for `ws` the mean of those, for `ss` the year
 * proposal, which also brings the winter semester's contribution as `winter`.
 */
function semesterProposal(entries, grades, username, semester, course, scale) {
  const own = proposal(entries, { semester, year: course.year, weights: course.weights, scale });
  if (semester === "ws") return { categories: own.categories, proposal: own.grade === null ? null : { fraction: own.fraction, grade: own.grade } };
  const winter = winterContribution(entries, grades.get(`${username}/ws`), course, scale);
  return {
    categories: own.categories,
    proposal: yearProposal(winter.fraction, own.fraction, course.winterShare, scale),
    winter,
  };
}

/**
 * One student's semester as a teacher sees it: the categories, the proposal,
 * the override and comment if any, and the effective grade - the override
 * where there is one, the proposal otherwise. The year (`ss`) also answers
 * the winter grade it builds on.
 */
function teacherSemester(entries, grades, username, semester, course, scale) {
  const proposed = semesterProposal(entries, grades, username, semester, course, scale);
  const set = grades.get(`${username}/${semester}`) ?? null;
  return {
    categories: proposed.categories,
    proposal: proposed.proposal,
    ...(proposed.winter ? { winter: { grade: proposed.winter.grade, overridden: proposed.winter.overridden } } : {}),
    override: set?.override ?? null,
    comment: set?.comment ?? null,
    commentVisible: set?.commentVisible ?? false,
    effective: set?.override ?? proposed.proposal?.grade ?? null,
  };
}

/** A student's results by column id, for the columns of `semester`: `{ id: { value, points } }`. */
function resultsByColumn(entries, semester, year) {
  return Object.fromEntries(
    entries
      .filter((entry) => semesterOf(entry.date, year) === semester)
      .map((entry) => [entry.columnId, { value: entry.value, points: entry.points }])
  );
}

/** One student's row of the sheet, as `courseOverview` answers it. */
function overviewRow(student, entries, grades, semester, course, scale) {
  return {
    ...student,
    entries: entries.length,
    results: resultsByColumn(entries, semester, course.year),
    ...teacherSemester(entries, grades, student.username, semester, course, scale),
  };
}

/** One student's row of the sheet for `semester`, recomputed, as a cell write answers it. */
function sheetRow(db, course, username, semester) {
  const scale = readScale(db);
  const student = rosterEntry(db, course, username);
  return overviewRow(student, courseEntries(db, course.id, scale, username), courseGrades(db, course.id), semester, course, scale);
}

/**
 * A course's sheet for teachers, for one semester: its columns in the order
 * the sheet shows them - those dated in that semester only - and a row per
 * student on the class's roster, those who left the roster separately.
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
  const rows = rosterOf(db, course.classId).map((student) =>
    overviewRow(student, byStudent.get(student.username) ?? [], grades, semester, course, scale)
  );
  return {
    course,
    semester,
    scale,
    columns: courseColumns(db, courseId, semester),
    students: rows.filter((row) => !row.leftAt),
    left: rows.filter((row) => row.leftAt),
  };
}

/**
 * One student's record in a course, for teachers: every result, both
 * semesters, and the students before and after them in the sheet (null at
 * either end).
 */
export function studentRecord(db, courseId, username) {
  const course = getCourse(db, courseId);
  const key = normalizeUsername(username);
  const student = rosterEntry(db, course, key);
  if (!student) throw new NotFoundError("exam.errors.gradebook.notOnCourseRoster", { username: key });
  const scale = readScale(db);
  const entries = courseEntries(db, courseId, scale, key);
  const grades = courseGrades(db, courseId);
  // The neighbours in the sheet's order: those attending, then those who left (design D10).
  const roster = rosterOf(db, course.classId);
  const order = [...roster.filter((entry) => !entry.leftAt), ...roster.filter((entry) => entry.leftAt)];
  const at = order.findIndex((entry) => entry.username === key);
  const neighbour = (entry) => (entry ? { username: entry.username, givenName: entry.givenName, familyName: entry.familyName } : null);
  return {
    course,
    student,
    scale,
    previous: neighbour(order[at - 1]),
    next: neighbour(order[at + 1]),
    entries: entries.map((entry) => ({ ...entry, semester: semesterOf(entry.date, course.year) })),
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
 * they are or were on, with their own results - each with its column's name and
 * date - and, per semester, the category fractions and the grade. While no override exists that is the proposal;
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
      entries: entries.map(({ id, kind, category, value, points, maxPoints, grade, date, name }) => ({
        id,
        kind,
        category,
        value,
        points,
        maxPoints,
        grade,
        date,
        name,
      })),
      semesters: Object.fromEntries(
        shown.map((semester) => {
          const proposed = semesterProposal(entries, grades, key, semester, course, scale);
          const set = grades.get(`${key}/${semester}`) ?? null;
          const overridden = (set?.override ?? null) !== null;
          return [
            semester,
            {
              categories: proposed.categories,
              grade: overridden ? set.override : (proposed.proposal?.grade ?? null),
              fraction: overridden ? null : (proposed.proposal?.fraction ?? null),
              overridden,
              ...(proposed.winter ? { winter: { grade: proposed.winter.grade, overridden: proposed.winter.overridden } } : {}),
              comment: set?.commentVisible ? set.comment : null,
            },
          ];
        })
      ),
    };
  });
  return { year, years, courses };
}
