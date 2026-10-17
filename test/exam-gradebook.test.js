/**
 * The gradebook (`gradebook`, `gradebook-sheet`, `year-grade`), unit by unit:
 * the pure grading functions, then the migration of entries into columns,
 * columns and their results, overrides, the course's sheet, the year grade and
 * a student's own results against a database.
 *
 * No browser, no login, no server: every database lives in a temporary
 * directory created and removed by the check that uses it. The same behaviour
 * against a running instance is `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, test } from "node:test";

import { createClass, createCourse, createYear, InvalidInputError, NotFoundError, removeFromRoster, updateCourse } from "../exam/classes.js";
import { migrate, openDatabase, readMigrations } from "../exam/db.js";
import {
  courseColumns,
  courseOverview,
  createColumn,
  deleteColumn,
  deleteResult,
  findCourse,
  readScale,
  resultsOf,
  semesterToday,
  setResult,
  setSemesterGrade,
  studentRecord,
  updateColumn,
  updateScale,
} from "../exam/gradebook.js";
import {
  bandMidpoint,
  categoryFractions,
  entryCategory,
  entriesOfSemester,
  gradeFor,
  proposal,
  semesterOf,
  weightedMean,
  yearProposal,
} from "../exam/grading.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-gradebook-"));
  temporaryDirs.push(dir);
  return path.join(dir, "exam.sqlite");
}

function freshDatabase() {
  const { db } = openDatabase(temporaryPath());
  openDatabases.push(db);
  return db;
}

const seededScale = [
  { grade: 1, minPercent: 88 },
  { grade: 2, minPercent: 75 },
  { grade: 3, minPercent: 63 },
  { grade: 4, minPercent: 50 },
  { grade: 5, minPercent: 0 },
];

const year = { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" };
const weights = { onlineTests: 40, manualTests: 30, participation: 15, homework: 15 };

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? "the fraction"} is ${actual}, not ${expected}`);

describe("grading functions", () => {
  test("a fraction maps to the best grade whose threshold it reaches", () => {
    assert.equal(gradeFor(0.88, seededScale), 1);
    assert.equal(gradeFor(0.75, seededScale), 2, "exactly on the threshold gets the better grade");
    assert.equal(gradeFor(0.7499, seededScale), 3, "just below does not");
    assert.equal(gradeFor(0.63, seededScale), 3);
    assert.equal(gradeFor(0.5, seededScale), 4);
    assert.equal(gradeFor(0.4999, seededScale), 5);
    assert.equal(gradeFor(0, seededScale), 5);
    assert.equal(gradeFor(1, seededScale), 1);
  });

  test("a threshold is compared after rounding to four decimal places", () => {
    assert.equal(gradeFor(0.7499999999, seededScale), 2, "0.75 computed with a rounding error is not demoted");
    assert.equal(gradeFor(0.74994, seededScale), 3, "0.7499 is still below");
    assert.equal(gradeFor(0.1 + 0.2 + 0.45, seededScale), 2, "0.75000000000000001 and friends");
  });

  test("a category's fraction is the mean of its entries, and an empty category is absent", () => {
    const fractions = categoryFractions([
      { category: "manualTests", value: 0.5 },
      { category: "manualTests", value: 1 },
      { category: "participation", value: 1 },
    ]);
    assert.deepEqual(fractions, {
      manualTests: { fraction: 0.75, count: 2 },
      participation: { fraction: 1, count: 1 },
    });
  });

  test("the spec's example: 40/30/15/15 over 0.80, 0.70, 0.90, 1.00 is 0.815 and grade 2", () => {
    const categories = {
      onlineTests: { fraction: 0.8 },
      manualTests: { fraction: 0.7 },
      participation: { fraction: 0.9 },
      homework: { fraction: 1 },
    };
    const mean = weightedMean(categories, weights);
    assert.ok(Math.abs(mean - 0.815) < 1e-12, `the mean is ${mean}`);
    assert.equal(gradeFor(mean, seededScale), 2);
  });

  test("an empty category is left out and the remaining weights are scaled to 100 %", () => {
    const categories = { onlineTests: { fraction: 0.8 }, manualTests: { fraction: 0.7 }, participation: { fraction: 0.9 } };
    const expected = (40 * 0.8 + 30 * 0.7 + 15 * 0.9) / 85;
    assert.ok(Math.abs(weightedMean(categories, weights) - expected) < 1e-12);
  });

  test("no category, or only categories that weigh nothing, means no proposal", () => {
    assert.equal(weightedMean({}, weights), null);
    assert.equal(weightedMean({ homework: { fraction: 1 } }, { ...weights, homework: 0 }), null);
  });

  test("each semester counts the entries dated in it, the summer semester summer entries only", () => {
    assert.equal(semesterOf("2027-02-14", year), "ws");
    assert.equal(semesterOf("2027-02-15", year), "ss", "the first day of the summer semester belongs to it");
    const entries = [
      { category: "manualTests", value: 1, date: "2026-11-03" },
      { category: "manualTests", value: 0, date: "2027-03-10" },
    ];
    assert.deepEqual(entriesOfSemester(entries, "ws", year), [entries[0]]);
    assert.deepEqual(entriesOfSemester(entries, "ss", year), [entries[1]]);

    const ws = proposal(entries, { semester: "ws", year, weights, scale: seededScale });
    const ss = proposal(entries, { semester: "ss", year, weights, scale: seededScale });
    assert.equal(ws.grade, 1);
    assert.equal(ss.fraction, 0, "the summer semester's own fraction leaves the winter out");
  });

  test("a grade's band midpoint lies halfway to the next better grade's threshold", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5].map((grade) => bandMidpoint(grade, seededScale)),
      [0.94, 0.815, 0.69, 0.565, 0.25],
      "the spec's values for the initial scale"
    );
    const moved = seededScale.map((step) => (step.grade === 1 ? { ...step, minPercent: 90 } : step));
    assert.equal(bandMidpoint(1, moved), 0.95, "a scale change moves the midpoint");
    assert.equal(bandMidpoint(2, moved), 0.825);
  });

  test("the year proposal weighs the winter's fraction by the share and the summer's by the rest", () => {
    assert.deepEqual(yearProposal(0.8, 0.7, 50, seededScale).grade, 2);
    close(yearProposal(0.8, 0.7, 50, seededScale).fraction, 0.75, "both semesters at 50 %");
    close(yearProposal(bandMidpoint(1, seededScale), 0.7, 50, seededScale).fraction, 0.82, "an overridden 1 counts as 94 %");
    assert.equal(yearProposal(bandMidpoint(1, seededScale), 0.7, 50, seededScale).grade, 2);
    close(yearProposal(0.8, 0.7, 40, seededScale).fraction, 0.74, "a share of 40 %");
    close(yearProposal(0.8, 0.2, 100, seededScale).fraction, 0.8, "a share of 100 % is the winter alone");
    close(yearProposal(0.2, 0.8, 0, seededScale).fraction, 0.8, "a share of 0 % is the summer alone");
    assert.deepEqual(yearProposal(0.8, null, 50, seededScale), { fraction: 0.8, grade: 2 }, "no summer entries yet");
    assert.deepEqual(yearProposal(null, 0.6, 50, seededScale), { fraction: 0.6, grade: 4 }, "no winter result");
    assert.equal(yearProposal(null, null, 50, seededScale), null);
  });

  test("a student without any entry has no proposal", () => {
    const empty = proposal([], { semester: "ws", year, weights, scale: seededScale });
    assert.deepEqual(empty, { categories: {}, fraction: null, grade: null });
  });
});

/** A school year, a class with two students and a course, ready for columns. */
function gradebookFixture() {
  const db = freshDatabase();
  const schoolYear = createYear(db, year);
  const klass = createClass(db, schoolYear.id, {
    name: "4BHIF",
    students: [
      { username: "anna", givenName: "Anna", familyName: "Berger" },
      { username: "ben", givenName: "Ben", familyName: "Huber" },
    ],
  });
  const course = createCourse(db, klass.id, { subject: "WMC", language: "en", weights });
  return { db, schoolYear, klass, course };
}

