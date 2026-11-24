/**
 * Online tests (`online-test`), unit by unit: the migration that adds them,
 * assembling a test from the pool with its snapshot, and changing or deleting
 * a test only until it is first written.
 *
 * No browser, no login: every database lives in a temporary directory removed
 * after the check. Only the review's routes are asked through a local express
 * app, with sessions made up in the request. The same behaviour against a running
 * instance is `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, test } from "node:test";

import { addToRoster, ConflictError, createClass, createCourse, createYear, ForbiddenError, InvalidInputError, removeFromRoster, setCurrentYear } from "../exam/classes.js";
import { purgeLeavers, retentionReport } from "../exam/retention.js";
import { init } from "../exam/index.js";
import express from "express";
import { migrate, openDatabase, readMigrations } from "../exam/db.js";
import { courseOverview, createColumn, readScale, resultsOf, setNote, setResult, studentRecord } from "../exam/gradebook.js";
import { entryCategory, proposal } from "../exam/grading.js";
import { getQuestion, listQuestions } from "../exam/pool.js";
import { NotFoundError } from "../exam/classes.js";
import { importPool } from "../exam/pool-import.js";
import {
  createOfflineTest,
  createSitting,
  createTest,
  deleteSitting,
  deleteTest,
  discardTest,
  endSitting,
  extendSitting,
  extendStartWindow,
  extendWritingTime,
  getTest,
  listTests,
  removeWrittenQuestion,
  rescheduleSitting,
  testSittings,
  updateSitting,
  updateTest,
  viennaDate,
} from "../exam/tests.js";
import {
  checkDevice,
  correctShares,
  previewView,
  deleteAttempt,
  DeviceRefusedError,
  finalizeDue,
  openTestsOf,
  ownAttempt,
  recordBeat,
  recordFocus,
  releaseAttempt,
  courseAttempt,
  questionScores,
  reviewOpen,
  reviewView,
  studentReview,
  saveAnswer,
  scoreAttempt,
  startAttempt,
  submitAttempt,
  writingView,
} from "../exam/attempts.js";
import { studentMaySeeImage } from "../exam/pool.js";
import { deleteQuestion, saveQuestion } from "../exam/pool-edit.js";
import { listen, liveParticipant, liveSnapshot } from "../exam/live.js";
import { setTeacherNote, teacherNoteOf } from "../exam/teacher-notes.js";
import { browserLabel, parseUserAgent } from "../exam/user-agent.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-tests-"));
  temporaryDirs.push(dir);
  return path.join(dir, "exam.sqlite");
}

function freshDatabase() {
  const { db } = openDatabase(temporaryPath());
  openDatabases.push(db);
  return db;
}

// A 1×1 PNG.
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** A trimmed Moodle export: one category, a question with an image, a multichoiceset and a true/false. */
function poolXml(lang) {
  const de = lang === "de";
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/HTTP/${de ? "Grundlagen" : "Basics"}</text></category></question>
  <question type="multichoice"><name><text>Bild ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p><img src="@@PLUGINFILE@@/image.png" alt="">${lang} picture (1 ${de ? "richtige Antwort" : "correct answer"})</p>]]></text>
      <file name="image.png" path="/" encoding="base64">${pixel}</file></questiontext>
    <answer fraction="100" format="html"><text><![CDATA[<p>yes ${lang}</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>no ${lang}</p>]]></text></answer>
  </question>
  <question type="multichoiceset"><name><text>Methoden ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>${lang} idempotent (2 ${de ? "richtige Antworten" : "correct answers"})</p>]]></text></questiontext>
    <answer fraction="50" format="html"><text><![CDATA[<p>GET</p>]]></text></answer>
    <answer fraction="50" format="html"><text><![CDATA[<p>PUT</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>POST</p>]]></text></answer>
  </question>
  <question type="truefalse"><name><text>Wahr ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>${lang} statement</p>]]></text></questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>
