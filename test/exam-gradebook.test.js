/**
 * The gradebook (`gradebook`), unit by unit: the pure grading functions, then
 * entries, overrides, the course overview and a student's own results against
 * a database.
 *
 * No browser, no login, no server: every database lives in a temporary
 * directory created and removed by the check that uses it. The same behaviour
 * against a running instance is `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";

import { createClass, createCourse, createYear, InvalidInputError, NotFoundError, removeFromRoster, updateCourse } from "../exam/classes.js";
import { openDatabase } from "../exam/db.js";
import {
  addEntries,
  courseOverview,
  deleteEntry,
  findCourse,
  readScale,
  resultsOf,
  semesterToday,
  setSemesterGrade,
  studentRecord,
  updateEntry,
  updateScale,
} from "../exam/gradebook.js";
import { categoryFractions, entriesOfSemester, gradeFor, proposal, semesterOf, weightedMean } from "../exam/grading.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function freshDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-gradebook-"));
  temporaryDirs.push(dir);
  const { db } = openDatabase(path.join(dir, "exam.sqlite"));
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

  test("the winter semester counts its own entries, the summer semester the whole year", () => {
    assert.equal(semesterOf("2027-02-14", year), "ws");
    assert.equal(semesterOf("2027-02-15", year), "ss", "the first day of the summer semester belongs to it");
    const entries = [
      { category: "manualTests", value: 1, date: "2026-11-03" },
      { category: "manualTests", value: 0, date: "2027-03-10" },
    ];
    assert.deepEqual(entriesOfSemester(entries, "ws", year), [entries[0]]);
    assert.deepEqual(entriesOfSemester(entries, "ss", year), entries);

    const ws = proposal(entries, { semester: "ws", year, weights, scale: seededScale });
    const ss = proposal(entries, { semester: "ss", year, weights, scale: seededScale });
    assert.equal(ws.grade, 1);
    assert.equal(ss.fraction, 0.5);
    assert.equal(ss.grade, 4, "the year grade includes the winter semester");
  });

  test("a student without any entry has no proposal", () => {
    const empty = proposal([], { semester: "ws", year, weights, scale: seededScale });
    assert.deepEqual(empty, { categories: {}, fraction: null, grade: null });
  });
});

/** A school year, a class with two students and a course, ready for entries. */
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

const on = (date) => ({ date });