/** A column with one result per `results` entry (`[username, input]`). */
function column(db, course, spec, results = []) {
  const created = createColumn(db, course.id, spec);
  for (const [username, input] of results) setResult(db, created.id, username, input);
  return created;
}

describe("existing entries become columns", () => {
  /** A database at schema version 3, as the module left it before columns. */
  function schemaThreeDatabase() {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 3));
    db.exec(`
      INSERT INTO school_year (id, name, starts_on, summer_starts_on, ends_on, is_current) VALUES (1, '2026/27', '2026-09-07', '2027-02-15', '2027-07-02', 1);
      INSERT INTO class (id, school_year_id, name) VALUES (1, 1, '4bhif'), (2, 1, '4ahif');
      INSERT INTO student (username) VALUES ('anna'), ('ben'), ('carla');
      INSERT INTO roster_entry (class_id, username, joined_at) VALUES (1, 'anna', 'x'), (1, 'ben', 'x'), (2, 'carla', 'x');
      INSERT INTO course (id, class_id, subject, weights) VALUES
        (1, 1, 'WMC', '{"onlineTests":40,"manualTests":30,"participation":15,"homework":15}'),
        (2, 2, 'NVS', '{"onlineTests":25,"manualTests":25,"participation":25,"homework":25}');
    `);
    const insert = db.prepare(
      `INSERT INTO manual_entry (course_id, username, kind, value, points, max_points, entered_on, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const rows = [
      // A paper test for the class, with a note, in points.
      [1, "anna", "test", 18 / 24, 18, 24, "2026-11-03", "1st test"],
      [1, "ben", "test", 6 / 24, 6, 24, "2026-11-03", "1st test"],
      // Same day, same maximum, no note: a column of its own.
      [1, "anna", "test", 20 / 24, 20, 24, "2026-11-03", null],
      // Participation without a note, both semesters.
      [1, "anna", "plusminus", 1, null, null, "2026-11-04", null],
      [1, "ben", "plusminus", 0, null, null, "2026-11-04", null],
      [1, "anna", "plusminus", 0, null, null, "2027-03-01", null],
      // A homework as a fraction, in the summer semester.
      [1, "ben", "homework", 0.9, null, null, "2027-04-01", "essay"],
      // Two results of one student in what would be one column.
      [1, "ben", "plusminus", 1, null, null, "2026-11-04", null],
      // Another course.
      [2, "carla", "test", 0.55, null, null, "2026-12-01", "1st test"],
    ];
    rows.forEach((row, index) => insert.run(...row, `2026-10-0${(index % 9) + 1}T00:00:00Z`, "2026-10-17T00:00:00Z"));
    db.exec(`INSERT INTO semester_grade (course_id, username, semester, override, comment, comment_visible, updated_at)
             VALUES (1, 'ben', 'ws', 4, 'oral exam', 1, 'x')`);
    const scale = readScale(db);
    const course = (id) => {
      const row = db.prepare("SELECT * FROM course WHERE id = ?").get(id);
      return { weights: JSON.parse(row.weights) };
    };
    // Every own semester proposal before the move, from the rows themselves.
    const before = {};
    for (const [courseId, username] of [[1, "anna"], [1, "ben"], [2, "carla"]]) {
      const entries = db
        .prepare("SELECT * FROM manual_entry WHERE course_id = ? AND username = ?")
        .all(courseId, username)
        .map((row) => ({ category: entryCategory[row.kind], value: row.value, date: row.entered_on }));
      for (const semester of ["ws", "ss"]) {
        before[`${courseId}/${username}/${semester}`] = proposal(entries, { semester, year, weights: course(courseId).weights, scale });
      }
    }
    const results = db
      .prepare("SELECT course_id, username, kind, value, points, max_points, entered_on FROM manual_entry ORDER BY id")
      .all()
      .map((row) => ({ ...row }));
    return { db, dbPath, before, results };
  }

  test("migrating from schema 3 groups entries into columns and changes no result, proposal or override", () => {
    const { db, dbPath, before, results } = schemaThreeDatabase();
    const migrated = migrate(db, dbPath);
    assert.deepEqual(migrated, { from: 3, to: readMigrations().length });

    const columns = db.prepare("SELECT * FROM assessment ORDER BY id").all();
    assert.deepEqual(
      columns.map((c) => [c.course_id, c.kind, c.name, c.held_on, c.max_points]),
      [
        [1, "test", "1st test", "2026-11-03", 24],
        [1, "test", "Test 2026-11-03", "2026-11-03", 24],
        [1, "plusminus", "Participation 2026-11-04", "2026-11-04", null],
        [1, "plusminus", "Participation 2027-03-01", "2027-03-01", null],
        [1, "homework", "essay", "2027-04-01", null],
        [1, "plusminus", "Participation 2026-11-04 (2)", "2026-11-04", null],
        [2, "test", "1st test", "2026-12-01", null],
      ],
      "one column per course, kind, date, maximum and note, named by the note or by kind and date"
    );

    const after = db
      .prepare(
        `SELECT a.course_id, e.username, a.kind, e.value, e.points, a.max_points, a.held_on AS entered_on
         FROM manual_entry e JOIN assessment a ON a.id = e.assessment_id ORDER BY e.id`
      )
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(after, results, "every result kept its value, points, maximum and date");

    for (const [key, proposed] of Object.entries(before)) {
      const [courseId, username, semester] = key.split("/");
      const record = studentRecord(db, Number(courseId), username).semesters[semester];
      assert.deepEqual(record.categories, proposed.categories, `${key}: the categories`);
      if (semester === "ws") assert.equal(record.proposal?.fraction ?? null, proposed.fraction, `${key}: the proposal`);
    }
    const ben = studentRecord(db, 1, "ben").semesters.ws;
    assert.deepEqual([ben.override, ben.comment, ben.commentVisible], [4, "oral exam", true], "the override stays");
    assert.equal(db.prepare("SELECT winter_share FROM course WHERE id = 1").get().winter_share, 50, "a course starts at 50 %");
    assert.equal(db.prepare("SELECT name FROM sqlite_temp_master").all().length, 0, "the migration leaves no temporary table");
  });
});

describe("columns and their results", () => {
  test("a paper test as a column: points out of its maximum, in the manual-test category", () => {
    const { db, course } = gradebookFixture();
    const test1 = column(db, course, { kind: "test", name: "1st test", date: "2026-11-03", maxPoints: 24 }, [["anna", { points: 17 }]]);
    assert.deepEqual([test1.category, test1.name, test1.date, test1.maxPoints], ["manualTests", "1st test", "2026-11-03", 24]);
    const [entry] = studentRecord(db, course.id, "anna").entries;
    assert.deepEqual([entry.value, entry.points, entry.maxPoints, entry.category, entry.date, entry.name], [17 / 24, 17, 24, "manualTests", "2026-11-03", "1st test"]);
    assert.equal(entry.grade, 3, "17/24 is 70.8 %, a 3");
  });

  test("a column without a name is named by its date; participation takes + or −, a column without a maximum percent", () => {
    const { db, course } = gradebookFixture();
    const round = column(db, course, { kind: "plusminus", date: "2026-11-04" }, [["anna", { mark: "+" }], ["ben", { mark: "−" }]]);
    assert.equal(round.name, "2026-11-04");
    assert.equal(round.category, "participation");
    const homework = column(db, course, { kind: "homework", name: "Essay", date: "2026-11-05" }, [["anna", { percent: 90 }]]);
    const anna = studentRecord(db, course.id, "anna").entries;
    assert.deepEqual(anna.map((e) => [e.category, e.value, e.grade]), [["participation", 1, null], ["homework", 0.9, 1]]);
    assert.equal(studentRecord(db, course.id, "ben").entries[0].value, 0);
    assert.throws(() => setResult(db, homework.id, "anna", { points: 9 }), InvalidInputError, "a column in percent takes percent");
  });

  test("malformed columns and results are refused", () => {
    const { db, course } = gradebookFixture();
    for (const spec of [
      { kind: "essay", date: "2026-11-03" },
      { kind: "test", date: "2026-08-31" },
      { kind: "test", date: "2027-07-03" },
      { kind: "test", date: "3.11.2026" },
      { kind: "test", date: "2026-11-03", maxPoints: 0 },
      { kind: "plusminus", date: "2026-11-03", maxPoints: 10 },
      { kind: "test", date: "2026-11-03", name: "x".repeat(101) },
    ]) {
      assert.throws(() => createColumn(db, course.id, spec), InvalidInputError, JSON.stringify(spec));
    }
    const points = createColumn(db, course.id, { kind: "test", date: "2026-11-03", maxPoints: 24 });
    const percent = createColumn(db, course.id, { kind: "test", date: "2026-11-03" });
    const marks = createColumn(db, course.id, { kind: "plusminus", date: "2026-11-03" });
    for (const [target, input] of [
      [points, { points: 25 }],
      [points, { points: -1 }],
      [points, { points: "18" }],
      [percent, { percent: 120 }],
      [marks, { mark: "o" }],
    ]) {
      assert.throws(() => setResult(db, target.id, "anna", input), InvalidInputError, JSON.stringify(input));
    }
    assert.throws(() => setResult(db, points.id, "nobody", { points: 1 }), InvalidInputError, "only a student on the roster");
    assert.throws(() => setResult(db, 9999, "anna", { points: 1 }), NotFoundError);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM manual_entry").get().n, 0, "nothing refused landed");
  });

  test("two results in one column: the second replaces the first", () => {
    const { db, course } = gradebookFixture();
    const test1 = column(db, course, { kind: "test", date: "2026-11-03", maxPoints: 24 }, [["anna", { points: 12 }]]);
    const row = setResult(db, test1.id, "anna", { points: 18 });
    assert.equal(studentRecord(db, course.id, "anna").entries.length, 1, "still exactly one result");
    assert.deepEqual(row.results, { [test1.id]: { value: 0.75, points: 18 } }, "the answer is the recomputed row");
    assert.equal(row.proposal.grade, 2);
    assert.equal(row.effective, 2);
  });

  test("emptying a field removes the result, and the row follows", () => {
    const { db, course } = gradebookFixture();
    const test1 = column(db, course, { kind: "test", date: "2026-11-03", maxPoints: 24 }, [["anna", { points: 18 }]]);
    const row = deleteResult(db, test1.id, "anna");
    assert.deepEqual([row.results, row.proposal, row.effective], [{}, null, null]);
    assert.equal(deleteResult(db, test1.id, "anna").proposal, null, "removing nothing changes nothing");
  });

  test("a column is renamed and re-dated; a new maximum recomputes its results or is refused", () => {
    const { db, course } = gradebookFixture();
    const test1 = column(db, course, { kind: "test", name: "1st test", date: "2026-11-03", maxPoints: 24 }, [["anna", { points: 20 }]]);
    const renamed = updateColumn(db, test1.id, { name: "Test 1", date: "2026-11-05" });
    assert.deepEqual([renamed.name, renamed.date, renamed.maxPoints, renamed.results], ["Test 1", "2026-11-05", 24, 1]);

    updateColumn(db, test1.id, { maxPoints: 30 });
    const [entry] = studentRecord(db, course.id, "anna").entries;
    assert.deepEqual([entry.points, entry.maxPoints], [20, 30]);
    close(entry.value, 20 / 30, "the result became 20/30");

    assert.throws(() => updateColumn(db, test1.id, { maxPoints: 18 }), /20 points/, "a maximum below a stored result");
    assert.equal(studentRecord(db, course.id, "anna").entries[0].maxPoints, 30, "the column kept its maximum");
    assert.throws(() => updateColumn(db, test1.id, { maxPoints: null }), InvalidInputError, "points do not turn into percent");
    assert.throws(() => updateColumn(db, test1.id, { date: "2027-07-03" }), InvalidInputError);

    const empty = createColumn(db, course.id, { kind: "homework", date: "2026-11-03" });
    assert.equal(updateColumn(db, empty.id, { maxPoints: 10 }).maxPoints, 10, "an empty column may change both ways");
  });

  test("deleting a column removes its results", () => {
    const { db, course } = gradebookFixture();
    const test1 = column(db, course, { kind: "test", date: "2026-11-03", maxPoints: 24 }, [["anna", { points: 20 }], ["ben", { points: 10 }]]);
    assert.deepEqual(deleteColumn(db, test1.id), { deleted: test1.id, courseId: course.id, results: 2 });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM manual_entry").get().n, 0);
    assert.throws(() => deleteColumn(db, test1.id), NotFoundError);
  });

  test("the sheet's columns: by category in the config sheet's order, then date, then when added, per semester", () => {
    const { db, course } = gradebookFixture();
    const late = createColumn(db, course.id, { kind: "test", name: "2nd test", date: "2026-11-03" });
    const homework = createColumn(db, course.id, { kind: "homework", name: "HW", date: "2026-10-01" });
    const round = createColumn(db, course.id, { kind: "plusminus", name: "round", date: "2026-10-02" });
    const early = createColumn(db, course.id, { kind: "test", name: "1st test", date: "2026-10-20" });
    const sameDay = createColumn(db, course.id, { kind: "test", name: "retake", date: "2026-11-03" });
    const summer = createColumn(db, course.id, { kind: "test", name: "summer test", date: "2027-03-01" });
    assert.deepEqual(courseColumns(db, course.id, "ws").map((c) => c.id), [early.id, late.id, sameDay.id, round.id, homework.id]);
    assert.deepEqual(courseColumns(db, course.id, "ss").map((c) => c.id), [summer.id]);
    const overview = courseOverview(db, course.id, "ws");
    assert.deepEqual(overview.columns.map((c) => c.name), ["1st test", "2nd test", "retake", "round", "HW"]);
  });
});

describe("proposals, overrides and the course overview", () => {
  test("the proposal follows new results and new weights; an override stays beside it", () => {
    const { db, course } = gradebookFixture();
    column(db, course, { kind: "test", date: "2026-11-03" }, [["anna", { percent: 70 }]]);
    column(db, course, { kind: "plusminus", date: "2026-11-04" }, [["anna", { mark: "+" }]]);
    const before = studentRecord(db, course.id, "anna").semesters.ws;
    // 30 % at 0.7 and 15 % at 1.0, scaled to 45 %.
    close(before.proposal.fraction, (30 * 0.7 + 15 * 1) / 45);
    assert.equal(before.proposal.grade, 2);

    column(db, course, { kind: "test", date: "2026-12-01" }, [["anna", { percent: 40 }]]);
    assert.equal(studentRecord(db, course.id, "anna").semesters.ws.proposal.grade, 3, "a new result is reflected at once");

    updateCourse(db, course.id, { weights: { onlineTests: 0, manualTests: 10, participation: 90, homework: 0 } });
    assert.equal(studentRecord(db, course.id, "anna").semesters.ws.proposal.grade, 1, "so are new weights");

    const set = setSemesterGrade(db, course.id, "anna", "ws", { override: 2, comment: "strong oral exam", commentVisible: false });
    assert.deepEqual(
      [set.semesters.ws.proposal.grade, set.semesters.ws.override, set.semesters.ws.comment, set.semesters.ws.effective],
      [1, 2, "strong oral exam", 2],
      "teachers see the proposal, the override and the comment"
    );
    const removed = setSemesterGrade(db, course.id, "anna", "ws", { override: null, comment: "" });
    assert.equal(removed.semesters.ws.effective, 1, "without the override the proposal counts again");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM semester_grade").get().n, 0, "an empty row is not kept");
  });

  test("the override alone can be saved, and keeps the comment that is there", () => {
    const { db, course } = gradebookFixture();
    setSemesterGrade(db, course.id, "anna", "ws", { comment: "oral exam", commentVisible: true });
    const set = setSemesterGrade(db, course.id, "anna", "ws", { override: 2 }).semesters.ws;
    assert.deepEqual([set.override, set.comment, set.commentVisible], [2, "oral exam", true]);
    const cleared = setSemesterGrade(db, course.id, "anna", "ws", { override: null }).semesters.ws;
    assert.deepEqual([cleared.override, cleared.comment], [null, "oral exam"]);
  });

  test("an override is a grade from 1 to 5 for a student on the roster", () => {
    const { db, course } = gradebookFixture();
    for (const override of [0, 6, 2.5, "2"]) {
      assert.throws(() => setSemesterGrade(db, course.id, "anna", "ws", { override }), InvalidInputError);
    }
    assert.throws(() => setSemesterGrade(db, course.id, "anna", "q3", { override: 2 }), InvalidInputError);
    assert.throws(() => setSemesterGrade(db, course.id, "nobody", "ws", { override: 2 }), InvalidInputError);
  });

  test("the overview has one row per attending student with their results by column, those who left separately", () => {
    const { db, klass, course } = gradebookFixture();
    const winter = column(db, course, { kind: "test", date: "2026-11-03" }, [["anna", { percent: 90 }], ["ben", { percent: 60 }]]);
    const summer = column(db, course, { kind: "test", date: "2027-03-03" }, [["ben", { percent: 100 }]]);
    removeFromRoster(db, klass.id, "ben");
    const ws = courseOverview(db, course.id, "ws");
    assert.deepEqual(ws.columns.map((c) => c.id), [winter.id], "a winter answer has the winter's columns");
    assert.deepEqual(ws.students.map((row) => [row.username, row.effective]), [["anna", 1]]);
    assert.deepEqual(ws.students[0].results, { [winter.id]: { value: 0.9, points: null } });
    assert.deepEqual(ws.left.map((row) => [row.username, row.effective]), [["ben", 4]], "what was recorded for ben stays");
    assert.deepEqual(Object.keys(ws.left[0].results), [String(winter.id)], "and only the semester's results");
    const ss = courseOverview(db, course.id, "ss");
    assert.deepEqual(ss.columns.map((c) => c.id), [summer.id], "the year view has the summer's columns only");
    assert.equal(ss.left[0].categories.manualTests.count, 1, "the summer's own categories count summer results only");
    close(ss.left[0].proposal.fraction, 0.8, "the year proposal combines 0.6 and 1.0 at 50 %");
    assert.deepEqual(ss.left[0].winter, { grade: 4, overridden: false }, "the winter grade it builds on");
  });

  test("a course is found by class, subject and school year, the current one by default", () => {
    const { db, course } = gradebookFixture();
    assert.equal(findCourse(db, { className: "4bhif", subject: "wmc" }).id, course.id);
    assert.equal(findCourse(db, { className: "4BHIF", subject: "WMC", yearName: "2026/27" }).id, course.id);
    assert.equal(findCourse(db, { className: "4bhif", subject: "WMC", yearName: "2027/28" }), null);
    assert.equal(findCourse(db, { className: "4ahif", subject: "WMC" }), null);
  });

  test("the semester running today", () => {
    assert.equal(semesterToday(year, "2026-10-17"), "ws");
    assert.equal(semesterToday(year, "2027-02-15"), "ss");
  });
});

describe("the year grade", () => {
  /** Anna at 0.80 in the winter and 0.70 in the summer, both in manual tests. */
  function twoSemesters() {
    const fixture = gradebookFixture();
    const { db, course } = fixture;
    column(db, course, { kind: "test", date: "2026-11-03" }, [["anna", { percent: 80 }]]);
    column(db, course, { kind: "test", date: "2027-03-03" }, [["anna", { percent: 70 }]]);
    return fixture;
  }

  test("both semesters present: the weighted mean by the winter share", () => {
    const { db, course } = twoSemesters();
    const ss = studentRecord(db, course.id, "anna").semesters.ss;
    close(ss.proposal.fraction, 0.75);
    assert.equal(ss.proposal.grade, 2);
    assert.deepEqual(ss.winter, { grade: 2, overridden: false });
    assert.equal(ss.categories.manualTests.fraction, 0.7, "the summer's own categories");

    updateCourse(db, course.id, { winterShare: 40 });
    close(studentRecord(db, course.id, "anna").semesters.ss.proposal.fraction, 0.74, "a new share recalculates the year");
    updateCourse(db, course.id, { winterShare: 100 });
    close(studentRecord(db, course.id, "anna").semesters.ss.proposal.fraction, 0.8);
    updateCourse(db, course.id, { winterShare: 0 });
    close(studentRecord(db, course.id, "anna").semesters.ss.proposal.fraction, 0.7);
    for (const winterShare of [-1, 101, 50.5, "50"]) {
      assert.throws(() => updateCourse(db, course.id, { winterShare }), InvalidInputError, JSON.stringify(winterShare));
    }
  });

  test("an overridden winter counts as its band's midpoint on the current scale, and the year override stays", () => {
    const { db, course } = twoSemesters();
    setSemesterGrade(db, course.id, "anna", "ws", { override: 1 });
    let ss = studentRecord(db, course.id, "anna").semesters.ss;
    close(ss.proposal.fraction, 0.82, "(0.94 + 0.70) / 2");
    assert.equal(ss.proposal.grade, 2);
    assert.deepEqual(ss.winter, { grade: 1, overridden: true });

    updateScale(db, { 1: 90, 2: 75, 3: 63, 4: 50 });
    ss = studentRecord(db, course.id, "anna").semesters.ss;
    close(ss.proposal.fraction, (0.95 + 0.7) / 2, "the midpoint follows the scale");

    setSemesterGrade(db, course.id, "anna", "ss", { override: 3 });
    updateCourse(db, course.id, { winterShare: 30 });
    ss = studentRecord(db, course.id, "anna").semesters.ss;
    assert.deepEqual([ss.override, ss.effective], [3, 3], "a year override is untouched by a new share");
  });

  test("no summer entries yet: the year proposal is the winter's", () => {
    const { db, course } = gradebookFixture();
    column(db, course, { kind: "test", date: "2026-11-03" }, [["anna", { percent: 80 }]]);
    const ss = studentRecord(db, course.id, "anna").semesters.ss;
    assert.deepEqual(ss.categories, {}, "no summer category");
    assert.deepEqual(ss.proposal, { fraction: 0.8, grade: 2 });
    assert.equal(studentRecord(db, course.id, "ben").semesters.ss.proposal, null, "neither semester: no year proposal");
  });

  test("a new course starts at a winter share of 50 %", () => {
    const { course } = gradebookFixture();
    assert.equal(course.winterShare, 50);
  });
});

describe("a student's own results", () => {
  test("the proposal until an override, the override afterwards, the comment only when visible", () => {
    const { db, course } = gradebookFixture();
    column(db, course, { kind: "test", name: "1st test", date: "2026-11-03", maxPoints: 24 }, [["anna", { points: 18 }]]);
    const winter = { today: "2026-11-20" };

    const proposed = resultsOf(db, "anna", winter).courses[0];
    assert.equal(proposed.subject, "WMC");
    assert.deepEqual(Object.keys(proposed.semesters), ["ws"], "the year grade is not shown before the summer semester");
    assert.deepEqual([proposed.semesters.ws.grade, proposed.semesters.ws.fraction, proposed.semesters.ws.overridden], [2, 0.75, false]);
    assert.deepEqual(
      proposed.entries.map((e) => [e.points, e.maxPoints, e.grade, e.name, e.date]),
      [[18, 24, 2, "1st test", "2026-11-03"]],
      "each result with its column's name and date"
    );
    assert.ok(!("note" in proposed.entries[0]), "a result carries no note of its own");

    setSemesterGrade(db, course.id, "anna", "ws", { override: 1, comment: "strong oral exam", commentVisible: false });
    const overridden = resultsOf(db, "anna", winter).courses[0].semesters.ws;
    assert.deepEqual([overridden.grade, overridden.fraction, overridden.overridden, overridden.comment], [1, null, true, null]);
    assert.ok(!JSON.stringify(overridden).includes('"grade":2,"fraction"'), "the proposal is not part of the answer");

    setSemesterGrade(db, course.id, "anna", "ws", { override: 1, comment: "strong oral exam", commentVisible: true });
    assert.equal(resultsOf(db, "anna", winter).courses[0].semesters.ws.comment, "strong oral exam");

    const summer = resultsOf(db, "anna", { today: "2027-02-15" }).courses[0].semesters;
    assert.deepEqual(Object.keys(summer), ["ws", "ss"]);
    assert.deepEqual([summer.ss.grade, summer.ss.fraction], [1, 0.94], "the year builds on the overridden winter");
    assert.deepEqual(summer.ss.winter, { grade: 1, overridden: true });
  });

  test("an answer holds the asking student's data and nobody else's", () => {
    const { db, course } = gradebookFixture();
    column(db, course, { kind: "test", name: "1st test", date: "2026-11-03" }, [["anna", { percent: 90 }], ["ben", { percent: 30 }]]);
    column(db, course, { kind: "test", name: "ben's retake", date: "2026-11-10" }, [["ben", { percent: 40 }]]);
    setSemesterGrade(db, course.id, "ben", "ws", { override: 5, comment: "about ben", commentVisible: true });
    const anna = JSON.stringify(resultsOf(db, "ANNA"));
    assert.ok(anna.includes("1st test"));
    for (const foreign of ["ben", "about ben", "0.3", "retake"]) assert.ok(!anna.includes(foreign), `anna's answer mentions ${foreign}`);
    assert.deepEqual(resultsOf(db, "carla").courses, [], "someone on no roster has no courses");
  });
});

