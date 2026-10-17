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

import { addToRoster, ConflictError, createClass, createCourse, createYear, InvalidInputError } from "../exam/classes.js";
import { migrate, openDatabase, readMigrations } from "../exam/db.js";
import { courseOverview, createColumn, readScale, resultsOf, setResult, studentRecord } from "../exam/gradebook.js";
import { entryCategory, proposal } from "../exam/grading.js";
import { getQuestion, listQuestions } from "../exam/pool.js";
import { NotFoundError } from "../exam/classes.js";
import { importPool } from "../exam/pool-import.js";
import { createSitting, createTest, deleteSitting, deleteTest, getTest, listTests, updateSitting, updateTest, viennaDate } from "../exam/tests.js";
import {
  checkDevice,
  DeviceRefusedError,
  finalizeDue,
  openTestsOf,
  ownAttempt,
  recordFocus,
  releaseAttempt,
  saveAnswer,
  startAttempt,
  submitAttempt,
  writingView,
} from "../exam/attempts.js";
import { studentMaySeeImage } from "../exam/pool.js";

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
    const weights = { onlineTests: 40, manualTests: 30, participation: 15, homework: 15 };
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

    assert.deepEqual(migrate(db, dbPath), { from: 5, to: 6 });
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
  test("a course's tests, and a year's grouped by class and course", () => {
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
    assert.deepEqual(listTests(db, { classId: klass.id }).groups.length, 3, "a class names its school year");
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