</quiz>`;
}

/** A database with a school year, the class 4bhif with two students, the course WMC and the pool. */
function seeded(db = freshDatabase()) {
  importPool(db, poolXml("de"), poolXml("en"));
  const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
  const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
  const course = createCourse(db, klass.id, { subject: "WMC", language: "en" });
  const questions = listQuestions(db);
  const byName = Object.fromEntries(questions.map((q) => [q.nameDe, q.id]));
  return { db, year, klass, course, ids: [byName["Bild de"], byName["Methoden de"], byName["Wahr de"]] };
}

/** Starts an attempt the way `attempts.js` will, as far as these checks need one. */
function fakeAttempt(db, testId, username) {
  const at = new Date().toISOString();
  const sitting = db
    .prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, created_at) VALUES (?, ?, ?, 600, ?)")
    .run(testId, at, new Date(Date.now() + 3600000).toISOString(), at);
  db.prepare(
    "INSERT INTO attempt (test_id, sitting_id, username, started_at, deadline, question_count) VALUES (?, ?, ?, ?, ?, 1)"
  ).run(testId, Number(sitting.lastInsertRowid), username, at, at);
}

describe("the migration to online tests", () => {
  test("a database at schema 5 with a gradebook and a pool migrates, and no proposal changes", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 5));
    importPool(db, poolXml("de"), poolXml("en"));
    db.exec(`
      INSERT INTO school_year (id, name, starts_on, summer_starts_on, ends_on, is_current) VALUES (1, '2026/27', '2026-09-07', '2027-02-15', '2027-07-02', 1);
      INSERT INTO class (id, school_year_id, name) VALUES (1, 1, '4bhif');
      INSERT INTO student (username) VALUES ('anna'), ('ben');
      INSERT INTO roster_entry (class_id, username, joined_at) VALUES (1, 'anna', 'x'), (1, 'ben', 'x');
      INSERT INTO course (id, class_id, subject, weights) VALUES
        (1, 1, 'WMC', '{"onlineTests":40,"manualTests":30,"participation":15,"homework":15}');
      INSERT INTO assessment (id, course_id, kind, name, held_on, max_points, created_at) VALUES
        (1, 1, 'test', '1st test', '2026-11-03', 24, 'x'),
        (2, 1, 'plusminus', 'Participation', '2026-11-04', NULL, 'x'),
        (3, 1, 'homework', 'Essay', '2027-04-01', NULL, 'x');
      INSERT INTO manual_entry (assessment_id, username, value, points, created_at, updated_at) VALUES
        (1, 'anna', 0.75, 18, 'x', 'x'), (1, 'ben', 0.25, 6, 'x', 'x'),
        (2, 'anna', 1, NULL, 'x', 'x'), (2, 'ben', 0, NULL, 'x', 'x'),
        (3, 'ben', 0.9, NULL, 'x', 'x');
      INSERT INTO semester_grade (course_id, username, semester, override, comment, comment_visible, updated_at)
        VALUES (1, 'ben', 'ws', 4, 'oral exam', 1, 'x');
    `);
    const year = { startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" };
    const weights = { onlineTests: 40, manualTests: 30, shortTests: 0, presentations: 0, projects: 0, participation: 15, homework: 15 };
    const scale = readScale(db);
    const before = {};
    for (const username of ["anna", "ben"]) {
      const entries = db
        .prepare("SELECT a.kind, e.value, a.held_on FROM manual_entry e JOIN assessment a ON a.id = e.assessment_id WHERE e.username = ?")
        .all(username)
        .map((row) => ({ category: entryCategory[row.kind], value: row.value, date: row.held_on }));
      for (const semester of ["ws", "ss"]) before[`${username}/${semester}`] = proposal(entries, { semester, year, weights, scale });
    }
    const questions = db.prepare("SELECT COUNT(*) AS n FROM question").get().n;

    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 6)), { from: 5, to: 6 });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question").get().n, questions, "the pool is untouched");
    for (const [key, proposed] of Object.entries(before)) {
      const [username, semester] = key.split("/");
      const record = studentRecord(db, 1, username).semesters[semester];
      assert.deepEqual(record.categories, proposed.categories, `${key}: the categories`);
      // The summer's proposal is the year's, built on these same categories.
      if (semester === "ws") assert.deepEqual(record.proposal, { fraction: proposed.fraction, grade: proposed.grade }, `${key}: the proposal`);
    }
    assert.equal(studentRecord(db, 1, "ben").semesters.ws.override, 4, "the override is kept");
  });
});

describe("the migration to bound browsers", () => {
  test("a database at schema 8 with attempts and refusals migrates with every row unchanged and the browser strings NULL", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 8));
    importPool(db, poolXml("de"), poolXml("en"));
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
    const course = createCourse(db, klass.id, { subject: "WMC", language: "en" });
    const test = createTest(db, course.id, { name: "T", questionIds: listQuestions(db).map((q) => q.id) });
    fakeAttempt(db, test.id, "anna");
    db.prepare("UPDATE attempt SET device_hash = 'abc'").run();
    const attempt = db.prepare("SELECT id FROM attempt").get().id;
    db.prepare("INSERT INTO refused_device (attempt_id, at) VALUES (?, 'x'), (?, 'y')").run(attempt, attempt);
    const rows = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map((row) => ({ ...row }));
    const before = { attempt: rows("attempt"), refused_device: rows("refused_device") };

    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 9)), { from: 8, to: 9 });
    assert.deepEqual(rows("attempt"), before.attempt.map((row) => ({ ...row, device_user_agent: null })));
    assert.deepEqual(rows("refused_device"), before.refused_device.map((row) => ({ ...row, user_agent: null })));
  });
});

describe("the migration to hidden-page signals", () => {
  test("a database at schema 14 with an attempt migrates with every row unchanged and the attempt clean", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 14));
    importPool(db, poolXml("de"), poolXml("en"));
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
    const course = createCourse(db, klass.id, { subject: "WMC", language: "en" });
    const test = createTest(db, course.id, { name: "T", questionIds: listQuestions(db).map((q) => q.id) });
    fakeAttempt(db, test.id, "anna");
    db.prepare("UPDATE attempt SET focus_count = 2, focus_ms = 4000").run();
    const rows = () => db.prepare("SELECT * FROM attempt ORDER BY id").all().map((row) => ({ ...row }));
    const before = rows();

    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 15)), { from: 14, to: 15 });
    assert.deepEqual(
      rows(),
      before.map((row) => ({ ...row, tamper_detail: null, tamper_at: null, beat_at: null, beat_hidden: 0, hidden_count: 0, hidden_ms: 0 }))
    );
    const sitting = db.prepare("SELECT sitting_id FROM attempt").get().sitting_id;
    db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, 'anna')").run(sitting);
    const anna = liveSnapshot(db, sitting).participants.find((p) => p.username === "anna");
    assert.deepEqual([anna.tampered, anna.hiddenCount, anna.hiddenMs], [[], 0, 0], "an existing attempt reads as clean");
  });
});

describe("the migration to full screen and the tick rate", () => {
  test("a database at schema 16 with an attempt migrates with every row unchanged, in full screen and without figures", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 16));
    importPool(db, poolXml("de"), poolXml("en"));
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
    const course = createCourse(db, klass.id, { subject: "WMC", language: "en" });
    const test = createTest(db, course.id, { name: "T", questionIds: listQuestions(db).map((q) => q.id) });
    fakeAttempt(db, test.id, "anna");
    db.prepare("UPDATE attempt SET focus_count = 2, focus_ms = 4000, hidden_count = 1, hidden_ms = 5000").run();
    const rows = () => db.prepare("SELECT * FROM attempt ORDER BY id").all().map((row) => ({ ...row }));
    const before = rows();

    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 17)), { from: 16, to: 17 });
    assert.deepEqual(
      rows(),
      before.map((row) => ({
        ...row,
        fullscreen_unavailable: 0,
        out_count: 0,
        out_ms: 0,
        beat_out: 0,
        slow_count: 0,
        slow_ms: 0,
        beat_slow: 0,
        tick_share: null,
        frame_baseline: null,
        rate_samples: null,
      }))
    );
    const sitting = db.prepare("SELECT sitting_id FROM attempt").get().sitting_id;
    db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, 'anna')").run(sitting);
    const anna = liveSnapshot(db, sitting).participants.find((p) => p.username === "anna");
    assert.deepEqual(
      [anna.fullscreenUnavailable, anna.outCount, anna.outMs, anna.slowCount, anna.slowMs, anna.tickShare],
      [false, 0, 0, 0, 0, null],
      "an existing attempt reads as in full screen, with no drop and no tick rate"
    );
  });
});

describe("the migration to tests that follow the pool", () => {
  test("a database at schema 10 with a planned and a written test migrates with every row unchanged", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 10));
    importPool(db, poolXml("de"), poolXml("en"));
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
    const course = createCourse(db, klass.id, { subject: "WMC", language: "en" });
    const ids = listQuestions(db).map((q) => q.id);
    const planned = createTest(db, course.id, { name: "Planned", questionIds: ids.slice(0, 2) });
    createSitting(db, planned.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), durationMinutes: 15 });
    const written = createTest(db, course.id, { name: "Written", questionIds: ids });
    const sitting = createSitting(db, written.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), durationMinutes: 15 });
    db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(inMinutes(-1), sitting.id);
    const { attemptId } = startAttempt(db, "anna", written.id);
    const view = writingView(db, attemptRow(db, attemptId));
    saveAnswer(db, attemptRow(db, attemptId), 1, [view.questions[0].answers[0].token]);
    submitAttempt(db, attemptRow(db, attemptId));
    startAttempt(db, "ben", written.id);

    const tables = ["image", "test_question", "question_usage", "test_image", "test_answer", "attempt_question", "attempt_token", "response"];
    const rows = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all().map((row) => ({ ...row }));
    const before = Object.fromEntries(tables.map((table) => [table, rows(table)]));
    assert.ok(before.image.length > 0 && before.response.length > 0, "the fixture has images and answers to compare");

    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 11)), { from: 10, to: 11 });
    for (const table of tables) assert.deepEqual(rows(table), before[table], `${table} is unchanged`);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const nullable = (table) => db.prepare(`PRAGMA table_info(${table})`).all().find((column) => column.name === "question_id").notnull === 0;
    assert.ok(nullable("image") && nullable("test_question"), "a copy and an image may outlive their question");
  });
});

describe("assembling a test", () => {
  test("snapshots both languages, answers, flags and images, and records the usage", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: " HTTP caching ", questionIds: [ids[1], ids[0]] });
    assert.equal(test.name, "HTTP caching");
    assert.equal(test.course.language, "en");
    assert.deepEqual(
      test.questions.map((q) => [q.questionId, q.type, q.nameDe, q.nameEn]),
      [
        [ids[1], "multichoiceset", "Methoden de", "Methoden en"],
        [ids[0], "multichoice", "Bild de", "Bild en"],
      ],
      "in the order chosen"
    );
    assert.deepEqual(test.questions[0].answers.map((a) => [a.textEn, a.correct]), [["<p>GET</p>", true], ["<p>PUT</p>", true], ["<p>POST</p>", false]]);
    const image = db.prepare("SELECT id FROM image WHERE question_id = ?").get(ids[0]).id;
    assert.deepEqual(db.prepare("SELECT image_id FROM test_image WHERE test_id = ?").all(test.id).map((r) => r.image_id), [image]);
    assert.ok(test.questions[1].textEn.includes(`/exam/api/images/${image}`), "the snapshot keeps the image route");

    const used = getQuestion(db, ids[0]);
    assert.deepEqual(used.usage.map((u) => [u.testId, u.subject, u.className, u.usedOn]), [[test.id, "WMC", "4bhif", viennaDate(new Date().toISOString())]]);
    assert.equal(getQuestion(db, ids[2]).uses, 0);
  });

  test("refuses no question, an unknown one, a retired one and one twice", () => {
    const { db, course, ids } = seeded();
    const tried = (questionIds) => () => createTest(db, course.id, { name: "T", questionIds });
    assert.throws(tried([]), InvalidInputError);
    assert.throws(tried(undefined), InvalidInputError);
    assert.throws(tried([999999]), InvalidInputError);
    assert.throws(tried([ids[0], ids[0]]), InvalidInputError);
    db.prepare("UPDATE question SET retired = 1 WHERE id = ?").run(ids[2]);
    assert.throws(tried([ids[2]]), /retired/);
    assert.throws(() => createTest(db, course.id, { name: "  ", questionIds: [ids[0]] }), InvalidInputError);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM test").get().n, 0, "nothing was written");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question_usage").get().n, 0);
  });

  test("an edited pool question leaves the snapshot unchanged", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[1]] });
    db.prepare("UPDATE question SET text_de = '<p>changed</p>', text_en = '<p>changed</p>' WHERE id = ?").run(ids[1]);
    db.prepare("UPDATE answer SET correct = 1 - correct WHERE question_id = ?").run(ids[1]);
    db.prepare("UPDATE question SET retired = 1 WHERE id = ?").run(ids[1]);
    assert.deepEqual(getTest(db, test.id).questions, test.questions);
  });

  test("an image a test shows cannot be deleted from the pool", () => {
    const { db, course, ids } = seeded();
    createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    assert.throws(() => db.prepare("DELETE FROM image WHERE question_id = ?").run(ids[0]), /FOREIGN KEY/);
  });
});

describe("changing a test", () => {
  test("renames it, and swaps a question with a fresh snapshot while unwritten", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0], ids[1]] });
    const changed = updateTest(db, test.id, { name: "Caching", questionIds: [ids[0], ids[2]] });
    assert.equal(changed.name, "Caching");
    assert.deepEqual(changed.questions.map((q) => q.questionId), [ids[0], ids[2]]);
    assert.equal(getQuestion(db, ids[1]).uses, 0, "the swapped-out question no longer shows the usage");
    assert.equal(getQuestion(db, ids[2]).uses, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM test_answer").get().n, 4, "the old snapshot is gone");
  });

  test("once written, the questions are fixed and the test cannot be deleted, but it can be renamed", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    fakeAttempt(db, test.id, "anna");
    assert.throws(() => updateTest(db, test.id, { questionIds: [ids[1]] }), ConflictError);
    assert.throws(() => deleteTest(db, test.id), ConflictError);
    assert.equal(updateTest(db, test.id, { name: "Renamed" }).name, "Renamed");
    assert.deepEqual(getTest(db, test.id).questions.map((q) => q.questionId), [ids[0]]);
    assert.equal(getQuestion(db, ids[0]).uses, 1);
  });

  test("deleting an unwritten test removes its usage and its sittings", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    db.prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, created_at) VALUES (?, '2030-01-01T08:00:00Z', '2030-01-01T09:00:00Z', 600, 'x')").run(test.id);
    deleteTest(db, test.id);
    for (const table of ["test", "test_question", "test_answer", "test_image", "sitting", "question_usage"]) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, `${table} is empty`);
    }
  });
});

describe("the lists of tests", () => {
  test("a course's tests, a class's, and a year's grouped by class and course", () => {
    const { db, year, klass, course, ids } = seeded();
    const other = createCourse(db, createClass(db, year.id, { name: "4ahif" }).id, { subject: "NVS" });
    createCourse(db, klass.id, { subject: "DBI" });
    createTest(db, course.id, { name: "HTTP", questionIds: [ids[0], ids[1]] });
    createTest(db, other.id, { name: "Other", questionIds: [ids[2]] });

    const own = listTests(db, { courseId: course.id });
    assert.equal(own.scope, "course");
    assert.deepEqual(own.groups.map((g) => [g.subject, g.tests.map((t) => [t.name, t.questions, t.started, t.submitted])]), [["WMC", [["HTTP", 2, 0, 0]]]]);

    const all = listTests(db, { yearId: year.id });
    assert.deepEqual(all.groups.map((g) => `${g.className} ${g.subject} ${g.tests.length}`), ["4ahif NVS 1", "4bhif DBI 0", "4bhif WMC 1"]);
    const ofClass = listTests(db, { classId: klass.id });
    assert.equal(ofClass.scope, "class");
    assert.deepEqual(ofClass.groups.map((g) => `${g.className} ${g.subject} ${g.tests.length}`), ["4bhif DBI 0", "4bhif WMC 1"], "a class chosen without a course lists that class's courses only");
    assert.deepEqual([ofClass.year.name, ofClass.class.name], ["2026/27", "4bhif"]);
    assert.deepEqual(listTests(db).year.name, "2026/27", "the current year without a choice");
  });
});

// ------------------------------------------------------------ sittings

/** An ISO timestamp `minutes` from now. */
const inMinutes = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();
/** The ISO instant `minutes` after `iso`. */
const shift = (iso, minutes) => new Date(Date.parse(iso) + minutes * 60000).toISOString();

describe("sittings", () => {
  test("the first is written by the whole roster, a make-up by everybody who has not written, with the first one's duration", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    const first = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    assert.deepEqual([first.makeup, first.participants, first.durationS], [false, ["anna", "ben"], 900]);
    // Planned before the first sitting: nobody has written yet.
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(200), closesAt: inMinutes(260), durationMinutes: 40 });
    assert.deepEqual([makeup.makeup, makeup.participants, makeup.retakes, makeup.durationS], [true, ["anna", "ben"], [], 900], "a make-up keeps the duration");
    assert.throws(
      () => createSitting(db, test.id, { opensAt: inMinutes(300), closesAt: inMinutes(360), participants: ["ben"] }),
      (error) => error instanceof InvalidInputError && error.key === "exam.errors.tests.makeupNoChoice",
      "choosing participants of a make-up is refused"
    );
    assert.throws(() => updateSitting(db, makeup.id, { participants: ["ben"] }), /exam.errors.tests.makeupNoChoice|chosen/, "also when changing it");
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(300), closesAt: inMinutes(360), retakes: ["carla"] }), /not on the class's roster/);
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(300), closesAt: inMinutes(360), retakes: ["ben"] }), (error) => error.key === "exam.errors.tests.retakeNotWritten", "a retake has to have written");
    assert.throws(() => updateSitting(db, first.id, { retakes: [] }), (error) => error.key === "exam.errors.tests.retakesOnlyMakeup");
    assert.equal(getQuestion(db, ids[0]).usage[0].usedOn, viennaDate(first.opensAt), "the usage is dated by the first sitting");
    assert.deepEqual(getTest(db, test.id).written, [], "nobody has written yet");
  });

  test("a make-up ahead follows who has written, and is fixed once its start window opens", () => {
    const { db, klass, test, sitting } = running();
    const participants = (id) => testSittings(db, test.id).find((s) => s.id === id).participants;
    const anna = startAttempt(db, "anna", test.id);
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(120), closesAt: inMinutes(170) });
    assert.deepEqual(makeup.participants, ["ben"], "who has not started");
    assert.deepEqual(getTest(db, test.id).written, ["anna"], "the form names who has written");
    startAttempt(db, "ben", test.id);
    assert.deepEqual(participants(makeup.id), [], "planned before the first sitting was over: who starts there leaves the make-up");
    addToRoster(db, klass.id, { username: "carla", givenName: "Carla", familyName: "C" });
    assert.deepEqual(participants(makeup.id), ["carla"], "a joiner is in it");
    deleteAttempt(db, anna.attemptId);
    assert.deepEqual(participants(makeup.id), ["anna", "carla"], "who lost their attempt is in it again");
    removeFromRoster(db, klass.id, "carla");
    assert.deepEqual(participants(makeup.id), ["anna"], "who leaves is not");
    // Missed the first make-up too: a second one takes them in.
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-1), inMinutes(1), makeup.id);
    addToRoster(db, klass.id, { username: "dora", givenName: "Dora", familyName: "D" });
    assert.deepEqual(participants(makeup.id), ["anna"], "fixed once its start window opened");
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-10), inMinutes(-5), makeup.id);
    const second = createSitting(db, test.id, { opensAt: inMinutes(200), closesAt: inMinutes(260) });
    assert.deepEqual(second.participants, ["anna", "dora"], "a second make-up after a missed first one");
    assert.ok(sitting.id < makeup.id);
  });

  test("the migration to retakes keeps every participant as no retake, and a closed year still refuses a write", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 21));
    const { year, test } = (() => {
      const seed = seeded(db);
      const created = createTest(db, seed.course.id, { name: "T", questionIds: [seed.ids[0]] });
      return { ...seed, test: created };
    })();
    db.exec(`INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, makeup, created_at) VALUES
        (${test.id}, '2026-10-01T08:00:00.000Z', '2026-10-01T09:00:00.000Z', 600, 0, 'x'),
        (${test.id}, '2026-10-08T08:00:00.000Z', '2026-10-08T09:00:00.000Z', 600, 1, 'x');
      INSERT INTO sitting_participant (sitting_id, username) VALUES (1, 'anna'), (1, 'ben'), (2, 'ben');`);
    const rows = () => db.prepare("SELECT * FROM sitting_participant ORDER BY sitting_id, username").all().map((row) => ({ ...row }));
    const before = rows();
    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 22)), { from: 21, to: 22 });
    assert.deepEqual(rows(), before.map((row) => ({ ...row, retake: 0 })));
    assert.throws(() => db.prepare("UPDATE sitting_participant SET retake = 2").run(), /CHECK/);
    db.prepare("UPDATE school_year SET closed_at = ? WHERE id = ?").run(new Date().toISOString(), year.id);
    assert.throws(() => db.prepare("UPDATE sitting_participant SET retake = 1 WHERE sitting_id = 2").run(), /school year closed/);
  });

  test("at start-up a make-up ahead loses a chosen student who has written, and one that has opened keeps its rows", () => {
    const dbPath = temporaryPath();
    const opened = openDatabase(dbPath).db;
    const { course, ids } = seeded(opened);
    const test = createTest(opened, course.id, { name: "T", questionIds: [ids[0]] });
    const first = createSitting(opened, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    opened.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(inMinutes(-1), first.id);
    startAttempt(opened, "anna", test.id);
    // Two make-ups as the old code stored them: Anna chosen in both, Ben in none.
    const insert = opened.prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, makeup, created_at) VALUES (?, ?, ?, 900, 1, 'x')");
    const ahead = Number(insert.run(test.id, inMinutes(120), inMinutes(170)).lastInsertRowid);
    const begun = Number(insert.run(test.id, inMinutes(-5), inMinutes(30)).lastInsertRowid);
    for (const id of [ahead, begun]) opened.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, 'anna')").run(id);
    opened.close();
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const participants = (id) => testSittings(db, test.id).find((s) => s.id === id).participants;
    assert.deepEqual(participants(ahead), ["ben"], "by the rule from the start");
    assert.deepEqual(participants(begun), ["anna"], "an opened make-up keeps its participants");
  });

  test("a retake is marked, kept while they have written, and taken back before the make-up opens", () => {
    const { db, test } = running();
    const anna = startAttempt(db, "anna", test.id);
    submitAttempt(db, attemptRow(db, anna.attemptId));
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(120), closesAt: inMinutes(170), retakes: ["ANNA"] });
    assert.deepEqual([makeup.participants, makeup.retakes], [["anna", "ben"], ["anna"]]);
    const back = updateSitting(db, makeup.id, { retakes: [] });
    assert.deepEqual([back.participants, back.retakes], [["ben"], []], "taken back");
    assert.equal(attemptRow(db, anna.attemptId).submitted_at !== null, true, "the first attempt is unchanged");
    const again = updateSitting(db, makeup.id, { retakes: ["anna"] });
    assert.deepEqual(again.retakes, ["anna"]);
    deleteAttempt(db, anna.attemptId);
    const plain = testSittings(db, test.id).find((s) => s.id === makeup.id);
    assert.deepEqual([plain.participants, plain.retakes], [["anna", "ben"], []], "a retake who no longer has written is a plain participant");
  });

  test("the duration may be longer than the start window, which opens before it closes, closes in the future and lasts up to 600 minutes", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    const short = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(70), durationMinutes: 20 });
    assert.deepEqual([Date.parse(short.closesAt) - Date.parse(short.opensAt), short.durationS], [10 * 60000, 1200], "a 10-minute start window, 20-minute attempts");
    deleteSitting(db, short.id);
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(60), durationMinutes: 20 }), /open before it closes/);
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(70), closesAt: inMinutes(60), durationMinutes: 5 }), InvalidInputError);
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(-60), closesAt: inMinutes(-10), durationMinutes: 10 }), /future/);
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(661), durationMinutes: 10 }), /600 minutes/);
    assert.equal(createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(660), durationMinutes: 10 }).durationS, 600, "600 minutes are fine");
  });

  test("a sitting changes and goes only until it opens", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    const later = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), durationMinutes: 15 });
    const changed = updateSitting(db, later.id, { closesAt: inMinutes(180), participants: ["anna"] });
    assert.deepEqual([changed.participants, changed.closesAt > later.closesAt], [["anna"], true]);
    db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(inMinutes(-1), later.id);
    assert.throws(() => updateSitting(db, later.id, { durationMinutes: 20 }), ConflictError);
    assert.throws(() => deleteSitting(db, later.id), ConflictError);
  });
});

// ------------------------------------------------------------ attempts

/**
 * A test of all three pool questions with a sitting whose start window is open
 * now for 50 minutes, attempts lasting 15.
 */
function running({ duration = 15, window = 50, participants = null } = {}) {
  const seed = seeded();
  const test = createTest(seed.db, seed.course.id, { name: "T", questionIds: seed.ids });
  const sitting = createSitting(seed.db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(60 + window), durationMinutes: duration, participants });
  // Opened a minute ago, as far as the attempts are concerned.
  seed.db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-1), inMinutes(window - 1), sitting.id);
  return { ...seed, test, sitting: { ...sitting, closesAt: inMinutes(window - 1) } };
}

const attemptRow = (db, id) => db.prepare("SELECT * FROM attempt WHERE id = ?").get(id);

/** The correct tokens of every question in a writing payload, read from the database as only the server can. */
function correctTokens(db, attemptId) {
  return db
    .prepare(
      `SELECT aq.position + 1 AS n, t.token FROM attempt_question aq
       JOIN test_answer a ON a.test_question_id = aq.test_question_id AND a.correct = 1
       JOIN attempt_token t ON t.attempt_id = aq.attempt_id AND t.test_answer_id = a.id
       WHERE aq.attempt_id = ? ORDER BY aq.position, t.position`
    )
    .all(attemptId)
    .reduce((byQuestion, { n, token }) => ({ ...byQuestion, [n]: [...(byQuestion[n] ?? []), token] }), {});
}

describe("attempts", () => {
  test("the deadline is start plus duration, never cut by the start window", () => {
    const { db, test, sitting } = running({ duration: 20, window: 10 });
    const now = new Date().toISOString();
    const anna = attemptRow(db, startAttempt(db, "anna", test.id, now).attemptId);
    assert.equal(Date.parse(anna.deadline) - Date.parse(now), 20 * 60000);
    // Started a minute before the start window closes, as at 10:14 with 10:15.
    const late = shift(sitting.closesAt, -1);
    const ben = attemptRow(db, startAttempt(db, "ben", test.id, late).attemptId);
    assert.equal(ben.deadline, shift(late, 20), "the full 20 minutes");
  });

  test("an attempt is resumed after the start window, and a first start after it is refused", () => {
    const { db, test, sitting } = running({ duration: 20, window: 10, participants: ["anna", "ben"] });
    const late = shift(sitting.closesAt, -1);
    const anna = startAttempt(db, "anna", test.id, late).attemptId;
    const after = shift(sitting.closesAt, 5);
    assert.deepEqual(startAttempt(db, "anna", test.id, after), { attemptId: anna, created: false }, "resumed at 10:20");
    assert.throws(() => startAttempt(db, "ben", test.id, shift(sitting.closesAt, 1)), NotFoundError, "a first start at 10:16");
    const [listed] = openTestsOf(db, "anna", { at: after });
    assert.deepEqual([listed.testId, listed.closesAt, listed.attempt.attemptId], [test.id, attemptRow(db, anna).deadline, anna], "listed until the deadline");
    assert.equal(listed.attempt.remainingMs, 14 * 60000);
    assert.deepEqual(openTestsOf(db, "ben", { at: after }), [], "not offered to one who has not started");
    assert.equal(openTestsOf(db, "ben", { at: shift(sitting.closesAt, -2) }).length, 1, "offered while the start window is open");
    assert.deepEqual(openTestsOf(db, "anna", { at: shift(late, 20) }), [], "gone at the deadline");
  });

  test("one attempt per student and test, across all sittings, resumed and never restarted", () => {
    const { db, test } = running();
    const first = startAttempt(db, "anna", test.id);
    assert.equal(first.created, true);
    assert.ok(first.secret);
    assert.deepEqual(startAttempt(db, "anna", test.id), { attemptId: first.attemptId, created: false }, "a reload resumes");
    submitAttempt(db, attemptRow(db, first.attemptId));
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60) });
    assert.deepEqual(makeup.participants, ["ben"], "who has written is no participant of a make-up");
    // Even a row written by hand, as an old make-up's chosen student, starts nothing without the retake mark.
    db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, 'anna')").run(makeup.id);
    db.prepare("UPDATE sitting SET opens_at = ? WHERE makeup = 1").run(inMinutes(-1));
    assert.throws(() => startAttempt(db, "anna", test.id), /submitted/, "a make-up she is not a retake of starts nothing");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attempt").get().n, 1);
    assert.deepEqual(openTestsOf(db, "anna"), [], "and the test is not shown to her any more");
  });

  test("a retake starts a new attempt in the make-up, and the first one goes in the same step", () => {
    const { db, test } = running();
    const first = startAttempt(db, "anna", test.id);
    submitAttempt(db, attemptRow(db, first.attemptId));
    setTeacherNote(db, test.id, "anna", "seen");
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(120), closesAt: inMinutes(170), retakes: ["anna"] });
    assert.deepEqual(makeup.retakes, ["anna"]);
    assert.throws(() => startAttempt(db, "anna", test.id), /submitted/, "not before the make-up opens");
    db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(inMinutes(-1), makeup.id);
    assert.equal(openTestsOf(db, "anna").length, 1, "offered to the retake");
    const retake = startAttempt(db, "anna", test.id);
    assert.equal(retake.created, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE sitting_id = ?").get(testSittings(db, test.id)[0].id).n, 0, "the first attempt is gone");
    const now = attemptRow(db, retake.attemptId);
    assert.deepEqual([now.sitting_id, now.submitted_at], [makeup.id, null], "the new one runs in the make-up, without a result yet");
    assert.deepEqual(startAttempt(db, "anna", test.id), { attemptId: retake.attemptId, created: false }, "a reload resumes it and deletes nothing");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE username = 'anna'").get().n, 1);
    assert.equal(teacherNoteOf(db, test.id, "anna"), "seen", "the teachers' note stays");
  });

  test("a retake who does not come keeps the first attempt, and one whose first attempt still runs resumes it", () => {
    const { db, test } = running();
    const anna = startAttempt(db, "anna", test.id);
    submitAttempt(db, attemptRow(db, anna.attemptId));
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(120), closesAt: inMinutes(170), retakes: ["anna"] });
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-10), inMinutes(-5), makeup.id);
    assert.ok(attemptRow(db, anna.attemptId).submitted_at, "the window closed without her: the first result remains");
    const ben = startAttempt(db, "ben", test.id);
    // A retake mark for a running attempt cannot be set through the API; written by hand it starts nothing.
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-1), inMinutes(60), makeup.id);
    db.prepare("INSERT INTO sitting_participant (sitting_id, username, retake) VALUES (?, 'ben', 1) ON CONFLICT DO UPDATE SET retake = 1").run(makeup.id);
    assert.deepEqual(startAttempt(db, "ben", test.id), { attemptId: ben.attemptId, created: false }, "the running attempt is resumed, unchanged");
  });

  test("a make-up is written only by its participants", () => {
    const { db, test } = running({ participants: ["anna"] });
    assert.throws(() => startAttempt(db, "ben", test.id), NotFoundError);
    assert.deepEqual(openTestsOf(db, "ben"), []);
    assert.deepEqual(openTestsOf(db, "anna").map((t) => [t.name, t.subject, t.className, t.attempt]), [["T", "WMC", "4bhif", null]]);
  });

  test("the writing payload holds texts and tokens in the course's language, and nothing that tells what is correct", () => {
    const { db, test } = running();
    const { attemptId } = startAttempt(db, "anna", test.id);
    const view = writingView(db, attemptRow(db, attemptId));
    assert.deepEqual(Object.keys(view).sort(), ["attempt", "language", "name", "questions", "remainingMs"]);
    assert.equal(view.language, "en");
    for (const question of view.questions) {
      assert.deepEqual(Object.keys(question).sort(), ["answers", "chosen", "n", "text", "type"]);
      for (const answer of question.answers) assert.deepEqual(Object.keys(answer).sort(), ["text", "token"]);
    }
    assert.ok(view.questions.some((q) => q.text.includes("(2 correct answers)")), "the hint how many are correct stays");
    const serialized = JSON.stringify(view);
    assert.doesNotMatch(serialized, /correct"|"position"|"id"|questionId|"de picture/);
    const other = writingView(db, attemptRow(db, startAttempt(db, "ben", test.id).attemptId));
    const tokens = (v) => v.questions.flatMap((q) => q.answers.map((a) => a.token));
    assert.equal(tokens(view).filter((token) => tokens(other).includes(token)).length, 0, "every attempt has its own tokens");
  });

  test("answers are saved per question, one for a single-choice question, and refused after the deadline", () => {
    const { db, test } = running();
    const { attemptId } = startAttempt(db, "anna", test.id);
    const view = writingView(db, attemptRow(db, attemptId));
    const multi = view.questions.find((q) => q.type === "multichoiceset");
    const single = view.questions.find((q) => q.type === "multichoice");
    const saved = saveAnswer(db, attemptRow(db, attemptId), multi.n, [multi.answers[0].token, multi.answers[1].token]);
    assert.ok(saved.remainingMs > 0);
    assert.throws(() => saveAnswer(db, attemptRow(db, attemptId), single.n, single.answers.map((a) => a.token)), /one answer/);
    assert.throws(() => saveAnswer(db, attemptRow(db, attemptId), single.n, [multi.answers[0].token]), /not an answer of this question/);
    assert.deepEqual(writingView(db, attemptRow(db, attemptId)).questions.find((q) => q.n === multi.n).chosen.sort(), [multi.answers[0].token, multi.answers[1].token].sort(), "a reload shows what was saved");
    const afterDeadline = new Date(Date.parse(attemptRow(db, attemptId).deadline) + 1000).toISOString();
    assert.throws(() => saveAnswer(db, attemptRow(db, attemptId), multi.n, [], afterDeadline), ConflictError);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM response").get().n, 2, "the late write changed nothing");
  });

  test("grading is all or nothing per question: one correct answer missed scores 0", () => {
    const { db, test } = running();
    const { attemptId } = startAttempt(db, "anna", test.id);
    const view = writingView(db, attemptRow(db, attemptId));
    const correct = correctTokens(db, attemptId);
    for (const question of view.questions) {
      const tokens = question.type === "multichoiceset" ? correct[question.n].slice(0, 1) : correct[question.n];
      saveAnswer(db, attemptRow(db, attemptId), question.n, tokens);
    }
    const result = submitAttempt(db, attemptRow(db, attemptId));
    assert.deepEqual(result, { submitted: true, score: 2, questionCount: 3, grade: 3 });
    assert.throws(() => writingView(db, attemptRow(db, attemptId)), ConflictError, "the questions are gone after submission");
  });

  test("the board solution's share per question counts submitted attempts only, by the same rule as the grade", () => {
    const { db, test } = running();
    const questionIds = db.prepare("SELECT id, type FROM test_question WHERE test_id = ?").all(test.id);
    assert.deepEqual(correctShares(db, test.id).submitted, 0, "nobody has written it yet");
    assert.ok(questionIds.every((q) => correctShares(db, test.id).correct.get(q.id) === 0));

    // Anna gets everything right; Ben misses one of the two correct answers
    // of the multiple-answer question and leaves the rest open.
    const anna = startAttempt(db, "anna", test.id).attemptId;
    const correct = correctTokens(db, anna);
    for (const question of writingView(db, attemptRow(db, anna)).questions) saveAnswer(db, attemptRow(db, anna), question.n, correct[question.n]);
    submitAttempt(db, attemptRow(db, anna));
    const ben = startAttempt(db, "ben", test.id).attemptId;
    const multi = writingView(db, attemptRow(db, ben)).questions.find((q) => q.type === "multichoiceset");
    saveAnswer(db, attemptRow(db, ben), multi.n, correctTokens(db, ben)[multi.n].slice(0, 1));
    assert.equal(correctShares(db, test.id).submitted, 1, "an open attempt does not count yet");
    const whileOpen = correctShares(db, test.id);
    assert.ok(questionIds.every((q) => whileOpen.wrong.get(q.id) === 0 && whileOpen.blank.get(q.id) === 0), "nor in the wrong or blank counts");
    assert.equal(
      [...whileOpen.chosen.values()].reduce((sum, n) => sum + n, 0),
      db.prepare("SELECT COUNT(*) AS n FROM response WHERE attempt_id = ?").get(anna).n,
      "nor in the options' counts"
    );
    submitAttempt(db, attemptRow(db, ben));

    const shares = correctShares(db, test.id);
    assert.equal(shares.submitted, 2);
    assert.deepEqual(
      questionIds.map((q) => shares.correct.get(q.id)),
      questionIds.map(() => 1),
      "each question was answered correctly by Anna only"
    );
    const isMulti = (q) => q.type === "multichoiceset";
    assert.deepEqual(
      questionIds.map((q) => shares.wrong.get(q.id)),
      questionIds.map((q) => (isMulti(q) ? 1 : 0)),
      "Ben's partly correct choice counts as wrong"
    );
    assert.deepEqual(
      questionIds.map((q) => shares.blank.get(q.id)),
      questionIds.map((q) => (isMulti(q) ? 0 : 1)),
      "Ben left the other questions blank"
    );
    for (const q of questionIds) assert.equal(shares.correct.get(q.id) + shares.wrong.get(q.id) + shares.blank.get(q.id), shares.submitted);

    // Each answer is counted once per submitted attempt that chose it.
    const answers = db
      .prepare("SELECT a.id, a.correct FROM test_answer a JOIN test_question q ON q.id = a.test_question_id WHERE q.test_id = ?")
      .all(test.id);
    const bensPick = db.prepare("SELECT test_answer_id AS id FROM response WHERE attempt_id = ?").all(ben).map((row) => row.id);
    assert.equal(bensPick.length, 1);
    assert.deepEqual(
      answers.map((a) => shares.chosen.get(a.id)),
      answers.map((a) => (a.correct ? 1 : 0) + (a.id === bensPick[0] ? 1 : 0))
    );
  });

  test("past the deadline an attempt is submitted with what was saved, on access or by the sweep", () => {
    const { db, test } = running();
    const anna = startAttempt(db, "anna", test.id).attemptId;
    const ben = startAttempt(db, "ben", test.id).attemptId;
    const view = writingView(db, attemptRow(db, anna));
    const question = view.questions[0];
    saveAnswer(db, attemptRow(db, anna), question.n, correctTokens(db, anna)[question.n]);
    const later = inMinutes(20);
    assert.equal(ownAttempt(db, anna, "anna", later).score, 1, "finalized lazily, with the answer saved before");
    assert.equal(attemptRow(db, anna).submitted_at, attemptRow(db, anna).deadline, "submitted at the deadline, not at the access");
    assert.equal(finalizeDue(db, later), 1, "the sweep submits the other one");
    assert.equal(attemptRow(db, ben).score, 0);
    assert.throws(() => ownAttempt(db, anna, "ben"), NotFoundError, "somebody else's attempt does not exist");
  });

  test("leaving the page is counted and timed, an absence open at the deadline up to it, and the grade does not change", () => {
    const { db, test } = running();
    const { attemptId } = startAttempt(db, "anna", test.id, inMinutes(0));
    const deadline = attemptRow(db, attemptId).deadline;
    const at = (seconds) => new Date(Date.parse(deadline) - 600000 + seconds * 1000).toISOString();
    recordFocus(db, attemptRow(db, attemptId), "away", at(0));
    recordFocus(db, attemptRow(db, attemptId), "away", at(5));
    recordFocus(db, attemptRow(db, attemptId), "back", at(20));
    recordFocus(db, attemptRow(db, attemptId), "away", at(500));
    finalizeDue(db, inMinutes(30));
    const row = attemptRow(db, attemptId);
    assert.deepEqual([row.focus_count, row.focus_ms, row.away_since], [2, 20000 + 100000, null]);
    assert.equal(row.score, 0, "nothing answered, nothing gained or lost by leaving");
  });

  describe("the heartbeat", () => {
    /** Anna's attempt, a clock `at(seconds)` from its start, a beat sender and the `suspicious` events heard. */
    function beating() {
      const { db, test, sitting } = running();
      const started = new Date().toISOString();
      const { attemptId } = startAttempt(db, "anna", test.id, started);
      const at = (seconds) => new Date(Date.parse(started) + seconds * 1000).toISOString();
      const events = [];
      const stop = listen(sitting.id, (event) => events.push(event.type));
      const beat = (seconds, body = {}) =>
        recordBeat(db, attemptRow(db, attemptId), { frames: 300, hidden: false, reportedAway: false, tampered: [], ...body }, at(seconds));
      const figures = () => {
        const row = attemptRow(db, attemptId);
        return [row.hidden_count, row.hidden_ms, row.beat_hidden];
      };
      return { db, sitting, attemptId, at, beat, figures, suspicious: () => events.filter((type) => type === "suspicious").length, stop };
    }

    test("the first beat only starts the clock, a visible page counts nothing", () => {
      const { db, attemptId, at, beat, figures, stop } = beating();
      assert.deepEqual(beat(5, { frames: 0, hidden: true }), { recorded: true });
      assert.equal(attemptRow(db, attemptId).beat_at, at(5));
      assert.deepEqual(figures(), [0, 0, 0], "a first beat has no span to judge");
      beat(10);
      assert.deepEqual(figures(), [0, 0, 0]);
      stop();
    });

    test("a span with too few frames, or a beat saying hidden, counts as hidden by timing; a run of them is one stretch", () => {
      const { beat, figures, suspicious, stop } = beating();
      beat(5);
      beat(10, { frames: 24 }); // 5 s at 5 fps would be 25
      assert.deepEqual(figures(), [1, 5000, 1]);
      beat(70, { frames: 0 }); // a throttled timer, late and without frames
      assert.deepEqual(figures(), [1, 65000, 1], "one stretch");
      beat(75);
      beat(80, { frames: 300, hidden: true });
      assert.deepEqual(figures(), [2, 70000, 1], "hidden: true counts whatever the frames");
      assert.equal(suspicious(), 2, "an event per new stretch, none for its continuation");
      stop();
    });

    test("what the focus log counts is not counted again", () => {
      const { db, attemptId, at, beat, figures, stop } = beating();
      beat(5);
      beat(10, { frames: 0, reportedAway: true });
      assert.deepEqual(figures(), [0, 0, 0], "the page's own listeners reported the absence");
      recordFocus(db, attemptRow(db, attemptId), "away", at(12));
      beat(15, { frames: 0 });
      assert.deepEqual(figures(), [0, 0, 0], "the attempt is away by the focus log");
      recordFocus(db, attemptRow(db, attemptId), "back", at(16));
      beat(20, { frames: 0 });
      assert.deepEqual(figures(), [1, 5000, 1], "afterwards it counts again");
      stop();
    });

    test("an over-frequent beat, a beat after the deadline and one of a submitted attempt are ignored", () => {
      const { db, attemptId, beat, figures, stop } = beating();
      beat(5);
      assert.deepEqual(beat(5.5, { frames: 0 }), { recorded: false }, "under a second after the last");
      assert.deepEqual(figures(), [0, 0, 0]);
      const deadline = attemptRow(db, attemptId).deadline;
      const pastDeadline = (Date.parse(deadline) - Date.parse(attemptRow(db, attemptId).started_at)) / 1000 + 1;
      assert.deepEqual(beat(pastDeadline, { frames: 0 }), { recorded: false });
      submitAttempt(db, attemptRow(db, attemptId));
      assert.deepEqual(beat(20, { frames: 0, tampered: ["hidden"] }), { recorded: false });
      assert.deepEqual([...figures(), attemptRow(db, attemptId).tamper_detail], [0, 0, 0, null]);
      stop();
    });

    test("the replaced properties are merged and never shrink; an event only when the set grows", () => {
      const { db, attemptId, at, beat, suspicious, stop } = beating();
      beat(5, { tampered: ["hasFocus"] });
      beat(10, { tampered: [] });
      beat(15, { tampered: ["visibilityState", "hasFocus"] });
      beat(20, { tampered: ["hasFocus"] });
      const row = attemptRow(db, attemptId);
      assert.deepEqual([row.tamper_detail, row.tamper_at], ["visibilityState,hasFocus", at(5)]);
      assert.equal(suspicious(), 2);
      stop();
    });

    test("an ordinary beat emits nothing", () => {
      const { beat, suspicious, stop } = beating();
      for (let seconds = 5; seconds <= 60; seconds += 5) beat(seconds);
      assert.equal(suspicious(), 0);
      stop();
    });

    test("a body of any other shape is refused", () => {
      const { beat, stop } = beating();
      for (const body of [
        { frames: -1 },
        { frames: 1.5 },
        { frames: "300" },
        { hidden: "no" },
        { reportedAway: 1 },
        { tampered: "hasFocus" },
        { tampered: ["onblur"] },
        { tampered: null },
      ]) {
        assert.throws(() => beat(5, body), InvalidInputError, JSON.stringify(body));
      }
      stop();
    });

    test("the live view carries the signal; no student response does", () => {
      const { db, sitting, attemptId, beat, stop } = beating();
      beat(5, { tampered: ["visibilityState"] });
      beat(10, { frames: 0 });
      const anna = liveParticipant(db, sitting.id, "anna");
      assert.deepEqual([anna.tampered, anna.hiddenCount, anna.hiddenMs], [["visibilityState"], 1, 5000]);
      assert.equal(typeof anna.silentMs, "number");
      const seen = [openTestsOf(db, "anna"), writingView(db, attemptRow(db, attemptId)), submitAttempt(db, attemptRow(db, attemptId))];
      assert.doesNotMatch(JSON.stringify(seen), /tamper|hidden_?(count|ms)|hiddenCount|hiddenMs|beat|silent|visibilityState/i);
      assert.equal(liveParticipant(db, sitting.id, "anna").silentMs, null, "no heartbeat warning once submitted");
      stop();
    });

    describe("full screen and the tick rate", () => {
      /** The figures of all four categories: [hidden, out, slow] as [count, ms] each. */
      const categories = (db, attemptId) => {
        const row = attemptRow(db, attemptId);
        return { hidden: [row.hidden_count, row.hidden_ms], out: [row.out_count, row.out_ms], slow: [row.slow_count, row.slow_ms] };
      };
      const none = { hidden: [0, 0], out: [0, 0], slow: [0, 0] };
      // A page at full rate: 60 frames and 4 ticks a second over a 5 s span.
      const full = { frames: 300, ticks: 20 };

      test("each span lands in the first category that matches, never in two", () => {
        const { db, attemptId, beat, stop } = beating();
        beat(5, full);
        beat(10, { frames: 0, ticks: 0, out: true, reportedAway: true });
        assert.deepEqual(categories(db, attemptId), none, "the focus log takes it first");
        beat(15, { frames: 0, ticks: 0, out: true });
        assert.deepEqual(categories(db, attemptId), { ...none, hidden: [1, 5000] }, "hidden by timing before out of full screen");
        beat(20, { frames: 300, ticks: 2, out: true });
        assert.deepEqual(categories(db, attemptId), { ...none, hidden: [1, 5000], out: [1, 5000] }, "out of full screen before tick rate down");
        beat(25, { frames: 300, ticks: 2 });
        assert.deepEqual(categories(db, attemptId), { hidden: [1, 5000], out: [1, 5000], slow: [1, 5000] }, "tick rate down last");
        beat(30, full);
        assert.deepEqual(categories(db, attemptId), { hidden: [1, 5000], out: [1, 5000], slow: [1, 5000] }, "a normal span counts nothing");
        stop();
      });

      test("a tab switch that also ends full screen counts only for the focus log; the time back on the page out of it counts as out", () => {
        const { db, attemptId, at, beat, stop } = beating();
        beat(5, full);
        recordFocus(db, attemptRow(db, attemptId), "away", at(6));
        beat(10, { frames: 0, ticks: 5, out: true, reportedAway: true });
        beat(35, { frames: 0, ticks: 25, out: true, reportedAway: true });
        recordFocus(db, attemptRow(db, attemptId), "back", at(36));
        assert.deepEqual(categories(db, attemptId), none);
        beat(41, { ...full, out: true });
        assert.deepEqual(categories(db, attemptId), { ...none, out: [1, 6000] });
        stop();
      });

      test("the baseline forms from the first 6 normal spans of at least 3 s, ignoring every other span", () => {
        const { db, attemptId, beat, stop } = beating();
        beat(5, full);
        beat(10, { frames: 300, ticks: 20, out: true }); // out
        beat(15, { frames: 0, ticks: 0 }); // hidden
        beat(20, { frames: 300, ticks: 2 }); // tick rate down
        beat(22, { frames: 120, ticks: 8 }); // normal, but too short
        assert.equal(attemptRow(db, attemptId).rate_samples, null, "nothing sampled yet");
        const rates = [58, 60, 61, 59, 62, 60];
        rates.forEach((rate, index) => beat(27 + index * 5, { frames: rate * 5, ticks: 20 }));
        const row = attemptRow(db, attemptId);
        assert.deepEqual([row.frame_baseline, row.rate_samples], [60, null], "the median of the six");
        beat(62, { frames: 30 * 5, ticks: 20 });
        assert.equal(attemptRow(db, attemptId).frame_baseline, 60, "kept once formed");
        stop();
      });

      test("60 Hz and 144 Hz displays both read about 100 %", () => {
        for (const hz of [60, 144]) {
          const { db, sitting, beat, stop } = beating();
          for (let seconds = 5; seconds <= 40; seconds += 5) beat(seconds, { frames: hz * 5, ticks: 20 });
          const anna = liveParticipant(db, sitting.id, "anna");
          assert.ok(anna.tickShare >= 0.95, `${hz} Hz reads ${anna.tickShare}`);
          assert.deepEqual([anna.slowCount, anna.slowMs], [0, 0]);
          stop();
        }
      });

      test("a page drawing at a fifth of its baseline for 40 s is one stretch of tick rate down, and the focus figures stay", () => {
        const { db, sitting, attemptId, beat, suspicious, stop } = beating();
        for (let seconds = 5; seconds <= 35; seconds += 5) beat(seconds, full);
        assert.equal(attemptRow(db, attemptId).frame_baseline, 60);
        for (let seconds = 40; seconds <= 75; seconds += 5) beat(seconds, { frames: 12 * 5, ticks: 20 });
        beat(80, full);
        const anna = liveParticipant(db, sitting.id, "anna");
        assert.deepEqual([anna.slowCount, anna.slowMs, anna.hiddenCount, anna.focusCount, anna.focusMs], [1, 40000, 0, 0, 0]);
        assert.equal(suspicious(), 1, "one event for the stretch");
        assert.equal(anna.tickShare, 1, "back to full rate");
        stop();
      });

      test("before there is a baseline the ticks alone flag a drop", () => {
        const { db, attemptId, beat, stop } = beating();
        beat(5, full);
        beat(10, { frames: 300, ticks: 5 });
        const row = attemptRow(db, attemptId);
        assert.equal(row.frame_baseline, null);
        assert.deepEqual([row.slow_count, row.slow_ms, row.tick_share], [1, 5000, 250]);
        stop();
      });

      test("an old page's beat without ticks or full screen is taken as in full screen, frames only", () => {
        const { db, attemptId, beat, stop } = beating();
        beat(5);
        beat(10);
        const row = attemptRow(db, attemptId);
        assert.deepEqual(categories(db, attemptId), none);
        assert.equal(row.tick_share, null, "no ticks and no baseline: no tick rate yet");
        stop();
      });

      test("a refused full screen is flagged for good, with one event", () => {
        const { db, attemptId, beat, suspicious, stop } = beating();
        beat(5, { ...full, noFullscreen: true });
        assert.equal(attemptRow(db, attemptId).fullscreen_unavailable, 1, "even on the first beat");
        beat(10, full);
        beat(15, { ...full, noFullscreen: true });
        assert.equal(attemptRow(db, attemptId).fullscreen_unavailable, 1);
        assert.equal(suspicious(), 1);
        beat(20, { ...full, out: true });
        assert.deepEqual(categories(db, attemptId), none, "the finding stands instead of the time out of full screen");
        stop();
      });

      test("a start without full screen flags the attempt, also when it resumes; any other value is refused", () => {
        const { db, test, sitting } = running();
        const events = [];
        const stop = listen(sitting.id, (event) => events.push(event.type));
        const anna = startAttempt(db, "anna", test.id, undefined, { fullscreen: false }).attemptId;
        assert.equal(attemptRow(db, anna).fullscreen_unavailable, 1);
        assert.equal(liveParticipant(db, sitting.id, "anna").fullscreenUnavailable, true);
        const ben = startAttempt(db, "ben", test.id).attemptId;
        assert.equal(attemptRow(db, ben).fullscreen_unavailable, 0, "a missing field is an old page's start");
        startAttempt(db, "ben", test.id, undefined, { fullscreen: true });
        assert.equal(attemptRow(db, ben).fullscreen_unavailable, 0);
        startAttempt(db, "ben", test.id, undefined, { fullscreen: false });
        assert.equal(attemptRow(db, ben).fullscreen_unavailable, 1, "resumed without full screen");
        assert.equal(events.filter((type) => type === "suspicious").length, 1, "one event, for the resumed attempt");
        assert.throws(() => startAttempt(db, "anna", test.id, undefined, { fullscreen: "no" }), InvalidInputError);
        stop();
      });

      test("a beat whose ticks or full-screen fields have any other shape is refused", () => {
        const { beat, stop } = beating();
        for (const body of [{ ticks: -1 }, { ticks: 1.5 }, { ticks: "20" }, { ticks: null }, { out: "yes" }, { out: 1 }, { noFullscreen: 1 }, { noFullscreen: null }]) {
          assert.throws(() => beat(5, body), InvalidInputError, JSON.stringify(body));
        }
        stop();
      });

      test("the live view carries full screen and the tick rate; no student response does", () => {
        const { db, sitting, attemptId, beat, stop } = beating();
        beat(5, full);
        beat(10, { ...full, out: true });
        beat(15, { frames: 300, ticks: 4, noFullscreen: true });
        const anna = liveParticipant(db, sitting.id, "anna");
        assert.deepEqual(
          [anna.fullscreenUnavailable, anna.outCount, anna.outMs, anna.slowCount, anna.slowMs, anna.tickShare],
          [true, 1, 5000, 1, 5000, 0.2]
        );
        const seen = [openTestsOf(db, "anna"), writingView(db, attemptRow(db, attemptId)), submitAttempt(db, attemptRow(db, attemptId))];
        assert.doesNotMatch(JSON.stringify(seen), /full_?screen|out_?(count|ms)|outCount|outMs|slow|tick|baseline|rate_samples/i);
        stop();
      });
    });
  });

  test("an attempt is bound to its browser, a stranger is refused and recorded, a release binds the next one", () => {
    const { db, test } = running();
    const { attemptId, secret } = startAttempt(db, "anna", test.id);
    assert.deepEqual(checkDevice(db, attemptRow(db, attemptId), secret), {});
    assert.throws(() => checkDevice(db, attemptRow(db, attemptId), "someone-else"), DeviceRefusedError);
    assert.throws(() => checkDevice(db, attemptRow(db, attemptId), undefined), DeviceRefusedError);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM refused_device").get().n, 2);
    releaseAttempt(db, attemptId);
    const { bound } = checkDevice(db, attemptRow(db, attemptId), "new-laptop");
    assert.ok(bound, "the next browser gets a secret of its own");
    assert.deepEqual(checkDevice(db, attemptRow(db, attemptId), bound), {});
    assert.throws(() => checkDevice(db, attemptRow(db, attemptId), secret), DeviceRefusedError, "the old browser is the stranger now");
  });

  test("the browser string is kept at start, cleared on release, replaced on re-binding, recorded with each refusal and cut at 512", () => {
    const { db, test, sitting } = running();
    const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36";
    const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const { attemptId } = startAttempt(db, "anna", test.id, undefined, { userAgent: firefox });
    assert.equal(attemptRow(db, attemptId).device_user_agent, firefox, "kept at start");
    assert.deepEqual(liveParticipant(db, sitting.id, "anna").boundBrowser, { short: "Firefox 131 · Windows", os: "Windows", full: firefox });

    assert.throws(() => checkDevice(db, attemptRow(db, attemptId), "stranger", undefined, { userAgent: safari }), DeviceRefusedError);
    assert.deepEqual(
      db.prepare("SELECT user_agent FROM refused_device WHERE attempt_id = ?").all(attemptId).map((row) => row.user_agent),
      [safari],
      "recorded with the refusal"
    );
    const refused = liveParticipant(db, sitting.id, "anna");
    assert.deepEqual([refused.refused, refused.refusedBrowser.short], [1, "Safari 18 · iOS"]);

    releaseAttempt(db, attemptId);
    assert.deepEqual([attemptRow(db, attemptId).device_hash, attemptRow(db, attemptId).device_user_agent], [null, null], "cleared with the hash");
    assert.equal(liveParticipant(db, sitting.id, "anna").boundBrowser, null, "an unbound attempt names no browser");

    checkDevice(db, attemptRow(db, attemptId), undefined, undefined, { userAgent: android });
    assert.equal(attemptRow(db, attemptId).device_user_agent, android, "replaced on re-binding");
    assert.equal(liveSnapshot(db, sitting.id).participants.find((p) => p.username === "anna").boundBrowser.short, "Chrome 130 · Android");

    const long = `Mozilla/5.0 ${"x".repeat(2000)}`;
    const ben = startAttempt(db, "ben", test.id, undefined, { userAgent: long }).attemptId;
    assert.equal(attemptRow(db, ben).device_user_agent, long.slice(0, 512), "cut at 512");
    assert.throws(() => checkDevice(db, attemptRow(db, ben), "stranger", undefined, { userAgent: long }), DeviceRefusedError);
    assert.equal(db.prepare("SELECT user_agent FROM refused_device WHERE attempt_id = ?").get(ben).user_agent.length, 512);

    db.prepare("UPDATE attempt SET device_user_agent = NULL WHERE id = ?").run(ben);
    assert.deepEqual(liveParticipant(db, sitting.id, "ben").boundBrowser, { short: null, os: null, full: null }, "bound before strings were kept: unknown");
  });

  test("no student response carries a browser string", () => {
    const { db, test } = running();
    const marker = "Mozilla/5.0 (X11; Linux x86_64) MarkerBrowser/1.0";
    const { attemptId } = startAttempt(db, "anna", test.id, undefined, { userAgent: marker });
    assert.throws(() => checkDevice(db, attemptRow(db, attemptId), "stranger", undefined, { userAgent: marker }), DeviceRefusedError);
    const seen = [
      openTestsOf(db, "anna"),
      writingView(db, attemptRow(db, attemptId)),
      submitAttempt(db, attemptRow(db, attemptId)),
      ownAttempt(db, attemptId, "anna").submitted_at ? "submitted" : "open",
    ];
    assert.doesNotMatch(JSON.stringify(seen), /MarkerBrowser|user_?agent|boundBrowser|refusedBrowser/i);
  });

  test("a student sees a test's image only while their attempt is open", () => {
    const { db, test, ids } = running();
    const image = db.prepare("SELECT id FROM image WHERE question_id = ?").get(ids[0]).id;
    assert.equal(studentMaySeeImage(db, "anna", image), false, "not before the attempt");
    const { attemptId } = startAttempt(db, "anna", test.id);
    assert.equal(studentMaySeeImage(db, "anna", image), true);
    assert.equal(studentMaySeeImage(db, "ben", image), false, "not for a neighbour without an attempt");
    submitAttempt(db, attemptRow(db, attemptId));
    assert.equal(studentMaySeeImage(db, "anna", image), false, "not after submitting");
  });
});

// ------------------------------------------------------- admin corrections

describe("a teacher's note on a participant", () => {
  test("one note per student and test, the same in every sitting of the test, and on no class view", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    const first = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(200), closesAt: inMinutes(260), durationMinutes: 15 });
    assert.deepEqual(setTeacherNote(db, test.id, "BEN", "Looked at the neighbour's screen twice\r\ncheck against Huber"), {
      username: "ben",
      teacherNote: "Looked at the neighbour's screen twice\ncheck against Huber",
    }, "kept with its line break, as \\n");
    const noteIn = (sitting) => liveSnapshot(db, sitting.id).participants.find((p) => p.username === "ben").teacherNote;
    assert.equal(noteIn(first), "Looked at the neighbour's screen twice\ncheck against Huber");
    assert.equal(noteIn(makeup), noteIn(first), "the make-up shows the same note");
    assert.equal(liveParticipant(db, makeup.id, "ben").teacherNote, noteIn(first));
    assert.equal(liveSnapshot(db, first.id).participants.find((p) => p.username === "anna").teacherNote, null);
    assert.ok(
      liveSnapshot(db, first.id, undefined, { screen: true }).participants.every((p) => !("teacherNote" in p)),
      "the view for the class gets no note, not even an empty one"
    );
    setTeacherNote(db, test.id, "ben", "second");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM teacher_note").get().n, 1, "replaced, not added");
  });

  test("white space removes it, more than 4000 characters is refused and keeps it, a non-participant is not found", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    setTeacherNote(db, test.id, "anna", "kept");
    assert.throws(() => setTeacherNote(db, test.id, "anna", "x".repeat(4001)), (error) => error instanceof InvalidInputError && /4000/.test(error.message));
    assert.equal(teacherNoteOf(db, test.id, "anna"), "kept", "the refused text left the note as it was");
    assert.equal(setTeacherNote(db, test.id, "anna", "x".repeat(4000)).teacherNote.length, 4000, "4000 is allowed");
    assert.deepEqual(setTeacherNote(db, test.id, "anna", " \n\t "), { username: "anna", teacherNote: null });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM teacher_note").get().n, 0);
    assert.throws(() => setTeacherNote(db, test.id, "carla", "x"), NotFoundError);
    assert.throws(() => setTeacherNote(db, test.id + 1, "anna", "x"), NotFoundError);
  });

  test("deleting a test removes its teacher notes", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    setTeacherNote(db, test.id, "anna", "gone with the test");
    deleteTest(db, test.id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM teacher_note").get().n, 0);
  });
});

describe("ending and extending an open sitting", () => {
  test("ending submits every running attempt at once, with its saved answers", () => {
    const { db, test, sitting } = running({ duration: 15, window: 50 });
    const anna = startAttempt(db, "anna", test.id).attemptId;
    const ben = startAttempt(db, "ben", test.id).attemptId;
    const tokens = correctTokens(db, anna);
    saveAnswer(db, attemptRow(db, anna), 1, tokens[1]);
    submitAttempt(db, attemptRow(db, ben));
    const at = new Date().toISOString();
    const ended = endSitting(db, sitting.id, at);
    assert.equal(ended.closesAt, at);
    assert.equal(ended.state, "over");
    const row = attemptRow(db, anna);
    assert.ok(row.submitted_at, "the running attempt is submitted");
    assert.equal(row.deadline, at);
    assert.equal(row.score, 1, "with the answer it had saved");
  });

  test("ending after the start window keeps the start window and submits the running attempt", () => {
    const { db, test, sitting } = running({ duration: 20, window: 10 });
    const anna = startAttempt(db, "anna", test.id, shift(sitting.closesAt, -1)).attemptId;
    const at = shift(sitting.closesAt, 10);
    const ended = endSitting(db, sitting.id, at);
    assert.deepEqual([ended.closesAt, ended.state, ended.endsAt], [sitting.closesAt, "over", null], "the start window still reads as before");
    assert.deepEqual([attemptRow(db, anna).submitted_at, attemptRow(db, anna).deadline], [at, at]);
  });

  test("the start window is extended while it is open, and no running deadline moves", () => {
    const { db, test, sitting } = running({ duration: 20, window: 10, participants: ["anna", "ben"] });
    const anna = startAttempt(db, "anna", test.id).attemptId;
    const before = attemptRow(db, anna).deadline;
    const extended = extendStartWindow(db, sitting.id, { minutes: 5 });
    assert.equal(extended.closesAt, shift(sitting.closesAt, 5));
    assert.equal(attemptRow(db, anna).deadline, before, "the student who started keeps their deadline");
    assert.equal(startAttempt(db, "ben", test.id, shift(sitting.closesAt, 4)).created, true, "students can start until the new end");
    assert.equal(db.prepare("SELECT duration_s FROM sitting WHERE id = ?").get(sitting.id).duration_s, 1200, "the duration is unchanged");
    for (const minutes of [4, 121, 7.5, "10"]) assert.throws(() => extendStartWindow(db, sitting.id, { minutes }), InvalidInputError, String(minutes));
    assert.throws(
      () => extendStartWindow(db, sitting.id, { minutes: 5 }, shift(extended.closesAt, 1)),
      (error) => error instanceof ConflictError && error.key === "exam.errors.tests.extendStartClosed",
      "refused once it closed, also while attempts run"
    );
  });

  test("the writing time moves every running deadline, and neither a submitted one nor a later starter's", () => {
    const { db, klass, test, sitting } = running({ duration: 20, window: 10 });
    addToRoster(db, klass.id, { username: "carla" });
    db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, 'carla')").run(sitting.id);
    assert.throws(
      () => extendWritingTime(db, sitting.id, { minutes: 5 }),
      (error) => error instanceof ConflictError && error.key === "exam.errors.tests.extendWritingNone",
      "nobody is writing"
    );
    const anna = startAttempt(db, "anna", test.id).attemptId;
    const ben = startAttempt(db, "ben", test.id).attemptId;
    submitAttempt(db, attemptRow(db, ben));
    const [annaBefore, benBefore] = [attemptRow(db, anna).deadline, attemptRow(db, ben).deadline];
    extendWritingTime(db, sitting.id, { minutes: 5 });
    assert.equal(attemptRow(db, anna).deadline, shift(annaBefore, 5));
    assert.equal(attemptRow(db, ben).deadline, benBefore, "the submitted attempt is unchanged");
    const start = shift(sitting.closesAt, -1);
    const carla = startAttempt(db, "carla", test.id, start).attemptId;
    assert.equal(attemptRow(db, carla).deadline, shift(start, 20), "a later starter gets the duration only");
    assert.equal(db.prepare("SELECT closes_at FROM sitting WHERE id = ?").get(sitting.id).closes_at, sitting.closesAt, "the start window stays");
    for (const minutes of [0, 121, 1.5, "5"]) assert.throws(() => extendWritingTime(db, sitting.id, { minutes }), InvalidInputError, String(minutes));
    assert.equal(extendWritingTime(db, sitting.id, { minutes: 1 }).state, "open", "a single minute is fine");
  });

  test("an online sitting is not extended the offline way", () => {
    const { db, sitting } = running();
    assert.throws(() => extendSitting(db, sitting.id, { minutes: 10 }), (error) => error instanceof ConflictError && error.key === "exam.errors.tests.extendOnline");
  });

  test("all are refused before the sitting opens and once it is over", () => {
    const seed = seeded();
    const test = createTest(seed.db, seed.course.id, { name: "T", questionIds: seed.ids });
    const later = createSitting(seed.db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), durationMinutes: 15 });
    const refusedAll = () => {
      assert.throws(() => endSitting(seed.db, later.id), ConflictError);
      assert.throws(() => extendStartWindow(seed.db, later.id, { minutes: 10 }), ConflictError);
      assert.throws(() => extendWritingTime(seed.db, later.id, { minutes: 10 }), ConflictError);
    };
    refusedAll();
    seed.db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-60), inMinutes(-1), later.id);
    refusedAll();
  });
});

describe("a sitting is open until its last attempt is over", () => {
  const timing = (db, testId, at) => {
    const { state, startOpen, endsAt } = testSittings(db, testId, at)[0];
    return { state, startOpen, endsAt };
  };

  test("open after the start window while an attempt runs, over at its deadline", () => {
    const { db, test, sitting } = running({ duration: 20, window: 10 });
    const start = shift(sitting.closesAt, -1);
    const deadline = shift(start, 20);
    startAttempt(db, "anna", test.id, start);
    assert.deepEqual(timing(db, test.id, shift(sitting.closesAt, -2)), { state: "open", startOpen: true, endsAt: shift(sitting.closesAt, 20) }, "during the start window");
    assert.deepEqual(timing(db, test.id, shift(sitting.closesAt, 5)), { state: "open", startOpen: false, endsAt: deadline }, "after it, the last deadline");
    assert.deepEqual(timing(db, test.id, deadline), { state: "over", startOpen: false, endsAt: null });
    assert.equal(getTest(db, test.id).sittings[0].state, "open");
  });

  test("over at the start window's end when everybody submitted early, or nobody started", () => {
    const nobody = running({ duration: 20, window: 10 });
    assert.equal(timing(nobody.db, nobody.test.id, nobody.sitting.closesAt).state, "over", "nobody started");
    const early = running({ duration: 20, window: 10 });
    submitAttempt(early.db, attemptRow(early.db, startAttempt(early.db, "anna", early.test.id).attemptId));
    assert.equal(timing(early.db, early.test.id, shift(early.sitting.closesAt, -0.01)).state, "open");
    assert.equal(timing(early.db, early.test.id, early.sitting.closesAt).state, "over", "everybody submitted");
  });

  test("the latest end follows an extension of the writing time", () => {
    const { db, test, sitting } = running({ duration: 20, window: 10 });
    const start = shift(sitting.closesAt, -1);
    startAttempt(db, "anna", test.id, start);
    extendWritingTime(db, sitting.id, { minutes: 5 });
    assert.equal(timing(db, test.id, new Date().toISOString()).endsAt, shift(start, 25), "later than the start window plus the duration");
    assert.equal(timing(db, test.id, shift(sitting.closesAt, 5)).endsAt, shift(start, 25));
  });

  test("the live snapshot carries the start window and the latest end, also for the class, and follows the last submission", () => {
    const { db, test, sitting } = running({ duration: 20, window: 10 });
    const anna = startAttempt(db, "anna", test.id, shift(sitting.closesAt, -3)).attemptId;
    const ben = startAttempt(db, "ben", test.id, shift(sitting.closesAt, -1)).attemptId;
    const after = shift(sitting.closesAt, 2);
    const live = (at, options) => {
      const { state, startOpen, endsAt } = liveSnapshot(db, sitting.id, at, options).sitting;
      return { state, startOpen, endsAt };
    };
    assert.deepEqual(live(after), { state: "open", startOpen: false, endsAt: attemptRow(db, ben).deadline });
    assert.deepEqual(live(after, { screen: true }), live(after), "the view for the class carries the same");
    submitAttempt(db, attemptRow(db, ben), after);
    assert.equal(live(after).endsAt, attemptRow(db, anna).deadline, "the other one's deadline");
    submitAttempt(db, attemptRow(db, anna), after);
    assert.deepEqual(live(after), { state: "over", startOpen: false, endsAt: null });
  });

  test("the routes for both extensions are a teacher's and reach the live view", async () => {
    const dbPath = temporaryPath();
    const saved = { path: process.env.EXAM_DB_PATH, periods: process.env.SCHOOL_PERIODS, fetch: global.fetch };
    process.env.EXAM_DB_PATH = dbPath;
    delete process.env.SCHOOL_PERIODS;
    const started = await init({ startPage: () => "/index.html" });
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const seed = seeded(db);
    const test = createTest(db, seed.course.id, { name: "T", questionIds: seed.ids });
    const sitting = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(70), durationMinutes: 20 });
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-1), inMinutes(9), sitting.id);
    const anna = startAttempt(db, "anna", test.id).attemptId;
    global.fetch = async () => ({ ok: true, json: async () => ({ attributes: { config: [JSON.stringify({ vt: 1 })] } }) });
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const username = req.get("X-As");
      req.user = {
        name: username,
        preferred_username: username,
        accessToken: "access-token",
        accessTokenDecoded: { preferred_username: username },
        keycloakConfig: { "auth-server-url": "https://identity.example/", realm: "demo", resource: "safelearn" },
        rolesCalculated: JSON.stringify({ [req.get("X-Role")]: true }),
      };
      next();
    });
    app.use("/exam", started.router);
    const server = app.listen(0);
    const heard = [];
    const stop = listen(sitting.id, (event) => heard.push(event));
    try {
      const extend = (kind, as, role, minutes) =>
        saved.fetch(`http://127.0.0.1:${server.address().port}/exam/api/sittings/${sitting.id}/extend-${kind}`, {
          method: "POST",
          headers: { "X-As": as, "X-Role": role, "Content-Type": "application/json" },
          body: JSON.stringify({ minutes }),
        });
      const deadline = attemptRow(db, anna).deadline;
      assert.equal((await extend("start", "anna", "student", 5)).status, 403, "a student");
      assert.equal((await extend("writing", "anna", "student", 5)).status, 403, "a student");
      assert.deepEqual(heard, [], "nothing announced");
      const start = await extend("start", "tdent", "teacher", 5);
      assert.equal(start.status, 200);
      const closes = db.prepare("SELECT closes_at FROM sitting").get().closes_at;
      assert.equal((await start.json()).closesAt, closes);
      assert.ok(closes > inMinutes(13), "five minutes later");
      const writing = await extend("writing", "tdent", "teacher", 3);
      assert.equal(writing.status, 200);
      assert.equal(attemptRow(db, anna).deadline, shift(deadline, 3));
      assert.equal((await extend("writing", "tdent", "teacher", 0)).status, 400, "refused minutes");
      assert.deepEqual(heard, [{ type: "window", username: null }, { type: "window", username: null }]);
    } finally {
      stop();
      await new Promise((resolve) => server.close(resolve));
      global.fetch = saved.fetch;
      if (saved.path === undefined) delete process.env.EXAM_DB_PATH;
      else process.env.EXAM_DB_PATH = saved.path;
      if (saved.periods !== undefined) process.env.SCHOOL_PERIODS = saved.periods;
    }
  });
});