describe("the grading scale", () => {
  test("starts at 88/75/63/50 and changes every proposal from then on", () => {
    const { db, course } = gradebookFixture();
    assert.deepEqual(readScale(db), seededScale);
    column(db, course, { kind: "test", date: "2026-11-03" }, [["anna", { percent: 80 }]]);
    assert.equal(studentRecord(db, course.id, "anna").semesters.ws.effective, 2);
    updateScale(db, { 1: 80, 2: 70, 3: 60, 4: 50 });
    assert.equal(studentRecord(db, course.id, "anna").semesters.ws.effective, 1);
  });

  test("refuses thresholds out of order or out of range", () => {
    const db = freshDatabase();
    for (const thresholds of [
      { 1: 75, 2: 88, 3: 63, 4: 50 },
      { 1: 88, 2: 75, 3: 63, 4: 63 },
      { 1: 101, 2: 75, 3: 63, 4: 50 },
      { 1: 88, 2: 75, 3: 63, 4: 0 },
      { 1: 88, 2: 75, 3: 63 },
      { 1: 88, 2: 75.25, 3: 63, 4: 50 },
      null,
    ]) {
      assert.throws(() => updateScale(db, thresholds), InvalidInputError, JSON.stringify(thresholds));
    }
    assert.deepEqual(readScale(db), seededScale, "nothing changed");
  });
});
