/**
 * Online tests (`online-test`), unit by unit: the migration that adds them,
 * assembling a test from the pool with its snapshot, and changing or deleting
 * a test only until it is first written.
 *
 * No browser, no login, no server: every database lives in a temporary
 * directory removed after the check. The same behaviour against a running
 * instance is `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, test } from "node:test";

import { addToRoster, ConflictError, createClass, createCourse, createYear, ForbiddenError, InvalidInputError, removeFromRoster } from "../exam/classes.js";
import { migrate, openDatabase, readMigrations } from "../exam/db.js";
import { courseOverview, createColumn, readScale, resultsOf, setResult, studentRecord } from "../exam/gradebook.js";
import { entryCategory, proposal } from "../exam/grading.js";
import { getQuestion, listQuestions } from "../exam/pool.js";
import { NotFoundError } from "../exam/classes.js";
import { importPool } from "../exam/pool-import.js";
import {
  createSitting,
  createTest,
  deleteSitting,
  deleteTest,
  endSitting,
  extendSitting,
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
  recordFocus,
  releaseAttempt,
  saveAnswer,
  scoreAttempt,
  startAttempt,
  submitAttempt,
  writingView,
} from "../exam/attempts.js";
import { studentMaySeeImage } from "../exam/pool.js";
import { deleteQuestion, saveQuestion } from "../exam/pool-edit.js";
import { liveParticipant, liveSnapshot } from "../exam/live.js";
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
function seeded() {
  const db = freshDatabase();
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

describe("sittings", () => {
  test("the first is written by the whole roster, a make-up by the students chosen, with the first one's duration", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    const first = createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(110), durationMinutes: 15 });
    assert.deepEqual([first.makeup, first.participants, first.durationS], [false, ["anna", "ben"], 900]);
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(200), closesAt: inMinutes(260), durationMinutes: 15 }), /chosen/);
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(200), closesAt: inMinutes(260), durationMinutes: 40, participants: ["BEN"] });
    assert.deepEqual([makeup.makeup, makeup.participants, makeup.durationS], [true, ["ben"], 900], "a make-up keeps the duration");
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(300), closesAt: inMinutes(360), participants: ["carla"] }), /not on the class's roster/);
    assert.equal(getQuestion(db, ids[0]).usage[0].usedOn, viennaDate(first.opensAt), "the usage is dated by the first sitting");
  });

  test("an attempt's duration has to be shorter than the window, and the window has to end in the future", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "T", questionIds: [ids[0]] });
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(70), durationMinutes: 15 }), /shorter/);
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(70), durationMinutes: 10 }), /shorter/);
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(-60), closesAt: inMinutes(-10), durationMinutes: 10 }), /future/);
    assert.throws(() => createSitting(db, test.id, { opensAt: inMinutes(70), closesAt: inMinutes(60), durationMinutes: 5 }), InvalidInputError);
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
 * A test of all three pool questions with a sitting open now for 50 minutes,
 * attempts lasting 15. `at` is a moment inside the window.
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
  test("the deadline is the earlier of start plus duration and the window's end", () => {
    const { db, test } = running({ duration: 15, window: 50 });
    const now = new Date().toISOString();
    const anna = attemptRow(db, startAttempt(db, "anna", test.id, now).attemptId);
    assert.equal(Date.parse(anna.deadline) - Date.parse(now), 15 * 60000);
    const late = inMinutes(45);
    const ben = attemptRow(db, startAttempt(db, "ben", test.id, late).attemptId);
    assert.equal(ben.deadline, db.prepare("SELECT closes_at FROM sitting").get().closes_at, "started four minutes before the end");
  });

  test("one attempt per student and test, across all sittings, resumed and never restarted", () => {
    const { db, test } = running();
    const first = startAttempt(db, "anna", test.id);
    assert.equal(first.created, true);
    assert.ok(first.secret);
    assert.deepEqual(startAttempt(db, "anna", test.id), { attemptId: first.attemptId, created: false }, "a reload resumes");
    submitAttempt(db, attemptRow(db, first.attemptId));
    createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60), participants: ["anna"] });
    db.prepare("UPDATE sitting SET opens_at = ? WHERE makeup = 1").run(inMinutes(-1));
    assert.throws(() => startAttempt(db, "anna", test.id), /submitted/, "a make-up added by mistake starts nothing");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attempt").get().n, 1);
    assert.deepEqual(openTestsOf(db, "anna"), [], "and the test is not shown to her any more");
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
    submitAttempt(db, attemptRow(db, ben));

    const shares = correctShares(db, test.id);
    assert.equal(shares.submitted, 2);
    assert.deepEqual(
      questionIds.map((q) => shares.correct.get(q.id)),
      questionIds.map(() => 1),
      "each question was answered correctly by Anna only"
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

  test("extending moves the deadlines the window cut short, and not those that run their full duration", () => {
    const { db, test, sitting } = running({ duration: 10, window: 50 });
    const early = startAttempt(db, "anna", test.id, new Date().toISOString()).attemptId;
    // Started four minutes before the window closes: its deadline is the window's end.
    const lateStart = new Date(Date.parse(sitting.closesAt) - 4 * 60000).toISOString();
    const late = startAttempt(db, "ben", test.id, lateStart).attemptId;
    const before = attemptRow(db, early).deadline;
    assert.equal(attemptRow(db, late).deadline, sitting.closesAt);
    const extended = extendSitting(db, sitting.id, { minutes: 10 });
    assert.equal(Date.parse(extended.closesAt) - Date.parse(sitting.closesAt), 10 * 60000);
    assert.equal(attemptRow(db, early).deadline, before, "the full duration stays");
    assert.equal(Date.parse(attemptRow(db, late).deadline), Date.parse(lateStart) + 10 * 60000, "start plus the duration now");
    assert.equal(db.prepare("SELECT duration_s FROM sitting WHERE id = ?").get(sitting.id).duration_s, 600, "the duration is unchanged");
    for (const minutes of [4, 121, 7.5, "10"]) assert.throws(() => extendSitting(db, sitting.id, { minutes }), InvalidInputError, String(minutes));
  });

  test("both are refused before the sitting opens and after it closed", () => {
    const seed = seeded();
    const test = createTest(seed.db, seed.course.id, { name: "T", questionIds: seed.ids });
    const later = createSitting(seed.db, test.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), durationMinutes: 15 });
    assert.throws(() => endSitting(seed.db, later.id), ConflictError);
    assert.throws(() => extendSitting(seed.db, later.id, { minutes: 10 }), ConflictError);
    seed.db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-60), inMinutes(-1), later.id);
    assert.throws(() => endSitting(seed.db, later.id), ConflictError);
    assert.throws(() => extendSitting(seed.db, later.id, { minutes: 10 }), ConflictError);
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
    createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60), participants: ["ben"] });
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
    const { db, sitting } = running();
    assert.throws(() => rescheduleSitting(db, sitting.id, window), /Only a sitting that is over/);
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(60), inMinutes(120), sitting.id);
    assert.throws(() => rescheduleSitting(db, sitting.id, window), ConflictError);
    endSitting(db, sitting.id, inMinutes(90));
    assert.throws(() => rescheduleSitting(db, sitting.id, { opensAt: inMinutes(200), closesAt: inMinutes(210) }, {}, inMinutes(100)), /shorter/, "the stored duration");
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
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60), participants: ["anna"] });
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
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60), participants: ["ben"] });
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
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(5), closesAt: inMinutes(60), participants: ["ben"] });
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
      () => createSitting(db, test.id, { opensAt: inMinutes(200), closesAt: inMinutes(260), participants: ["anna"] }),
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
    assert.deepEqual(withoutPoolIds({ ...getTest(db, test.id), course: before.course }), before);
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