describe("an admin's corrections of a written test", () => {
  /** Anna answers every question correctly and submits; Ben starts and stays. */
  function written() {
    const seed = running();
    const anna = startAttempt(seed.db, "anna", seed.test.id).attemptId;
    for (const [n, tokens] of Object.entries(correctTokens(seed.db, anna))) saveAnswer(seed.db, attemptRow(seed.db, anna), Number(n), tokens);
    submitAttempt(seed.db, attemptRow(seed.db, anna));
    const ben = startAttempt(seed.db, "ben", seed.test.id).attemptId;
    return { ...seed, anna, ben };
  }
  const count = (db, sql, ...args) => db.prepare(sql).get(...args).n;

  test("a written test is deleted only by an admin, with every attempt and its answers", () => {
    const { db, test } = written();
    assert.throws(() => deleteTest(db, test.id), ConflictError, "not by a teacher");
    deleteTest(db, test.id, { admin: true });
    for (const table of ["attempt", "attempt_question", "attempt_token", "response", "sitting", "test_question", "test_answer", "test_image", "question_usage", "test"]) {
      assert.equal(count(db, `SELECT COUNT(*) AS n FROM ${table}`), 0, `${table} is empty`);
    }
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });

  test("an online test's cell takes a note without an attempt, shown to that student only, and gone with the test", () => {
    const { db, course, test } = written();
    const key = `test-${test.id}`;
    const before = studentRecord(db, course.id, "ben").semesters;
    // Ben started but never submitted: no result in the column, and a note all the same.
    assert.deepEqual(setNote(db, course.id, key, "ben", "Ill, make-up on 12 Dec"), { note: "Ill, make-up on 12 Dec" });
    setNote(db, course.id, key, "anna", "Well done");
    assert.deepEqual(studentRecord(db, course.id, "ben").semesters, before, "the note moves no proposal");
    const semester = ["ws", "ss"].find((s) => courseOverview(db, course.id, s).columns.some((c) => c.id === key));
    const sheet = courseOverview(db, course.id, semester);
    assert.deepEqual(sheet.students.map((row) => [row.username, row.results[key]?.points ?? null, row.notes[key]]), [
      ["anna", 3, "Well done"],
      ["ben", null, "Ill, make-up on 12 Dec"],
    ]);
    const own = resultsOf(db, "ben").courses[0].entries;
    assert.deepEqual(own.map((e) => [e.columnId, e.kind, e.value, e.note]), [[key, "online", null, "Ill, make-up on 12 Dec"]], "the column is shown to ben by its note");

    assert.throws(() => deleteTest(db, test.id), ConflictError, "notes change nothing about who may delete");
    deleteTest(db, test.id, { admin: true });
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM result_note"), 0, "the notes go with the test");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });

  test("removing a question from a written test scores every submitted attempt again over the rest", () => {
    const { db, test, anna, ben, ids } = written();
    assert.equal(attemptRow(db, anna).score, 3);
    // Anna's answer to the multi-answer question becomes wrong; removing it gives her full marks over two.
    const multi = db.prepare("SELECT id, question_id FROM test_question WHERE test_id = ? AND type = 'multichoiceset'").get(test.id);
    db.prepare("DELETE FROM response WHERE attempt_id = ? AND test_answer_id IN (SELECT id FROM test_answer WHERE test_question_id = ?)").run(anna, multi.id);
    db.prepare("UPDATE attempt SET score = ? WHERE id = ?").run(scoreAttempt(db, anna), anna);
    assert.equal(attemptRow(db, anna).score, 2);

    const after = removeWrittenQuestion(db, test.id, multi.id, scoreAttempt);
    assert.equal(after.questions.length, 2);
    assert.deepEqual([attemptRow(db, anna).score, attemptRow(db, anna).question_count], [2, 2], "2 of 2 now");
    assert.deepEqual([attemptRow(db, ben).score, attemptRow(db, ben).question_count], [null, 2], "an open attempt keeps writing, over two");
    for (const attempt of [anna, ben]) {
      const positions = db.prepare("SELECT position FROM attempt_question WHERE attempt_id = ? ORDER BY position").all(attempt).map((row) => row.position);
      assert.deepEqual(positions, [0, 1], "no gap in the attempt's order");
    }
    assert.deepEqual(writingView(db, attemptRow(db, ben)).questions.map((q) => q.n), [1, 2], "Ben writes on with two questions");
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM question_usage WHERE test_id = ? AND question_id = ?", test.id, multi.question_id), 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.ok(ids.includes(multi.question_id), "the pool question itself stays");
    assert.ok(getQuestion(db, multi.question_id));
  });

  test("the last question of a written test cannot be removed, and a question not in it is not found", () => {
    const { db, test, ids } = written();
    const inTest = db.prepare("SELECT id FROM test_question WHERE test_id = ? ORDER BY position").all(test.id).map((row) => row.id);
    removeWrittenQuestion(db, test.id, inTest[0], scoreAttempt);
    removeWrittenQuestion(db, test.id, inTest[1], scoreAttempt);
    assert.throws(() => removeWrittenQuestion(db, test.id, inTest[2], scoreAttempt), ConflictError);
    assert.throws(() => removeWrittenQuestion(db, test.id, inTest[0], scoreAttempt), NotFoundError);
    assert.equal(ids.length, 3);
  });

  test("deleting an attempt lets the student start again while the sitting is open", () => {
    const { db, test, anna } = written();
    deleteAttempt(db, anna);
    assert.equal(attemptRow(db, anna), undefined);
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM response WHERE attempt_id = ?", anna), 0);
    assert.equal(startAttempt(db, "anna", test.id).created, true, "a fresh attempt");
    assert.throws(() => deleteAttempt(db, anna), NotFoundError);
  });
});

describe("rescheduling a sitting that is over", () => {
  /** The `running` sitting, ended now, with Anna's attempt submitted and Ben's ended with it. */
  function over({ attempts = true } = {}) {
    const seed = running();
    if (attempts) {
      submitAttempt(seed.db, attemptRow(seed.db, startAttempt(seed.db, "anna", seed.test.id).attemptId));
      startAttempt(seed.db, "ben", seed.test.id);
    }
    endSitting(seed.db, seed.sitting.id);
    return seed;
  }
  const window = { opensAt: inMinutes(60), closesAt: inMinutes(120) };
  const attempts = (db) => db.prepare("SELECT COUNT(*) AS n FROM attempt").get().n;

  test("each sitting counts its own attempts, not the test's", () => {
    const { db, test } = running({ participants: ["anna"] });
    startAttempt(db, "anna", test.id);
    createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60) });
    db.prepare("UPDATE sitting SET opens_at = ? WHERE makeup = 1").run(inMinutes(-1));
    startAttempt(db, "ben", test.id);
    startAttempt(db, "ben", test.id);
    assert.deepEqual(testSittings(db, test.id).map((sitting) => [sitting.makeup, sitting.attempts]), [[false, 1], [true, 1]]);
  });

  test("a teacher sets one nobody wrote again, with its duration and participants", () => {
    const { db, sitting } = over({ attempts: false });
    const moved = rescheduleSitting(db, sitting.id, window);
    assert.deepEqual(
      [moved.state, moved.opensAt, moved.closesAt, moved.durationS, moved.participants, moved.deleted],
      ["scheduled", window.opensAt, window.closesAt, 900, ["anna", "ben"], []]
    );
  });

  test("an admin deletes its attempts with their answers; a teacher may not", () => {
    const { db, sitting } = over();
    assert.throws(() => rescheduleSitting(db, sitting.id, { ...window, attempts: 2 }), ForbiddenError);
    assert.throws(() => rescheduleSitting(db, sitting.id, window, { admin: true }), /changed/, "the admin confirms none");
    assert.throws(() => rescheduleSitting(db, sitting.id, { ...window, attempts: 3 }, { admin: true }), ConflictError);
    assert.equal(attempts(db), 2, "nothing changed");
    const moved = rescheduleSitting(db, sitting.id, { ...window, attempts: 2 }, { admin: true });
    assert.deepEqual([moved.state, moved.attempts, moved.deleted], ["scheduled", 0, ["anna", "ben"]]);
    for (const table of ["attempt", "attempt_question", "attempt_token", "response"]) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, `${table} is empty`);
    }
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });

  test("a scheduled or open sitting is refused, and so is a window that is not a sitting's", () => {
    const { db, test, sitting } = running();
    assert.throws(() => rescheduleSitting(db, sitting.id, window), /Only a sitting that is over/);
    // Its start window closed, but an attempt in it still runs.
    const anna = startAttempt(db, "anna", test.id, shift(sitting.closesAt, -1)).attemptId;
    assert.throws(() => rescheduleSitting(db, sitting.id, window, { admin: true }, shift(sitting.closesAt, 5)), /Only a sitting that is over/, "an attempt still runs");
    db.prepare("DELETE FROM attempt WHERE id = ?").run(anna);
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(60), inMinutes(120), sitting.id);
    assert.throws(() => rescheduleSitting(db, sitting.id, window), ConflictError);
    endSitting(db, sitting.id, inMinutes(90));
    assert.throws(() => rescheduleSitting(db, sitting.id, { opensAt: inMinutes(200), closesAt: inMinutes(200) }, {}, inMinutes(100)), /open before it closes/);
    assert.throws(() => rescheduleSitting(db, sitting.id, { opensAt: inMinutes(200), closesAt: inMinutes(801) }, {}, inMinutes(100)), /600 minutes/);
    assert.throws(() => rescheduleSitting(db, sitting.id, { opensAt: inMinutes(-60), closesAt: inMinutes(-10) }, {}, inMinutes(100)), /future/);
  });

  test("those who left the roster are dropped, and nobody left is refused", () => {
    const { db, klass, test, sitting } = over({ attempts: false });
    removeFromRoster(db, klass.id, "ben");
    assert.deepEqual(rescheduleSitting(db, sitting.id, window).participants, ["anna"]);
    removeFromRoster(db, klass.id, "anna");
    assert.throws(() => rescheduleSitting(db, sitting.id, { opensAt: inMinutes(300), closesAt: inMinutes(360) }, {}, inMinutes(200)), InvalidInputError);
    assert.deepEqual(testSittings(db, test.id)[0].participants, ["anna"], "nothing changed");
  });

  test("a make-up keeps its window, participants and attempts", () => {
    const { db, test, sitting } = over({ attempts: false });
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60) });
    db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(inMinutes(-1), makeup.id);
    startAttempt(db, "anna", test.id);
    const before = testSittings(db, test.id).find((candidate) => candidate.id === makeup.id);
    assert.equal(before.attempts, 1);
    rescheduleSitting(db, sitting.id, { opensAt: inMinutes(200), closesAt: inMinutes(260) });
    const after = testSittings(db, test.id);
    assert.deepEqual(after.find((candidate) => candidate.id === makeup.id), before);
    assert.equal(after.find((candidate) => candidate.id === sitting.id).makeup, false, "still the first sitting");
  });

  test("the usage date and the gradebook column move into the next semester", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "Moved", questionIds: [ids[0]] });
    const id = Number(
      db
        .prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, makeup, created_at) VALUES (?, '2027-01-12T08:00:00.000Z', '2027-01-12T09:00:00.000Z', 900, 0, 'x')")
        .run(test.id).lastInsertRowid
    );
    for (const username of ["anna", "ben"]) db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, ?)").run(id, username);
    rescheduleSitting(db, id, { opensAt: "2027-02-23T08:00:00.000Z", closesAt: "2027-02-23T09:00:00.000Z" }, {}, "2027-01-20T10:00:00.000Z");
    assert.equal(getQuestion(db, ids[0]).usage[0].usedOn, "2027-02-23");
    assert.deepEqual(courseOverview(db, course.id, "ws").columns, []);
    assert.deepEqual(courseOverview(db, course.id, "ss").columns.map((column) => [column.name, column.date]), [["Moved", "2027-02-23"]]);
  });
});