describe("manual entries", () => {
  test("a paper test in points is stored as its fraction and keeps what was typed", () => {
    const { db, course } = gradebookFixture();
    const [entry] = addEntries(db, course.id, [{ username: "anna", kind: "test", points: 17, maxPoints: 24, ...on("2026-11-03") }]);
    assert.equal(entry.value, 17 / 24);
    assert.equal(entry.points, 17);
    assert.equal(entry.maxPoints, 24);
    assert.equal(entry.category, "manualTests");
    assert.equal(entry.grade, 3, "17/24 is 70.8 %, a 3");
  });

  test("a participation mark is + (1) or − (0), a homework a fraction", () => {
    const { db, course } = gradebookFixture();
    const entries = addEntries(db, course.id, [
      { username: "anna", kind: "plusminus", mark: "+", ...on("2026-11-03") },
      { username: "anna", kind: "plusminus", mark: "−", ...on("2026-11-04") },
      { username: "anna", kind: "homework", fraction: 0.9, ...on("2026-11-05") },
    ]);
    assert.deepEqual(entries.map((e) => [e.category, e.value, e.grade]), [
      ["participation", 1, null],
      ["participation", 0, null],
      ["homework", 0.9, 1],
    ]);
  });

  test("malformed entries are refused, and a batch lands entirely or not at all", () => {
    const { db, course } = gradebookFixture();
    const refused = [
      { username: "anna", kind: "essay", fraction: 1, ...on("2026-11-03") },
      { username: "anna", kind: "test", fraction: 1.2, ...on("2026-11-03") },
      { username: "anna", kind: "test", points: 25, maxPoints: 24, ...on("2026-11-03") },
      { username: "anna", kind: "test", points: 5, maxPoints: 0, ...on("2026-11-03") },
      { username: "anna", kind: "plusminus", mark: "o", ...on("2026-11-03") },
      { username: "anna", kind: "test", fraction: 1, ...on("2026-08-31") },
      { username: "anna", kind: "test", fraction: 1, ...on("2027-07-03") },
      { username: "anna", kind: "test", fraction: 1, date: "3.11.2026" },
      { username: "nobody", kind: "test", fraction: 1, ...on("2026-11-03") },
    ];
    for (const item of refused) {
      assert.throws(() => addEntries(db, course.id, [item]), InvalidInputError, JSON.stringify(item));
    }
    assert.throws(
      () =>
        addEntries(db, course.id, [
          { username: "anna", kind: "test", fraction: 1, ...on("2026-11-03") },
          { username: "nobody", kind: "test", fraction: 1, ...on("2026-11-03") },
        ]),
      InvalidInputError
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM manual_entry").get().n, 0, "nothing of the refused batch landed");
  });

  test("an entry can be edited and deleted", () => {
    const { db, course } = gradebookFixture();
    const [entry] = addEntries(db, course.id, [{ username: "anna", kind: "test", fraction: 0.5, ...on("2026-11-03") }]);
    const edited = updateEntry(db, entry.id, { kind: "homework", fraction: 0.8, date: "2026-11-10", note: "late" });
    assert.deepEqual([edited.kind, edited.value, edited.date, edited.note, edited.username], ["homework", 0.8, "2026-11-10", "late", "anna"]);
    deleteEntry(db, entry.id);
    assert.equal(studentRecord(db, course.id, "anna").entries.length, 0);
    assert.throws(() => deleteEntry(db, entry.id), NotFoundError);
  });
});

describe("proposals, overrides and the course overview", () => {
  test("the proposal follows new entries and new weights; an override stays beside it", () => {
    const { db, course } = gradebookFixture();
    addEntries(db, course.id, [
      { username: "anna", kind: "test", fraction: 0.7, ...on("2026-11-03") },
      { username: "anna", kind: "plusminus", mark: "+", ...on("2026-11-04") },
    ]);
    const before = studentRecord(db, course.id, "anna").semesters.ws;
    // 30 % at 0.7 and 15 % at 1.0, scaled to 45 %.
    assert.ok(Math.abs(before.proposal.fraction - (30 * 0.7 + 15 * 1) / 45) < 1e-12);
    assert.equal(before.proposal.grade, 2);

    addEntries(db, course.id, [{ username: "anna", kind: "test", fraction: 0.4, ...on("2026-12-01") }]);
    assert.equal(studentRecord(db, course.id, "anna").semesters.ws.proposal.grade, 3, "a new entry is reflected at once");

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

  test("an override is a grade from 1 to 5 for a student on the roster", () => {
    const { db, course } = gradebookFixture();
    for (const override of [0, 6, 2.5, "2"]) {
      assert.throws(() => setSemesterGrade(db, course.id, "anna", "ws", { override }), InvalidInputError);
    }
    assert.throws(() => setSemesterGrade(db, course.id, "anna", "q3", { override: 2 }), InvalidInputError);
    assert.throws(() => setSemesterGrade(db, course.id, "nobody", "ws", { override: 2 }), InvalidInputError);
  });

  test("the overview has one row per attending student, those who left separately", () => {
    const { db, klass, course } = gradebookFixture();
    addEntries(db, course.id, [
      { username: "anna", kind: "test", fraction: 0.9, ...on("2026-11-03") },
      { username: "ben", kind: "test", fraction: 0.6, ...on("2026-11-03") },
      { username: "ben", kind: "test", fraction: 1, ...on("2027-03-03") },
    ]);
    removeFromRoster(db, klass.id, "ben");
    const ws = courseOverview(db, course.id, "ws");
    assert.deepEqual(ws.students.map((row) => [row.username, row.effective]), [["anna", 1]]);
    assert.deepEqual(ws.left.map((row) => [row.username, row.effective]), [["ben", 4]], "what was recorded for ben stays");
    const ss = courseOverview(db, course.id, "ss");
    assert.equal(ss.left[0].proposal.fraction, 0.8, "the year grade takes both semesters");
    assert.equal(ss.left[0].categories.manualTests.count, 2);
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

describe("a student's own results", () => {
  test("the proposal until an override, the override afterwards, the comment only when visible", () => {
    const { db, course } = gradebookFixture();
    addEntries(db, course.id, [{ username: "anna", kind: "test", points: 18, maxPoints: 24, note: "1st test", ...on("2026-11-03") }]);
    const winter = { today: "2026-11-20" };

    const proposed = resultsOf(db, "anna", winter).courses[0];
    assert.equal(proposed.subject, "WMC");
    assert.deepEqual(Object.keys(proposed.semesters), ["ws"], "the year grade is not shown before the summer semester");
    assert.deepEqual([proposed.semesters.ws.grade, proposed.semesters.ws.fraction, proposed.semesters.ws.overridden], [2, 0.75, false]);
    assert.deepEqual(proposed.entries.map((e) => [e.points, e.maxPoints, e.grade, e.note]), [[18, 24, 2, "1st test"]]);

    setSemesterGrade(db, course.id, "anna", "ws", { override: 1, comment: "strong oral exam", commentVisible: false });
    const overridden = resultsOf(db, "anna", winter).courses[0].semesters.ws;
    assert.deepEqual([overridden.grade, overridden.fraction, overridden.overridden, overridden.comment], [1, null, true, null]);
    assert.ok(!JSON.stringify(overridden).includes('"grade":2,"fraction"'), "the proposal is not part of the answer");

    setSemesterGrade(db, course.id, "anna", "ws", { override: 1, comment: "strong oral exam", commentVisible: true });
    assert.equal(resultsOf(db, "anna", winter).courses[0].semesters.ws.comment, "strong oral exam");

    assert.deepEqual(Object.keys(resultsOf(db, "anna", { today: "2027-02-15" }).courses[0].semesters), ["ws", "ss"]);
  });

  test("an answer holds the asking student's data and nobody else's", () => {
    const { db, course } = gradebookFixture();
    addEntries(db, course.id, [
      { username: "anna", kind: "test", fraction: 0.9, note: "anna's note", ...on("2026-11-03") },
      { username: "ben", kind: "test", fraction: 0.3, note: "ben's note", ...on("2026-11-03") },
    ]);
    setSemesterGrade(db, course.id, "ben", "ws", { override: 5, comment: "about ben", commentVisible: true });
    const anna = JSON.stringify(resultsOf(db, "ANNA"));
    assert.ok(anna.includes("anna's note"));
    for (const foreign of ["ben", "about ben", "0.3"]) assert.ok(!anna.includes(foreign), `anna's answer mentions ${foreign}`);
    assert.deepEqual(resultsOf(db, "carla").courses, [], "someone on no roster has no courses");
  });
});

describe("the grading scale", () => {
  test("starts at 88/75/63/50 and changes every proposal from then on", () => {
    const { db, course } = gradebookFixture();
    assert.deepEqual(readScale(db), seededScale);
    addEntries(db, course.id, [{ username: "anna", kind: "test", fraction: 0.8, ...on("2026-11-03") }]);
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