describe("discarding a test while its first sitting is open", () => {
  /** The class with Carla as well, a test of all three questions and its sitting open now. */
  function open(seed = seeded()) {
    addToRoster(seed.db, seed.klass.id, { username: "carla" });
    const test = createTest(seed.db, seed.course.id, { name: "Broken", questionIds: seed.ids });
    const sitting = createSitting(seed.db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    seed.db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-1), inMinutes(49), sitting.id);
    return { ...seed, test, sitting };
  }
  const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const tables = ["attempt", "attempt_question", "attempt_token", "response", "sitting", "sitting_participant", "result_note", "teacher_note"];
  const counts = (db) => Object.fromEntries(tables.map((table) => [table, count(db, table)]));

  test("every attempt, sitting and note goes, and the test follows the pool and is editable again", () => {
    const { db, course, test, sitting, ids } = open();
    submitAttempt(db, attemptRow(db, startAttempt(db, "anna", test.id).attemptId));
    const ben = startAttempt(db, "ben", test.id).attemptId;
    saveAnswer(db, attemptRow(db, ben), 1, correctTokens(db, ben)[1]);
    startAttempt(db, "carla", test.id);
    createSitting(db, test.id, { opensAt: inMinutes(200), closesAt: inMinutes(260) });
    setTeacherNote(db, test.id, "ben", "Looked at the neighbour's screen");
    setNote(db, course.id, `test-${test.id}`, "anna", "Well done");
    saveQuestion(db, ids[2], edited(db, ids[2], "<p>edited after the opening</p>"));
    assert.notEqual(textsOf(db, test.id)[2], "<p>edited after the opening</p>", "the begun test keeps its snapshot");
    assert.deepEqual(courseOverview(db, course.id, "ws").columns.map((column) => column.testId), [test.id]);

    const discarded = discardTest(db, test.id, { attempts: 3 });
    assert.equal(discarded.discardedSittingId, sitting.id);
    assert.deepEqual([discarded.name, discarded.started, discarded.sittings], ["Broken", false, []]);
    for (const [table, n] of Object.entries(counts(db))) assert.equal(n, 0, `${table} is empty`);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(textsOf(db, test.id)[2], "<p>edited after the opening</p>", "the test took the pool's version");
    assert.deepEqual(courseOverview(db, course.id, "ws").columns, [], "no column left in the gradebook");
    assert.equal(getQuestion(db, ids[0]).usage[0].usedOn, viennaDate(new Date().toISOString()), "used today until a new sitting");

    const renamed = updateTest(db, test.id, { name: "Fixed", questionIds: [ids[0], ids[1]] });
    assert.deepEqual([renamed.name, renamed.questions.map((q) => q.questionId)], ["Fixed", [ids[0], ids[1]]]);
    assert.deepEqual(deleteTest(db, test.id), { deleted: test.id });
    assert.equal(count(db, "question_usage"), 0);
  });

  test("a count that differs from the confirmed one is refused and changes nothing", () => {
    const { db, test } = open();
    startAttempt(db, "anna", test.id);
    startAttempt(db, "ben", test.id);
    const before = counts(db);
    assert.throws(() => discardTest(db, test.id, { attempts: 1 }), /changed/);
    assert.throws(() => discardTest(db, test.id, {}), ConflictError, "none confirmed");
    assert.deepEqual(counts(db), before);
  });

  test("a first sitting not yet opened is refused, one that is over is not, and one where a make-up is open is refused", () => {
    const { db, test, sitting } = open();
    startAttempt(db, "anna", test.id);
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(60), inMinutes(120), sitting.id);
    const scheduled = counts(db);
    assert.throws(() => discardTest(db, test.id, { attempts: 1 }), (error) => error instanceof ConflictError && error.key === "exam.errors.tests.discardNotOpened");
    assert.deepEqual(counts(db), scheduled);
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-60), inMinutes(-10), sitting.id);
    // Anna's attempt still runs, so the first sitting is open after its start window.
    assert.equal(testSittings(db, test.id)[0].state, "open");
    db.prepare("UPDATE attempt SET deadline = ? WHERE username = 'anna'").run(inMinutes(-5));
    assert.deepEqual(getTest(db, test.id).discard, { allowed: true, results: 1 }, "a first sitting that is over can be discarded");
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60) });
    db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(inMinutes(-1), makeup.id);
    startAttempt(db, "ben", test.id);
    const makeupOpen = counts(db);
    assert.throws(() => discardTest(db, test.id, { attempts: 2 }), (error) => error.key === "exam.errors.tests.discardMakeupOpen");
    assert.deepEqual(counts(db), makeupOpen);
  });

  test("a test that is over goes with its results, and a new first sitting is for the whole class", () => {
    const { db, course, test, sitting } = open();
    submitAttempt(db, attemptRow(db, startAttempt(db, "anna", test.id).attemptId));
    submitAttempt(db, attemptRow(db, startAttempt(db, "ben", test.id).attemptId));
    endSitting(db, sitting.id);
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(200), closesAt: inMinutes(260) });
    assert.deepEqual(makeup.participants, ["carla"]);
    assert.deepEqual(getTest(db, test.id).discard, { allowed: true, results: 2 });
    const discarded = discardTest(db, test.id, { attempts: 2 });
    assert.deepEqual([discarded.sittings, discarded.attempts.started, discarded.discardedSittingIds], [[], 0, [sitting.id, makeup.id]]);
    assert.deepEqual(courseOverview(db, course.id, "ws").columns, [], "no column left");
    const again = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    assert.deepEqual([again.makeup, again.participants], [false, ["anna", "ben", "carla"]]);
  });

  test("a closed school year is refused", () => {
    const { db, year, test, sitting } = open();
    startAttempt(db, "anna", test.id);
    endSitting(db, sitting.id);
    db.prepare("UPDATE school_year SET closed_at = ? WHERE id = ?").run(new Date().toISOString(), year.id);
    assert.throws(() => discardTest(db, test.id, { attempts: 1 }), (error) => error.key === "exam.errors.years.closed");
    assert.equal(count(db, "attempt"), 1);
  });

  test("the route is a teacher's, not only an admin's, and tells the former sitting's live view", async () => {
    const dbPath = temporaryPath();
    const saved = { path: process.env.EXAM_DB_PATH, periods: process.env.SCHOOL_PERIODS, fetch: global.fetch };
    process.env.EXAM_DB_PATH = dbPath;
    delete process.env.SCHOOL_PERIODS;
    const started = await init({ startPage: () => "/index.html" });
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const { course, test, sitting } = open(seeded(db));
    startAttempt(db, "anna", test.id);
    global.fetch = async () => ({ ok: true, json: async () => ({ attributes: { config: [JSON.stringify({ vt: 1 })] } }) });
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const username = req.get("X-As");
      req.user = {
        name: username,
        preferred_username: username,
        accessToken: "access-token",
        accessTokenDecoded: { preferred_username: username },
        keycloakConfig: { "auth-server-url": "https://identity.example/", realm: "demo", resource: "safelearn" },
        rolesCalculated: JSON.stringify({ [req.get("X-Role")]: true }),
      };
      next();
    });
    app.use("/exam", started.router);
    const server = app.listen(0);
    const heard = [];
    const stop = listen(sitting.id, (event) => heard.push(event));
    try {
      const discard = (as, role, attempts) =>
        saved.fetch(`http://127.0.0.1:${server.address().port}/exam/api/tests/${test.id}/discard`, {
          method: "POST",
          headers: { "X-As": as, "X-Role": role, "Content-Type": "application/json" },
          body: JSON.stringify({ attempts }),
        });
      assert.equal((await discard("anna", "student", 1)).status, 403, "a student");
      assert.equal((await discard("tdent", "teacher", 2)).status, 409, "a count that changed");
      assert.equal(count(db, "attempt"), 1, "nothing changed");
      const answer = await discard("tdent", "teacher", 1);
      assert.equal(answer.status, 200);
      assert.deepEqual((await answer.json()).sittings, []);
      assert.deepEqual(heard, [{ type: "discarded", username: null, testId: test.id }]);
      assert.deepEqual(courseOverview(db, course.id, "ws").columns, [], "the gradebook lists no column of the test");
    } finally {
      stop();
      await new Promise((resolve) => server.close(resolve));
      global.fetch = saved.fetch;
      if (saved.path === undefined) delete process.env.EXAM_DB_PATH;
      else process.env.EXAM_DB_PATH = saved.path;
      if (saved.periods !== undefined) process.env.SCHOOL_PERIODS = saved.periods;
    }
  });

  test("an offline test goes with the results in its column, once a sitting was started and none runs", () => {
    const { db, course } = seeded();
    const offline = createOfflineTest(db, course.id, { name: "Paper", durationMinutes: 50, gradebookKind: "test" });
    const sitting = createSitting(db, offline.id, { opensAt: inMinutes(60) });
    assert.throws(() => discardTest(db, offline.id, { attempts: 0 }), (error) => error.key === "exam.errors.tests.discardNotStarted");
    db.prepare("UPDATE sitting SET started_at = ?, opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-10), inMinutes(-10), inMinutes(40), sitting.id);
    assert.throws(() => discardTest(db, offline.id, { attempts: 0 }), (error) => error.key === "exam.errors.tests.discardRunning");
    db.prepare("UPDATE sitting SET closes_at = ? WHERE id = ?").run(inMinutes(-1), sitting.id);
    setResult(db, offline.assessmentId, "anna", { percent: 50 });
    assert.deepEqual(getTest(db, offline.id).discard, { allowed: true, results: 1 });
    assert.throws(() => discardTest(db, offline.id, { attempts: 0 }), /changed/);
    const discarded = discardTest(db, offline.id, { attempts: 1 });
    assert.deepEqual([discarded.sittings, discarded.assessmentId], [[], offline.assessmentId], "the column stays");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM manual_entry WHERE assessment_id = ?").get(offline.assessmentId).n, 0, "without results");
  });
});

// ------------------------------------------------- following the pool

/** What the editor sends back for a pool question, with its English text changed to `textEn`. */
function edited(db, id, textEn) {
  const q = getQuestion(db, id);
  return {
    version: q.version,
    categoryId: q.categoryId,
    type: q.type,
    nameDe: q.nameDe,
    nameEn: q.nameEn,
    textDe: q.textDe,
    textEn,
    answers: q.answers.map(({ textDe, textEn: answerEn, correct }) => ({ textDe, textEn: answerEn, correct })),
  };
}

/** The English texts an attempt shows, in the test's order rather than the attempt's. */
const textsOf = (db, testId) => getTest(db, testId).questions.map((q) => q.textEn);

describe("a test follows the pool until it begins", () => {
  test("an edit reaches a test not yet begun: its page, its preview and the attempts written later", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: ids });
    const sitting = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    saveQuestion(db, ids[2], edited(db, ids[2], "<p>corrected</p>"));
    assert.equal(textsOf(db, test.id)[2], "<p>corrected</p>");
    assert.ok(previewView(db, test.id).questions.some((q) => q.text === "<p>corrected</p>"));
    db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(inMinutes(-1), sitting.id);
    const { attemptId } = startAttempt(db, "anna", test.id);
    assert.ok(writingView(db, attemptRow(db, attemptId)).questions.some((q) => q.text === "<p>corrected</p>"), "Anna writes the corrected version");
  });

  test("an edit after the first attempt reaches neither the test nor a make-up", () => {
    const { db, test, ids } = running({ participants: ["anna"] });
    startAttempt(db, "anna", test.id);
    const before = textsOf(db, test.id);
    saveQuestion(db, ids[2], edited(db, ids[2], "<p>too late</p>"));
    assert.deepEqual(textsOf(db, test.id), before);
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60) });
    db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(inMinutes(-1), makeup.id);
    const ben = startAttempt(db, "ben", test.id).attemptId;
    assert.ok(!writingView(db, attemptRow(db, ben)).questions.some((q) => q.text === "<p>too late</p>"), "the make-up writes the snapshot");
  });

  test("a sitting set again with all its attempts deleted lets the test follow the pool again", () => {
    const { db, test, sitting, ids } = running();
    submitAttempt(db, attemptRow(db, startAttempt(db, "anna", test.id).attemptId));
    endSitting(db, sitting.id);
    saveQuestion(db, ids[2], edited(db, ids[2], "<p>edited after the sitting</p>"));
    assert.notEqual(textsOf(db, test.id)[2], "<p>edited after the sitting</p>");
    rescheduleSitting(db, sitting.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), attempts: 1 }, { admin: true });
    assert.equal(textsOf(db, test.id)[2], "<p>edited after the sitting</p>", "the reset test took the pool's version");
    saveQuestion(db, ids[2], edited(db, ids[2], "<p>and again</p>"));
    assert.equal(textsOf(db, test.id)[2], "<p>and again</p>", "and follows it until the new sitting opens");
  });

  test("a make-up set again while the first sitting has attempts keeps the snapshot", () => {
    const { db, test, sitting, ids } = running({ participants: ["anna"] });
    submitAttempt(db, attemptRow(db, startAttempt(db, "anna", test.id).attemptId));
    endSitting(db, sitting.id);
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60) });
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-30), inMinutes(-1), makeup.id);
    const before = textsOf(db, test.id);
    saveQuestion(db, ids[2], edited(db, ids[2], "<p>not for the make-up</p>"));
    rescheduleSitting(db, makeup.id, { opensAt: inMinutes(60), closesAt: inMinutes(120) });
    assert.deepEqual(textsOf(db, test.id), before);
  });

  test("a reset test drops a question deleted from the pool while it was begun", () => {
    const { db, test, sitting, ids } = running();
    endSitting(db, sitting.id);
    deleteQuestion(db, ids[1], { tests: 0 });
    assert.equal(getTest(db, test.id).questions.length, 3, "the begun test keeps its copy");
    rescheduleSitting(db, sitting.id, { opensAt: inMinutes(60), closesAt: inMinutes(120) });
    assert.deepEqual(getTest(db, test.id).questions.map((q) => q.questionId), [ids[0], ids[2]]);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });

  test("every write of a question's content runs through writeContent, an allowed creator, or deleteQuestion", () => {
    // A write that skipped the refresh would leave tests not yet begun behind the pool (design D1).
    const dir = path.join(import.meta.dirname, "..", "exam");
    const writes = /\b(UPDATE (question|answer|image)\b[\s\S]*?\bSET\b([^`"]*)|INSERT (OR \w+ )?INTO (question|answer|image)\b|DELETE FROM (question|answer|image)\b)/g;
    const content = /\b(type|name_de|name_en|text_de|text_en|correct|data|sha256|mime|question_id)\b/;
    const allowed = {
      "pool-edit.js": ["writeContent", "removeUnreferencedImages", "insertQuestion", "saveQuestion", "deleteQuestion"],
      "tests.js": ["sweepOrphanImages"],
    };
    const creators = ["pool-import.js", "question-import.js"];
    const found = [];
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js"))) {
      if (creators.includes(file)) continue;
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      for (const match of source.matchAll(writes)) {
        if (match[2] && !content.test(match[3])) continue;
        const before = source.slice(0, match.index);
        const fn = [...before.matchAll(/^(?:export )?function (\w+)/gm)].at(-1)?.[1];
        if (!(allowed[file] ?? []).includes(fn)) found.push(`${file}: ${fn}: ${match[0].slice(0, 60)}`);
      }
    }
    assert.deepEqual(found, [], "a new path that writes pool content has to refresh the tests not yet begun");
    const editor = fs.readFileSync(path.join(dir, "pool-edit.js"), "utf8");
    const body = (name) => editor.slice(editor.indexOf(`function ${name}(`)).split(/\n}\n/)[0];
    assert.match(body("saveQuestion"), /writeContent\(/, "saveQuestion's own update is followed by writeContent");
    assert.match(body("writeContent"), /refreshCopy\(/);
  });
});

describe("deleting a question from the pool", () => {
  /** Anna answered and submitted, Ben is still writing: the `running` test, written. */
  function written() {
    const seed = running();
    const anna = startAttempt(seed.db, "anna", seed.test.id).attemptId;
    for (const [n, tokens] of Object.entries(correctTokens(seed.db, anna))) saveAnswer(seed.db, attemptRow(seed.db, anna), Number(n), tokens);
    submitAttempt(seed.db, attemptRow(seed.db, anna));
    const ben = startAttempt(seed.db, "ben", seed.test.id).attemptId;
    return { ...seed, anna, ben };
  }
  const withoutPoolIds = (test) => ({ ...test, questions: test.questions.map(({ questionId, ...question }) => question) });

  test("a written test, its board solution, its attempts, its scores, the gradebook and its images stay as they were", () => {
    const { db, course, test, anna, ben, ids } = written();
    const image = db.prepare("SELECT id FROM image WHERE question_id = ?").get(ids[0]).id;
    const before = {
      test: withoutPoolIds(getTest(db, test.id)),
      shares: correctShares(db, test.id),
      attempts: db.prepare("SELECT * FROM attempt ORDER BY id").all(),
      gradebook: courseOverview(db, course.id, "ws"),
      responses: db.prepare("SELECT * FROM response ORDER BY 1, 2").all(),
    };
    assert.deepEqual(getQuestion(db, ids[0]).pendingTests, []);
    deleteQuestion(db, ids[0], { tests: 0 });
    assert.throws(() => getQuestion(db, ids[0]), NotFoundError, "the question is gone from the pool");
    assert.deepEqual(withoutPoolIds(getTest(db, test.id)), before.test);
    assert.equal(getTest(db, test.id).questions.find((q) => q.type === "multichoice").questionId, null, "the copy let go of it");
    assert.deepEqual(correctShares(db, test.id), before.shares);
    assert.deepEqual(db.prepare("SELECT * FROM attempt ORDER BY id").all(), before.attempts);
    assert.deepEqual(db.prepare("SELECT * FROM response ORDER BY 1, 2").all(), before.responses);
    assert.deepEqual(courseOverview(db, course.id, "ws"), before.gradebook);
    assert.equal(attemptRow(db, anna).score, 3);
    assert.ok(studentMaySeeImage(db, "ben", image), "Ben's open attempt still shows the image");
    assert.equal(db.prepare("SELECT question_id FROM image WHERE id = ?").get(image).question_id, null);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });

  test("a question planned in two tests is taken out of both after confirming them, and its usage goes", () => {
    const { db, course, ids } = seeded();
    const first = createTest(db, course.id, { name: "First", questionIds: [ids[0], ids[1]] });
    const second = createTest(db, course.id, { name: "Second", questionIds: [ids[1], ids[2]] });
    createSitting(db, second.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), durationMinutes: 15 });
    assert.deepEqual(getQuestion(db, ids[1]).pendingTests.map((t) => t.name), ["First", "Second"]);
    const rows = () => ["test_question", "test_answer", "test_image", "question_usage", "question", "answer"].map((table) => db.prepare(`SELECT * FROM ${table}`).all());
    const before = rows();
    assert.throws(() => deleteQuestion(db, ids[1], { tests: 1 }), (error) => error instanceof ConflictError && /changed/.test(error.message));
    assert.throws(() => deleteQuestion(db, ids[1]), ConflictError, "none confirmed");
    assert.deepEqual(rows(), before, "nothing changed");
    deleteQuestion(db, ids[1], { tests: 2 });
    assert.deepEqual(getTest(db, first.id).questions.map((q) => q.questionId), [ids[0]]);
    assert.deepEqual(getTest(db, second.id).questions.map((q) => q.questionId), [ids[2]]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question_usage WHERE question_id = ?").get(ids[1]).n, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });

  test("a course's tests are newest first: without a sitting on top, then by their first sitting, latest first", () => {
    const { db, course, ids } = seeded();
    const make = (name, ...hours) => {
      const test = createTest(db, course.id, { name, questionIds: [ids[0]] });
      for (const hour of hours) createSitting(db, test.id, { opensAt: inMinutes(hour * 60), closesAt: inMinutes(hour * 60 + 50), durationMinutes: 15 });
      return test;
    };
    make("Early", 1);
    make("Late", 48);
    make("Unplanned A");
    // A make-up far ahead does not move a test: its first sitting dates it.
    const middle = make("Middle", 24);
    createSitting(db, middle.id, { opensAt: inMinutes(96 * 60), closesAt: inMinutes(96 * 60 + 50), durationMinutes: 15 });
    make("Unplanned B");
    db.prepare("UPDATE test SET created_at = ? WHERE name = ?").run("2026-01-01T00:00:00.000Z", "Unplanned A");
    db.prepare("UPDATE test SET created_at = ? WHERE name = ?").run("2026-01-02T00:00:00.000Z", "Unplanned B");
    assert.deepEqual(
      listTests(db, { courseId: course.id }).groups[0].tests.map((t) => t.name),
      ["Unplanned B", "Unplanned A", "Late", "Middle", "Early"]
    );
  });

  test("a test whose last question is deleted stays, without questions, until it is given some again", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "Alone", questionIds: [ids[0]] });
    const sitting = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), durationMinutes: 15 });
    deleteQuestion(db, ids[0], { tests: 1 });
    const empty = getTest(db, test.id);
    assert.deepEqual([empty.questions, empty.sittings.length], [[], 1], "the sitting stays scheduled");
    assert.equal(listTests(db, { courseId: course.id }).groups[0].tests[0].questions, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM image").get().n, 0, "the deleted question's image went with it");
    assert.throws(
      () => createSitting(db, test.id, { opensAt: inMinutes(200), closesAt: inMinutes(260) }),
      (error) => error instanceof ConflictError && /no questions/.test(error.message)
    );
    db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(inMinutes(-1), sitting.id);
    assert.throws(() => startAttempt(db, "anna", test.id), (error) => error instanceof ConflictError && /no questions/.test(error.message));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attempt").get().n, 0, "no attempt was written");
    updateTest(db, test.id, { questionIds: [ids[1], ids[2]] });
    const { attemptId } = startAttempt(db, "anna", test.id);
    assert.equal(writingView(db, attemptRow(db, attemptId)).questions.length, 2);
  });

  test("an admin removes a copy whose pool question has been deleted", () => {
    const { db, test, ids } = written();
    deleteQuestion(db, ids[1], { tests: 0 });
    const orphan = db.prepare("SELECT id FROM test_question WHERE test_id = ? AND question_id IS NULL").get(test.id).id;
    const after = removeWrittenQuestion(db, test.id, orphan, scoreAttempt);
    assert.deepEqual(after.questions.map((q) => q.questionId), [ids[0], ids[2]]);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });

  test("an image only a deleted test's snapshot showed goes with the test", () => {
    const { db, test, ids } = written();
    const image = db.prepare("SELECT id FROM image WHERE question_id = ?").get(ids[0]).id;
    deleteQuestion(db, ids[0], { tests: 0 });
    assert.ok(db.prepare("SELECT 1 FROM image WHERE id = ?").get(image), "kept while the test shows it");
    deleteTest(db, test.id, { admin: true });
    assert.equal(db.prepare("SELECT 1 FROM image WHERE id = ?").get(image), undefined);
  });

  test("a question a closed year's test holds is deleted, and the closed year's test stays as it was", () => {
    const { db, year, test, ids } = written();
    const before = withoutPoolIds(getTest(db, test.id));
    db.prepare("UPDATE school_year SET closed_at = ? WHERE id = ?").run(new Date().toISOString(), year.id);
    deleteQuestion(db, ids[2], { tests: 0 });
    assert.deepEqual(withoutPoolIds({ ...getTest(db, test.id), course: before.course, discard: before.discard }), before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question_usage WHERE question_id = ?").get(ids[2]).n, 0);
    assert.throws(() => db.prepare("UPDATE test_question SET text_en = 'x' WHERE test_id = ?").run(test.id), /school year closed/, "anything else is still refused");
    assert.throws(() => db.prepare("UPDATE test_question SET question_id = NULL WHERE question_id = ?").run(ids[0]), /school year closed/, "and so is letting go of a question that still exists");
  });
});

// ------------------------------------------------------- in the gradebook

describe("online tests in the gradebook", () => {
  /** A sitting written straight into the database, so the dates need not lie in the future. */
  function sittingAt(db, testId, opensAt, closesAt, participants, makeup = 0) {
    const id = Number(
      db
        .prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, makeup, created_at) VALUES (?, ?, ?, 900, ?, 'x')")
        .run(testId, opensAt, closesAt, makeup).lastInsertRowid
    );
    for (const username of participants) db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, ?)").run(id, username);
    return id;
  }

  /** Writes `username`'s attempt at `at`, answering the first `right` questions correctly, and submits it. */
  function write(db, testId, username, at, right) {
    const { attemptId } = startAttempt(db, username, testId, at);
    const row = () => db.prepare("SELECT * FROM attempt WHERE id = ?").get(attemptId);
    const correct = correctTokens(db, attemptId);
    for (let n = 1; n <= right; n += 1) saveAnswer(db, row(), n, correct[n], at);
    return submitAttempt(db, row(), at);
  }

  test("a course without online tests computes exactly as before", () => {
    const { db, course, klass, ids } = seeded();
    const column = createColumn(db, course.id, { kind: "test", name: "Paper", date: "2026-11-03", maxPoints: 20 });
    setResult(db, column.id, "anna", { points: 15 });
    const before = { ws: courseOverview(db, course.id, "ws"), ss: courseOverview(db, course.id, "ss"), own: resultsOf(db, "anna", { today: "2026-11-10" }) };
    createTest(db, course.id, { name: "Only assembled", questionIds: [ids[0]] });
    const other = createCourse(db, klass.id, { subject: "DBI" });
    const written = createTest(db, other.id, { name: "Elsewhere", questionIds: [ids[0]] });
    sittingAt(db, written.id, "2026-12-01T08:00:00Z", "2026-12-01T09:00:00Z", ["anna"]);
    write(db, written.id, "anna", "2026-12-01T08:05:00Z", 1);
    assert.deepEqual(
      { ws: courseOverview(db, course.id, "ws"), ss: courseOverview(db, course.id, "ss"), own: resultsOf(db, "anna", { today: "2026-11-10" }).courses.find((c) => c.id === course.id) },
      { ...before, own: before.own.courses.find((c) => c.id === course.id) }
    );
  });

  test("a written test is a read-only column of its first sitting's date, with points out of its questions", () => {
    const { db, course, klass, ids } = seeded();
    addToRoster(db, klass.id, { username: "carla" });
    const test = createTest(db, course.id, { name: "HTTP caching", questionIds: ids });
    sittingAt(db, test.id, "2026-12-01T08:00:00Z", "2026-12-01T09:00:00Z", ["anna", "ben", "carla"]);
    // A make-up in the summer semester, for ben.
    sittingAt(db, test.id, "2027-03-01T08:00:00Z", "2027-03-01T09:00:00Z", ["ben"], 1);
    write(db, test.id, "anna", "2026-12-01T08:05:00Z", 2);
    write(db, test.id, "ben", "2027-03-01T08:05:00Z", 3);

    const winter = courseOverview(db, course.id, "ws");
    assert.deepEqual(winter.columns.map((c) => [c.id, c.kind, c.category, c.name, c.date, c.maxPoints, c.readOnly, c.testId]), [
      [`test-${test.id}`, "online", "onlineTests", "HTTP caching", "2026-12-01", 3, true, test.id],
    ]);
    const row = (username) => winter.students.find((r) => r.username === username);
    assert.deepEqual(row("anna").results[`test-${test.id}`], { value: 2 / 3, points: 2 });
    assert.deepEqual(row("ben").results[`test-${test.id}`], { value: 1, points: 3 }, "the make-up counts in the first sitting's semester");
    assert.equal(row("carla").results[`test-${test.id}`], undefined, "absent, and no zero");
    assert.equal(row("carla").categories.onlineTests, undefined, "her category is computed without it");
    assert.equal(row("anna").categories.onlineTests.fraction, 2 / 3);
    assert.deepEqual(courseOverview(db, course.id, "ss").columns, [], "nothing in the summer semester");

    const own = resultsOf(db, "ben", { today: "2027-03-02" }).courses.find((c) => c.id === course.id);
    assert.deepEqual(own.entries.map((e) => [e.name, e.date, e.points, e.maxPoints, e.category]), [["HTTP caching", "2026-12-01", 3, 3, "onlineTests"]]);
  });
});

describe("shortening a browser string", () => {
  const cases = [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox 131 · Windows"],
    ["Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0", "Firefox 132 · Linux"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Chrome 130 · Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68", "Edge 130 · Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", "Safari 18 · macOS"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari 18 · iOS"],
    ["Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1", "Safari 17 · iPadOS"],
    ["Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36", "Samsung Internet 26 · Android"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36", "Chrome 130 · Android"],
    ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Chrome 130 · ChromeOS"],
  ];
  for (const [agent, short] of cases) {
    test(short, () => {
      assert.deepEqual(browserLabel(agent), { short, os: short.split(" · ")[1], full: agent });
    });
  }

  test("an unknown string keeps its system and leaves the name to the view; an empty one names nothing", () => {
    assert.deepEqual(browserLabel("Mozilla/5.0 (X11; Linux x86_64) SomeKiosk/3"), { short: null, os: "Linux", full: "Mozilla/5.0 (X11; Linux x86_64) SomeKiosk/3" });
    assert.deepEqual(browserLabel("curl/8.4.0"), { short: null, os: null, full: "curl/8.4.0" });
    assert.deepEqual(browserLabel(""), { short: null, os: null, full: null });
    assert.deepEqual(browserLabel(null), { short: null, os: null, full: null });
    assert.deepEqual(parseUserAgent(undefined), { browser: null, version: null, os: null });
  });
});

// ------------------------------------------------------- the attempt review

describe("the review of an attempt", () => {
  /** Anna and Ben write `running()`'s test; Anna answers question `n` of hers as `choose(correctTokens, allTokens)` says. */
  function reviewed(options) {
    const seed = running(options);
    const anna = startAttempt(seed.db, "anna", seed.test.id).attemptId;
    for (const [n, tokens] of Object.entries(correctTokens(seed.db, anna))) saveAnswer(seed.db, attemptRow(seed.db, anna), Number(n), tokens);
    submitAttempt(seed.db, attemptRow(seed.db, anna));
    return { ...seed, anna };
  }
  const afterWindow = (sitting) => new Date(Date.parse(sitting.closesAt) + 1000).toISOString();

  test("the score is the sum of the per-question rule, which scoreAttempt and the review share", () => {
    const { db, anna } = reviewed();
    const scores = questionScores(db, anna);
    assert.equal(scores.size, 3);
    assert.deepEqual([...scores.values()], [1, 1, 1]);
    assert.equal(scoreAttempt(db, anna), attemptRow(db, anna).score);
  });

  test("a student may review once the attempt's own sitting is over, and not before", () => {
    const { db, test, sitting, anna } = reviewed();
    const row = () => attemptRow(db, anna);
    assert.equal(reviewOpen(db, row(), new Date().toISOString()), false, "submitted early, window still open");
    assert.equal(reviewOpen(db, row(), afterWindow(sitting)), true, "window closed");

    extendStartWindow(db, sitting.id, { minutes: 10 });
    assert.equal(reviewOpen(db, row(), afterWindow(sitting)), false, "extended: not until the new end");
    const closes = shift(sitting.closesAt, 10);
    assert.equal(reviewOpen(db, row(), shift(closes, 0.02)), true);

    // A classmate starts a minute before the start window closes: 15 minutes past it, as at 10:15 and 10:30.
    const ben = startAttempt(db, "ben", test.id, shift(closes, -1)).attemptId;
    assert.equal(reviewOpen(db, attemptRow(db, ben), shift(closes, 20)), false, "an attempt not submitted is never open");
    assert.equal(reviewOpen(db, row(), shift(closes, 10)), false, "a classmate is still writing");
    assert.equal(reviewOpen(db, row(), shift(closes, 14)), true, "the classmate's time ran out");

    endSitting(db, sitting.id);
    assert.equal(reviewOpen(db, row(), new Date(Date.now() + 1000).toISOString()), true, "ended by the teacher");
  });

  test("a make-up attempt follows its own sitting, and the first sitting's are open while it is ahead", () => {
    const { db, test, sitting, anna } = reviewed();
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(120), closesAt: inMinutes(170), durationMinutes: 15 });
    const ben = startAttempt(db, "ben", test.id, inMinutes(125)).attemptId;
    submitAttempt(db, attemptRow(db, ben), inMinutes(126));
    const between = inMinutes(130);
    assert.ok(between > afterWindow(sitting));
    assert.equal(reviewOpen(db, attemptRow(db, anna), between), true, "the first sitting is over");
    assert.equal(reviewOpen(db, attemptRow(db, ben), between), false, "the make-up still runs");
    assert.equal(reviewOpen(db, attemptRow(db, ben), new Date(Date.parse(makeup.closesAt) + 1000).toISOString()), true);
  });

  test("the review shows every question and answer in the attempt's order, chosen and correct, and nothing to send back", () => {
    const { db, test } = running();
    const id = startAttempt(db, "anna", test.id).attemptId;
    const writing = writingView(db, attemptRow(db, id));
    const multi = writing.questions.find((q) => q.type === "multichoiceset");
    const correct = correctTokens(db, id)[multi.n];
    assert.equal(correct.length, 2);
    // Only the first of the two correct answers.
    saveAnswer(db, attemptRow(db, id), multi.n, [correct[0]]);
    submitAttempt(db, attemptRow(db, id));

    const review = reviewView(db, attemptRow(db, id));
    assert.deepEqual(Object.keys(review).sort(), ["attempt", "grade", "language", "name", "questionCount", "questions", "score", "weighted"]);
    assert.deepEqual([review.name, review.language, review.questionCount], ["T", "en", 3]);
    assert.deepEqual(review.questions.map((q) => [q.n, q.text]), writing.questions.map((q) => [q.n, q.text]), "the writing page's order");
    for (const [index, question] of review.questions.entries()) {
      assert.deepEqual(question.answers.map((a) => a.text), writing.questions[index].answers.map((a) => a.text), `answers of ${question.n} in order`);
      assert.deepEqual(Object.keys(question).sort(), ["answers", "n", "scored", "text", "type", "weight"]);
      for (const answer of question.answers) assert.deepEqual(Object.keys(answer).sort(), ["chosen", "correct", "text"], "no token, no id");
    }
    const reviewedMulti = review.questions[multi.n - 1];
    const textOf = (token) => multi.answers.find((a) => a.token === token).text;
    const byText = Object.fromEntries(reviewedMulti.answers.map((a) => [a.text, a]));
    assert.deepEqual(byText[textOf(correct[0])], { text: textOf(correct[0]), chosen: true, correct: true });
    assert.deepEqual(byText[textOf(correct[1])], { text: textOf(correct[1]), chosen: false, correct: true });
    assert.deepEqual(reviewedMulti.answers.filter((a) => !a.correct).map((a) => a.chosen), [false], "the wrong answer, not chosen");
    assert.equal(reviewedMulti.scored, false, "one correct answer missed");
    assert.equal(review.score, 0);
    assert.deepEqual(review.questions.map((q) => q.scored), [false, false, false]);
  });

  test("a question an admin removed is gone from the review, and the score stays the stored one", () => {
    const { db, test, anna } = reviewed();
    const multi = db.prepare("SELECT id FROM test_question WHERE test_id = ? AND type = 'multichoiceset'").get(test.id);
    const textOf = db.prepare("SELECT text_en FROM test_question WHERE id = ?").get(multi.id).text_en;
    removeWrittenQuestion(db, test.id, multi.id, scoreAttempt);
    const review = reviewView(db, attemptRow(db, anna));
    assert.deepEqual(review.questions.map((q) => q.n), [1, 2]);
    assert.ok(review.questions.every((q) => q.text !== textOf));
    assert.deepEqual([review.score, review.questionCount], [attemptRow(db, anna).score, attemptRow(db, anna).question_count]);
    assert.deepEqual([review.score, review.questionCount], [2, 2]);
  });

  test("a student's review is refused while the sitting runs, and a classmate's attempt is not found", () => {
    const { db, sitting, anna } = reviewed();
    assert.throws(
      () => studentReview(db, anna, "anna"),
      (error) => error instanceof ConflictError && error.key === "exam.errors.attempts.reviewNotYet"
    );
    assert.equal(studentReview(db, anna, "anna", afterWindow(sitting)).attempt, anna);
    assert.equal(studentReview(db, anna, "anna", new Date(Date.parse(sitting.closesAt) + 31 * 86400000).toISOString()).attempt, anna, "a month later");
    const notFound = (fn) => assert.throws(fn, (error) => error instanceof NotFoundError && error.key === "exam.errors.attempts.noAttempt");
    notFound(() => studentReview(db, anna, "ben", afterWindow(sitting)));
    notFound(() => studentReview(db, anna + 100, "ben", afterWindow(sitting)));
  });

  test("a teacher's lookup needs the course, the student and a submitted attempt", () => {
    const { db, klass, test, course, anna } = reviewed();
    assert.equal(courseAttempt(db, course.id, "ANNA", anna).id, anna, "before the sitting is over");
    const other = createCourse(db, klass.id, { subject: "DBI" });
    const ben = startAttempt(db, "ben", test.id).attemptId;
    for (const [courseId, username, id] of [[other.id, "anna", anna], [course.id, "ben", anna], [course.id, "ben", ben]]) {
      assert.throws(() => courseAttempt(db, courseId, username, id), NotFoundError, `${courseId} ${username} ${id}`);
    }
  });

  test("the images of a reviewed attempt are served to its student once the sitting is over", () => {
    const { db, test, sitting, ids } = running();
    const image = db.prepare("SELECT id FROM image WHERE question_id = ?").get(ids[0]).id;
    const { attemptId } = startAttempt(db, "anna", test.id);
    assert.equal(studentMaySeeImage(db, "anna", image), true, "while writing");
    submitAttempt(db, attemptRow(db, attemptId));
    assert.equal(studentMaySeeImage(db, "anna", image), false, "submitted early, the sitting still runs");
    assert.equal(studentMaySeeImage(db, "anna", image, afterWindow(sitting)), true, "the review is open");
    assert.equal(studentMaySeeImage(db, "ben", image, afterWindow(sitting)), false, "not for another student");
    startAttempt(db, "ben", test.id, shift(sitting.closesAt, -1));
    assert.equal(studentMaySeeImage(db, "anna", image, afterWindow(sitting)), false, "not while a classmate still writes");
    assert.equal(studentMaySeeImage(db, "anna", image, shift(sitting.closesAt, 14)), true, "the image follows the review");
  });

  test("an online entry names its attempt and whether its review is open", () => {
    const { db, course, sitting, anna } = reviewed();
    const own = () => resultsOf(db, "anna").courses.find((c) => c.id === course.id).entries.find((e) => e.kind === "online");
    assert.deepEqual([own().attemptId, own().reviewOpen], [anna, false]);
    assert.equal(studentRecord(db, course.id, "anna").entries.find((e) => e.kind === "online").attemptId, anna);
    endSitting(db, sitting.id);
    assert.equal(own().reviewOpen, true);
  });

  test("the review goes with the attempt: deleted by an admin or purged with a leaver", () => {
    const { db, course, sitting, anna } = reviewed();
    endSitting(db, sitting.id);
    deleteAttempt(db, anna);
    assert.throws(() => studentReview(db, anna, "anna"), NotFoundError);
    assert.equal(resultsOf(db, "anna").courses.find((c) => c.id === course.id).entries.length, 0);

    const again = reviewed();
    endSitting(again.db, again.sitting.id);
    const next = createYear(again.db, { name: "2027/28", startsOn: "2027-09-06", summerStartsOn: "2028-02-14", endsOn: "2028-07-07" });
    setCurrentYear(again.db, next.id);
    createClass(again.db, next.id, { name: "5bhif", students: [{ username: "ben" }] });
    const report = retentionReport(again.db, "2040-01-01", 2);
    assert.equal(report.students, 1, "anna has left");
    purgeLeavers(again.db, "2040-01-01", report, 2);
    assert.throws(() => studentReview(again.db, again.anna, "anna"), NotFoundError);
    assert.deepEqual(resultsOf(again.db, "anna").courses, [], "no entry left to link from");
  });

  test("the routes: the student's after the sitting only, the teacher's for teachers only", async () => {
    const dbPath = temporaryPath();
    const saved = { path: process.env.EXAM_DB_PATH, periods: process.env.SCHOOL_PERIODS, fetch: global.fetch };
    process.env.EXAM_DB_PATH = dbPath;
    delete process.env.SCHOOL_PERIODS;
    const started = await init({ startPage: () => "/index.html" });
    assert.equal(started.active, true);
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const seed = seeded(db);
    const test = createTest(db, seed.course.id, { name: "T", questionIds: seed.ids });
    const sitting = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-1), inMinutes(49), sitting.id);
    const anna = startAttempt(db, "anna", test.id).attemptId;
    submitAttempt(db, attemptRow(db, anna));

    // Who asks: `X-As` names the user, `X-Role` the role; the view preference is a teacher's view.
    let view = { vt: 1 };
    global.fetch = async () => ({ ok: true, json: async () => ({ attributes: { config: [JSON.stringify(view)] } }) });
    const app = express();
    app.use((req, res, next) => {
      const username = req.get("X-As");
      req.user = {
        name: username,
        preferred_username: username,
        accessToken: "access-token",
        accessTokenDecoded: { preferred_username: username },
        keycloakConfig: { "auth-server-url": "https://identity.example/", realm: "demo", resource: "safelearn" },
        rolesCalculated: JSON.stringify({ [req.get("X-Role")]: true }),
      };
      next();
    });
    app.use("/exam", started.router);
    const server = app.listen(0);
    try {
      const base = `http://127.0.0.1:${server.address().port}/exam/api`;
      const ask = (path, as, role) => saved.fetch(`${base}${path}`, { headers: { "X-As": as, "X-Role": role } });
      const own = `/attempts/${anna}/review`;
      const teachers = `/courses/${seed.course.id}/students/anna/attempts/${anna}`;

      assert.equal((await ask(own, "anna", "student")).status, 409, "inside the window");
      assert.equal((await ask(own, "ben", "student")).status, 404, "a classmate's attempt");
      assert.equal((await ask(`/attempts/${anna + 100}/review`, "ben", "student")).status, 404, "the same as a missing one");
      assert.equal((await ask(own, "tdent", "teacher")).status, 403, "a teacher");

      const teacher = await ask(teachers, "tdent", "teacher");
      assert.equal(teacher.status, 200, "the teacher before the sitting is over");
      assert.equal((await teacher.json()).questions.length, 3);
      assert.equal((await ask(teachers, "anna", "student")).status, 403, "a student at the teacher's address");
      assert.equal((await ask(`/courses/${seed.course.id}/students/ben/attempts/${anna}`, "tdent", "teacher")).status, 404, "another student");
      const other = createCourse(db, seed.klass.id, { subject: "DBI" });
      assert.equal((await ask(`/courses/${other.id}/students/anna/attempts/${anna}`, "tdent", "teacher")).status, 404, "another course");
      view = { vt: 0 };
      assert.equal((await ask(teachers, "tdent", "teacher")).status, 403, "a teacher in student view");
      view = { vt: 1 };

      const page = await saved.fetch(`${base.replace(/\/api$/, "")}/my/attempts/${anna}`, { headers: { "X-As": "anna", "X-Role": "student" } });
      assert.equal(page.status, 200, "the student's page");
      const html = await page.text();
      assert.match(html, new RegExp(`data-sl-embed="attempt-review" data-sl-attempt="${anna}"`));
      assert.match(html, /href="\/exam\/my"/, "a way back to the results");
      const teacherPage = await saved.fetch(`${base.replace(/\/api$/, "")}/courses/${seed.course.id}/students/anna/attempts/${anna}`, {
        headers: { "X-As": "tdent", "X-Role": "teacher" },
      });
      assert.equal(teacherPage.status, 200, "the teacher's page");
      assert.match(await teacherPage.text(), new RegExp(`data-sl-embed="attempt-review" data-sl-course="${seed.course.id}" data-sl-student="anna" data-sl-attempt="${anna}"`));

      endSitting(db, sitting.id);
      const after = await ask(own, "anna", "student");
      assert.equal(after.status, 200, "after the sitting");
      assert.deepEqual(await after.json(), reviewView(db, attemptRow(db, anna)));
    } finally {
      await new Promise((resolve) => server.close(resolve));
      global.fetch = saved.fetch;
      if (saved.path === undefined) delete process.env.EXAM_DB_PATH;
      else process.env.EXAM_DB_PATH = saved.path;
      if (saved.periods !== undefined) process.env.SCHOOL_PERIODS = saved.periods;
    }
  });
});
