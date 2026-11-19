/**
 * Offline tests and their handouts (`offline-test`, `exam-handout`), unit by
 * unit: the migration that adds them, the test with its gradebook column, the
 * sitting started by a button, the attendance table and its effect on the
 * open tests, make-ups, the guards that keep an offline test away from every
 * question path, who is served a handout, which attachments that opens, and
 * the views the handout rendering fixes.
 *
 * No browser, no login, no server: every database lives in a temporary
 * directory, the corpus is a fixture scanned from another, and both are
 * removed after the check. The same behaviour against a running instance is
 * `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, afterEach, before, describe, test } from "node:test";

import { createClass, createCourse, createYear, updateCourse } from "../exam/classes.js";
import { migrate, openDatabase, readMigrations } from "../exam/db.js";
import { courseColumns, deleteColumn, setNote, setResult, updateColumn } from "../exam/gradebook.js";
import { importPool } from "../exam/pool-import.js";
import { listQuestions } from "../exam/pool.js";
import {
  createOfflineTest,
  createSitting,
  createTest,
  deleteSitting,
  deleteTest,
  endSitting,
  extendSitting,
  getSitting,
  countingGroups,
  getTest,
  listTests,
  rescheduleSitting,
  setAttendance,
  setTestVariables,
  startSitting,
  updateSitting,
  updateTest,
  variablesFor,
  viennaDate,
} from "../exam/tests.js";
import { init } from "../exam/index.js";
import express from "express";
import { nextOpenTestsChange, openTestsOf, previewView, startAttempt } from "../exam/attempts.js";
import { liveParticipant, liveSnapshot } from "../exam/live.js";
import { setTeacherNote } from "../exam/teacher-notes.js";
import { corpusFiles, handoutAttachmentCheck, handoutPath, hasSolution, servableHandout } from "../exam/handout.js";
import { Marked } from "marked";

import { fillVariables, preParse, scanFiles } from "../obsidian.js";
import { sanitizeHtml } from "../sanitize.js";
import { getPermissionContext, handoutViews } from "../permission-context.js";

const temporaryDirs = [];
const openDatabases = [];
const originalLog = console.log;
let corpus;

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-offline-"));
  temporaryDirs.push(dir);
  return path.join(dir, "exam.sqlite");
}

/** Writes `content` to `relative` inside the fixture corpus. */
function write(relative, content = "x") {
  const target = path.join(corpus, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** Scans the fixture corpus quietly. */
async function scan() {
  console.log = () => {};
  try {
    await scanFiles("md/", corpus);
  } finally {
    console.log = originalLog;
  }
}

const handoutA = [
  "@@@ teacher",
  "# Long test A",
  "Task text for everyone.",
  "![[diagram.png]]",
  "[[starter.zip]]",
  "@@@ #exam",
  "EXAM-VARIANT",
  "![[exam-only.png]]",
  "@@@",
  "@@@ #practice",
  "PRACTICE-VARIANT",
  "@@@",
  "@@@ #answer",
  "ANSWER-TEXT",
  "![[answer-only.png]]",
  "@@@",
  "@@@ teacher",
  "TEACHER-HINT",
  "![[hint.png]]",
  "@@@",
  "",
].join("\n");

const varA = "@@@ teacher\n#### Test - %%var CLASS%% - %%var DATE%% - Quarkus REST Basics\n\nAbgabe: %%var SUBMISSION_LINK%%\n\nPIN: %%var FRANKLYN_PIN%%\n";

before(async () => {
  corpus = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-offline-corpus-"));
  for (const file of ["POS/diagram.png", "POS/starter.zip", "POS/exam-only.png", "POS/answer-only.png", "POS/hint.png", "POS/b.png"]) write(file);
  write("POS/LT1-A.md", handoutA);
  write("POS/LT1-B.md", "@@@ teacher\n# Long test B\n![[b.png]]\n");
  write("POS/Open.md", "# Open to everyone\n");
  write("POS/Class.md", "@@@ 4bhif\n# For the class\n");
  write("POS/Other.md", "@@@ 5ahif\n# For another class\n");
  write("POS/Later.md", "# Another file\n");
  write("POS/Var-A.md", varA);
  write("POS/Var-B.md", "@@@ teacher\nPIN: %%var FRANKLYN_PIN%%\n\nAbgabe: %%var SUBMISSION_LINK_B%% `%%var CODE%%`\n");
  write("POS/Var-Auto.md", "@@@ teacher\n#### Test - %%var CLASS%% - %%var DATE%%\n%%var lower%% %% var: PIN %%\n");
  write("POS/ExamOnly.md", "@@@ teacher\n# Solutions in exam blocks\nTask.\n@@@ #exam\nSolution.\n@@@\n");
  write("POS/MentionOnly.md", "@@@ teacher\n# Notes\nDie Musterlösung steht in den `@@@ #exam`-Blöcken.\n\n```\n@@@ #answer\nx\n@@@\n```\n");
  write("POS/AnswerOnly.md", "@@@ teacher\n# Solutions in answer blocks\nTask.\n@@@ 4bhif, #answer\nSolution.\n@@@\n");
  await scan();
});

after(() => {
  fs.rmSync(corpus, { recursive: true, force: true });
});

/** A database with a school year, the class 4bhif with three students and the course POS. */
function seeded() {
  const { db } = openDatabase(temporaryPath());
  openDatabases.push(db);
  const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
  const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }, { username: "cara" }] });
  const course = createCourse(db, klass.id, { subject: "POS", language: "de" });
  return { db, year, klass, course };
}

const inMinutes = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();
const keyOf = (fn) => {
  try {
    fn();
  } catch (error) {
    return error.key ?? error.message;
  }
  return null;
};

/** A session as passport leaves it on `req`, without an account lookup. */
function session(username, groups) {
  return {
    protocol: "https",
    get: (header) => (header.toLowerCase() === "host" ? "learn.example" : undefined),
    originalUrl: "/exam/my/sittings/1/handout",
    query: {},
    headers: {},
    session: {},
    user: { name: username, preferred_username: username, rolesCalculated: JSON.stringify(groups) },
  };
}
const studentReq = (username) => session(username, { student: true, "4bhif": true });
const teacherReq = () => session("tea", { teacher: true });

/** An offline test with both handouts and a started sitting for the whole class. */
function running(db, course, options = {}) {
  const test = createOfflineTest(db, course.id, { name: "POS Langtest 1", durationMinutes: 100, gradebookKind: "test", handoutA: "POS/LT1-A.md", handoutB: "POS/LT1-B.md", ...options });
  const sitting = createSitting(db, test.id, { opensAt: inMinutes(30) });
  return { test, sitting };
}

describe("the migration to offline tests", () => {
  test("existing tests read as online, existing participants as present in group A, and nothing else changes", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 12));
    const pool = `<?xml version="1.0" encoding="UTF-8"?><quiz>
      <question type="category"><category><text>$course$/top/A</text></category></question>
      <question type="truefalse"><name><text>Q</text></name><questiontext format="html"><text>&lt;p&gt;s&lt;/p&gt;</text></questiontext>
      <answer fraction="100" format="moodle_auto_format"><text>true</text></answer><answer fraction="0" format="moodle_auto_format"><text>false</text></answer></question></quiz>`;
    importPool(db, pool, pool);
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
    const course = createCourse(db, klass.id, { subject: "WMC", language: "en" });
    db.prepare("INSERT INTO test (course_id, name, created_at, updated_at) VALUES (?, 'Old', 'x', 'x')").run(course.id);
    db.exec(`INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, created_at) VALUES (1, '2026-10-01T08:00:00.000Z', '2026-10-01T09:00:00.000Z', 600, 'x');
      INSERT INTO sitting_participant (sitting_id, username) VALUES (1, 'anna'), (1, 'ben');`);
    const rows = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all().map((row) => ({ ...row }));
    const before = Object.fromEntries(["test", "sitting", "sitting_participant", "assessment"].map((table) => [table, rows(table)]));

    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 13)), { from: 12, to: 13 });
    assert.deepEqual(
      rows("test"),
      before.test.map((row) => ({ ...row, kind: "online", duration_s: null, handout_a: null, handout_b: null, assessment_id: null }))
    );
    assert.deepEqual(rows("sitting"), before.sitting.map((row) => ({ ...row, started_at: null })));
    assert.deepEqual(rows("sitting_participant"), before.sitting_participant.map((row) => ({ ...row, present: 1, handout_group: "A" })));
    assert.deepEqual(rows("assessment"), before.assessment);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(() => db.prepare("UPDATE test SET handout_b = 'x.md' WHERE id = 1").run(), /CHECK/, "a second handout needs a first");
    assert.throws(() => db.prepare("UPDATE sitting_participant SET handout_group = 'C'").run(), /CHECK/);
  });

  test("to handout variables adds their table, and deleting a test removes its values", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 20));
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }] });
    const course = createCourse(db, klass.id, { subject: "POS", language: "de" });
    const offline = createOfflineTest(db, course.id, { name: "LT", durationMinutes: 50, gradebookKind: "test", handoutA: "POS/LT1-A.md" });
    const other = createOfflineTest(db, course.id, { name: "LT2", durationMinutes: 50, gradebookKind: "test", handoutA: "POS/LT1-A.md" });

    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 21)), { from: 20, to: 21 });
    const insert = db.prepare("INSERT INTO test_variable (test_id, name, value) VALUES (?, ?, ?)");
    insert.run(offline.id, "FRANKLYN_PIN", "4711");
    insert.run(other.id, "FRANKLYN_PIN", "1234");
    assert.throws(() => insert.run(offline.id, "pin", "x"), /CHECK/, "a name the syntax cannot write");
    assert.throws(() => insert.run(offline.id, "PIN-2", "x"), /CHECK/);
    assert.throws(() => insert.run(offline.id, "EMPTY", ""), /CHECK/, "an empty value is no row");
    deleteTest(db, offline.id);
    assert.deepEqual(db.prepare("SELECT test_id, name FROM test_variable").all().map((row) => ({ ...row })), [{ test_id: other.id, name: "FRANKLYN_PIN" }]);
  });
});

describe("an offline test", () => {
  test("is created with its column, listed beside online tests by kind, and scheduled without questions", () => {
    const { db, course } = seeded();
    const offline = createOfflineTest(db, course.id, { name: "POS Langtest 1", durationMinutes: 100, gradebookKind: "test" });
    assert.equal(offline.kind, "offline");
    assert.equal(offline.durationS, 6000);
    assert.equal(offline.gradebookKind, "test");
    assert.deepEqual(offline.questions, []);
    const column = courseColumns(db, course.id).find((candidate) => candidate.testId === offline.id);
    assert.equal(column.kind, "test");
    assert.equal(column.name, "POS Langtest 1");
    assert.equal(column.readOnly, undefined, "its fields are editable like any manual column's");
    assert.ok(!courseColumns(db, course.id).some((candidate) => candidate.kind === "online"), "it is no online column");

    const short = createOfflineTest(db, course.id, { name: "SWP Short", durationMinutes: 15, gradebookKind: "shorttest" });
    assert.equal(courseColumns(db, course.id).find((candidate) => candidate.testId === short.id).kind, "shorttest");
    const sitting = createSitting(db, short.id, { opensAt: inMinutes(30) });
    assert.equal(sitting.durationS, 900);
    assert.equal(Date.parse(sitting.closesAt) - Date.parse(sitting.opensAt), 900000);
    assert.deepEqual(sitting.participants, ["anna", "ben", "cara"]);
    const listed = listTests(db, { courseId: course.id }).groups[0].tests;
    assert.deepEqual(listed.map((t) => t.kind), ["offline", "offline"]);
  });

  test("refuses a name, a duration, a category and a handout it cannot take", () => {
    const { db, course } = seeded();
    const base = { name: "T", durationMinutes: 50, gradebookKind: "test" };
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { ...base, name: " " })), "exam.errors.tests.name");
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { ...base, durationMinutes: 0 })), "exam.errors.tests.durationMinutes");
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { ...base, gradebookKind: "homework" })), "exam.errors.tests.gradebookKind");
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { ...base, handoutA: "../secret.md" })), "exam.errors.handouts.path");
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { ...base, handoutA: "POS/diagram.png" })), "exam.errors.handouts.path");
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { ...base, handoutA: "POS/Missing.md" })), "exam.errors.handouts.notFound");
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { ...base, handoutB: "POS/LT1-B.md" })), "exam.errors.handouts.bWithoutA");
    assert.equal(handoutPath("md/POS/LT1-A.md"), "POS/LT1-A.md");
  });

  test("counts only in a category the course uses, and is not offered while it uses neither", () => {
    const { db, course } = seeded();
    const base = { name: "T", durationMinutes: 50 };
    const weighted = (manualTests, shortTests) =>
      updateCourse(db, course.id, { weights: { onlineTests: 40 - manualTests - shortTests + 40, manualTests, shortTests, presentations: 0, projects: 0, participation: 10, homework: 10 } });
    weighted(30, 0);
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { ...base, gradebookKind: "shorttest" })), "exam.errors.gradebook.categoryNotInUse");
    assert.equal(createOfflineTest(db, course.id, { ...base, gradebookKind: "test" }).gradebookKind, "test");
    assert.deepEqual(listTests(db, { courseId: course.id }).groups[0].offlineKinds, ["test"]);
    weighted(0, 0);
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { ...base, gradebookKind: "test" })), "exam.errors.gradebook.categoryNotInUse");
    assert.deepEqual(listTests(db, { courseId: course.id }).groups[0].offlineKinds, [], "no new offline test");
    weighted(10, 10);
    assert.deepEqual(listTests(db, { courseId: course.id }).groups[0].offlineKinds, ["test", "shorttest"]);
  });

  test("renaming renames its column; removing handout A makes B the only one", () => {
    const { db, course } = seeded();
    const { test: offline } = running(db, course);
    const renamed = updateTest(db, offline.id, { name: "POS Langtest 1 (neu)" });
    assert.equal(courseColumns(db, course.id).find((c) => c.testId === offline.id).name, "POS Langtest 1 (neu)");
    assert.deepEqual(renamed.handouts.map((h) => [h.group, h.path]), [["A", "POS/LT1-A.md"], ["B", "POS/LT1-B.md"]]);
    const shifted = updateTest(db, offline.id, { handoutA: null });
    assert.deepEqual(shifted.handouts.map((h) => [h.group, h.path]), [["A", "POS/LT1-B.md"]]);
    assert.equal(keyOf(() => updateTest(db, offline.id, { questionIds: [1] })), "exam.errors.tests.offlineNoQuestions");
  });

  test("is deleted with its column while the column holds no result, and refused once it does", () => {
    const { db, course } = seeded();
    const first = createOfflineTest(db, course.id, { name: "A", durationMinutes: 50, gradebookKind: "test" });
    const second = createOfflineTest(db, course.id, { name: "B", durationMinutes: 50, gradebookKind: "test" });
    const column = courseColumns(db, course.id).find((c) => c.testId === second.id);
    assert.equal(keyOf(() => deleteColumn(db, column.id)), "exam.errors.gradebook.columnOfTest", "the column goes with its test only");
    updateColumn(db, column.id, { maxPoints: 50 });
    setResult(db, column.id, "anna", { points: 42 });
    assert.equal(keyOf(() => deleteTest(db, second.id)), "exam.errors.tests.offlineHasResults");
    assert.equal(getTest(db, second.id).name, "B", "the test is unchanged");
    assert.ok(courseColumns(db, course.id).some((c) => c.id === column.id), "the column is unchanged");
    deleteTest(db, first.id);
    assert.ok(!courseColumns(db, course.id).some((c) => c.name === "A"), "an empty column goes with its test");
  });

  test("notes alone do not keep an offline test, and go with its column", () => {
    const { db, course } = seeded();
    const offline = createOfflineTest(db, course.id, { name: "A", durationMinutes: 50, gradebookKind: "test" });
    const column = courseColumns(db, course.id).find((c) => c.testId === offline.id);
    setNote(db, course.id, column.id, "anna", "Cheat sheet found");
    setNote(db, course.id, column.id, "ben", "Left early");
    assert.equal(courseColumns(db, course.id).find((c) => c.id === column.id).notes, 2);
    deleteTest(db, offline.id);
    assert.ok(!courseColumns(db, course.id).some((c) => c.id === column.id), "the column went with its test");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM result_note").get().n, 0, "and its notes with it");
  });

  test("keeps away from every question path", () => {
    const { db, course } = seeded();
    const { test: offline, sitting } = running(db, course);
    startSitting(db, sitting.id);
    assert.equal(keyOf(() => startAttempt(db, "anna", offline.id)), "exam.errors.attempts.offlineTest");
    assert.equal(keyOf(() => previewView(db, offline.id)), "exam.errors.attempts.offlineTest");
    assert.equal(keyOf(() => rescheduleSitting(db, sitting.id, {})), "exam.errors.tests.offlineNoReschedule");
    // An online test still needs questions to be scheduled.
    const ids = [];
    assert.equal(keyOf(() => createTest(db, course.id, { name: "Online", questionIds: ids })), "exam.errors.tests.oneQuestion");
  });
});

describe("an offline sitting", () => {
  test("does not open at its planned time, only when started, for the test's duration", () => {
    const { db, course } = seeded();
    const { sitting } = running(db, course);
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(inMinutes(-5), inMinutes(95), sitting.id);
    assert.equal(getSitting(db, sitting.id).state, "scheduled", "the planned time passed, nobody pressed start");
    assert.deepEqual(openTestsOf(db, "anna"), []);
    assert.equal(nextOpenTestsChange(db, "anna"), null, "no timer waits for a planned time");

    const at = new Date().toISOString();
    const started = startSitting(db, sitting.id, at);
    assert.equal(started.state, "open");
    assert.equal(started.startedAt, at);
    assert.equal(started.opensAt, at);
    assert.equal(Date.parse(started.closesAt) - Date.parse(at), 100 * 60000, "the window runs from the press for the duration");
    assert.equal(courseColumns(db, course.id).find((c) => c.name === "POS Langtest 1").date, viennaDate(at), "the column is dated by the start");
    assert.equal(keyOf(() => startSitting(db, sitting.id)), "exam.errors.tests.sittingStarted");
    assert.equal(keyOf(() => updateSitting(db, sitting.id, { opensAt: inMinutes(60) })), "exam.errors.tests.sittingStarted");
    assert.equal(keyOf(() => deleteSitting(db, sitting.id)), "exam.errors.tests.sittingRunning", "never while it runs");
    const [entry] = openTestsOf(db, "anna");
    assert.equal(entry.kind, "offline");
    assert.equal(entry.sittingId, sitting.id);
    assert.equal(entry.handout, "A");
    assert.equal(entry.attempt, null);
    assert.equal(nextOpenTestsChange(db, "anna"), started.closesAt);
  });

  test("is extended and ended only once started, for everyone on it", () => {
    const { db, course } = seeded();
    const { sitting } = running(db, course);
    assert.equal(keyOf(() => extendSitting(db, sitting.id, { minutes: 10 })), "exam.errors.tests.sittingNotOpen");
    assert.equal(keyOf(() => endSitting(db, sitting.id)), "exam.errors.tests.sittingNotOpen");
    // Started a minute back, so the end below cannot fall into the millisecond
    // the window opened in (`endSitting` refuses that, by design).
    const started = startSitting(db, sitting.id, inMinutes(-1));
    const extended = extendSitting(db, sitting.id, { minutes: 10 });
    assert.equal(Date.parse(extended.closesAt) - Date.parse(started.closesAt), 10 * 60000);
    const ended = endSitting(db, sitting.id);
    assert.equal(ended.state, "over");
    assert.deepEqual(openTestsOf(db, "anna"), [], "the window closed for everyone");
    deleteSitting(db, sitting.id);
    assert.equal(getTest(db, sitting.testId).sittings.length, 0, "once over it can go, in an emergency");
  });

  test("is not ended at the moment it opened, and stays open as it was", () => {
    const { db, course } = seeded();
    const { sitting } = running(db, course);
    const started = startSitting(db, sitting.id, inMinutes(-1));
    assert.equal(keyOf(() => endSitting(db, sitting.id, started.opensAt)), "exam.errors.tests.sittingEndBeforeOpen");
    const after = getSitting(db, sitting.id);
    assert.equal(after.state, "open", "a refused end leaves the sitting open");
    assert.equal(after.closesAt, started.closesAt, "and its window as it was");
  });

  test("is not started while a handout does not resolve, and the refusal names it", async () => {
    const { db, course } = seeded();
    const { test: offline, sitting } = running(db, course);
    fs.renameSync(path.join(corpus, "POS/LT1-B.md"), path.join(corpus, "POS/LT1-B-renamed.md"));
    await scan();
    try {
      assert.deepEqual(getTest(db, offline.id).handouts.map((h) => h.resolves), [true, false], "the old path shows unresolved");
      assert.throws(() => startSitting(db, sitting.id), (error) => error.key === "exam.errors.tests.handoutUnresolved" && error.params.group === "B");
      updateTest(db, offline.id, { handoutB: "POS/LT1-B-renamed.md" });
      assert.equal(startSitting(db, sitting.id).state, "open", "choosing the file again clears it");
    } finally {
      fs.renameSync(path.join(corpus, "POS/LT1-B-renamed.md"), path.join(corpus, "POS/LT1-B.md"));
      await scan();
    }
  });

  test("an online sitting has no start button", () => {
    const { db, course } = seeded();
    const xml = `<?xml version="1.0" encoding="UTF-8"?><quiz><question type="category"><category><text>$course$/top/A</text></category></question>
      <question type="truefalse"><name><text>Q</text></name><questiontext format="html"><text>&lt;p&gt;s&lt;/p&gt;</text></questiontext>
      <answer fraction="100" format="moodle_auto_format"><text>true</text></answer><answer fraction="0" format="moodle_auto_format"><text>false</text></answer></question></quiz>`;
    importPool(db, xml, xml);
    const online = createTest(db, course.id, { name: "Online", questionIds: listQuestions(db).map((q) => q.id) });
    const sitting = createSitting(db, online.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), durationMinutes: 15 });
    assert.equal(keyOf(() => startSitting(db, sitting.id)), "exam.errors.tests.onlineNoStart");
    assert.equal(keyOf(() => setAttendance(db, sitting.id, "anna", { present: false })), "exam.errors.tests.onlineNoAttendance");
  });
});

describe("the attendance table", () => {
  test("everyone starts present in group A; absence and group take effect on the open tests at once", () => {
    const { db, course } = seeded();
    const { sitting } = running(db, course);
    assert.deepEqual(
      liveSnapshot(db, sitting.id).participants.map((p) => [p.username, p.present, p.group]),
      [["anna", true, "A"], ["ben", true, "A"], ["cara", true, "A"]]
    );
    setAttendance(db, sitting.id, "cara", { present: false });
    setAttendance(db, sitting.id, "ben", { group: "B" });
    startSitting(db, sitting.id);
    assert.deepEqual(openTestsOf(db, "cara"), [], "an absent participant sees nothing");
    assert.equal(openTestsOf(db, "ben")[0].handout, "B");
    setAttendance(db, sitting.id, "cara", { present: true });
    assert.equal(openTestsOf(db, "cara")[0].handout, "A", "arriving late, without starting anything again");
    setAttendance(db, sitting.id, "ben", { group: "A" });
    assert.equal(openTestsOf(db, "ben")[0].handout, "A");
    const snapshot = liveSnapshot(db, sitting.id);
    assert.equal(snapshot.kind, "offline");
    assert.ok(snapshot.sitting.startedAt);
    assert.deepEqual(Object.keys(snapshot.participants[0]).sort(), ["familyName", "givenName", "group", "present", "teacherNote", "username"], "names and the teacher's note only");
    // The teacher's note is independent of presence and group (`offline-test`).
    setTeacherNote(db, snapshot.test.id, "ben", "Phone on the desk, taken away at 10:12");
    setAttendance(db, sitting.id, "ben", { present: false });
    setAttendance(db, sitting.id, "ben", { present: true, group: "B" });
    assert.equal(liveParticipant(db, sitting.id, "ben").teacherNote, "Phone on the desk, taken away at 10:12", "absent, present again and another group leave it");
  });

  test("refuses a non-participant, a group B without handout B, and values it cannot read", () => {
    const { db, course } = seeded();
    const { sitting } = running(db, course, { handoutB: null });
    assert.equal(keyOf(() => setAttendance(db, sitting.id, "zoe", { present: false })), "exam.errors.tests.notParticipant");
    assert.equal(keyOf(() => setAttendance(db, sitting.id, "anna", { group: "B" })), "exam.errors.tests.noHandoutB");
    assert.equal(keyOf(() => setAttendance(db, sitting.id, "anna", { group: "C" })), "exam.errors.tests.handoutGroup");
    assert.equal(keyOf(() => setAttendance(db, sitting.id, "anna", { present: "no" })), "exam.errors.tests.presentFlag");
  });

  test("changing a planned sitting's participants keeps the attendance of those who stay", () => {
    const { db, course } = seeded();
    const { sitting } = running(db, course);
    setAttendance(db, sitting.id, "ben", { present: false, group: "B" });
    updateSitting(db, sitting.id, { participants: ["ben", "cara"] });
    assert.deepEqual(
      liveSnapshot(db, sitting.id).participants.map((p) => [p.username, p.present, p.group]),
      [["ben", false, "B"], ["cara", true, "A"]]
    );
  });
});

describe("a make-up of an offline test", () => {
  test("is for the participants chosen, with the same duration and handouts, and its own start", () => {
    const { db, course } = seeded();
    const { test: offline, sitting } = running(db, course);
    for (const username of ["ben", "cara"]) setAttendance(db, sitting.id, username, { present: false });
    // Started a minute back, so the end below cannot fall into the millisecond
    // the window opened in (`endSitting` refuses that, by design).
    startSitting(db, sitting.id, inMinutes(-1));
    endSitting(db, sitting.id);
    assert.deepEqual(getSitting(db, sitting.id).absent, ["ben", "cara"]);
    assert.equal(keyOf(() => createSitting(db, offline.id, { opensAt: inMinutes(60) })), "exam.errors.tests.makeupParticipants");
    const makeup = createSitting(db, offline.id, { opensAt: inMinutes(60), participants: ["ben"] });
    assert.equal(makeup.makeup, true);
    assert.deepEqual(makeup.participants, ["ben"]);
    assert.equal(makeup.durationS, 6000);
    assert.equal(makeup.state, "scheduled");
    startSitting(db, makeup.id);
    assert.equal(openTestsOf(db, "ben")[0].sittingId, makeup.id);
    assert.deepEqual(openTestsOf(db, "cara"), [], "the third has no sitting left");
  });
});

describe("the group that counts for the factor A:B", () => {
  test("is the group of the latest started sitting a participant was present at, otherwise A", () => {
    const { db, course } = seeded();
    const { test: offline, sitting } = running(db, course);
    setAttendance(db, sitting.id, "ben", { present: false });
    setAttendance(db, sitting.id, "cara", { present: false });
    setAttendance(db, sitting.id, "anna", { group: "B" });
    assert.deepEqual([...countingGroups(db, course.id)], [], "a planned sitting has nobody present yet");
    startSitting(db, sitting.id, inMinutes(-1));
    endSitting(db, sitting.id);
    const makeup = createSitting(db, offline.id, { opensAt: inMinutes(60), participants: ["ben"] });
    setAttendance(db, makeup.id, "ben", { group: "B" });
    startSitting(db, makeup.id);
    const groups = countingGroups(db, course.id);
    assert.equal(groups.get(`${offline.id}/anna`), "B");
    assert.equal(groups.get(`${offline.id}/ben`), "B", "absent from the first sitting, in group B at the make-up");
    assert.equal(groups.has(`${offline.id}/cara`), false, "present in no sitting, so group A");
  });
});

describe("a handout", () => {
  test("is served to a present participant of their group, while the window is open, and to nobody else", () => {
    const { db, course } = seeded();
    const { sitting } = running(db, course);
    setAttendance(db, sitting.id, "ben", { group: "B" });
    setAttendance(db, sitting.id, "cara", { present: false });
    assert.equal(servableHandout(db, "anna", sitting.id), null, "before the start");
    startSitting(db, sitting.id);
    assert.equal(servableHandout(db, "anna", sitting.id).path, "POS/LT1-A.md");
    assert.equal(servableHandout(db, "ben", sitting.id).path, "POS/LT1-B.md", "the other group's file");
    assert.equal(servableHandout(db, "cara", sitting.id), null, "absent");
    assert.equal(servableHandout(db, "zoe", sitting.id), null, "not a participant");
    assert.equal(servableHandout(db, "anna", sitting.id + 1), null, "another sitting");
    const closes = getSitting(db, sitting.id).closesAt;
    assert.equal(servableHandout(db, "anna", sitting.id, new Date(Date.parse(closes) + 1000).toISOString()), null, "one second after the window");
  });

  test("the picker lists every Markdown file and flags those the class can read already", () => {
    const flagged = Object.fromEntries(corpusFiles("4BHIF").map((file) => [file.path, file.classReadable]));
    assert.equal(flagged["POS/Open.md"], true, "no directive");
    assert.equal(flagged["POS/Class.md"], true, "the class's own role");
    assert.equal(flagged["POS/Other.md"], false);
    assert.equal(flagged["POS/LT1-A.md"], false);
    assert.ok(corpusFiles("4bhif").every((file) => file.path.endsWith(".md") && typeof file.folder === "string"));
  });

  test("renders the practice variant and hides exam, answers and teacher blocks, whatever the stored views; the solution shows exam and answers", async () => {
    const markdown = handoutA.split("\n").slice(1).join("\n");
    const participant = async (preferences) => {
      const req = studentReq("anna");
      if (preferences) {
        (await getPermissionContext(req)).applyWrittenAttribute("config", JSON.stringify(preferences));
        assert.match(await preParse(markdown, req), /ANSWER-TEXT/, "without the override the stored answer view shows the answers");
      }
      req[handoutViews] = { exam: false, answer: false };
      return preParse(markdown, req, { embedDefaults: true });
    };
    for (const preferences of [null, { ve: 1, va: 1 }]) {
      const shown = await participant(preferences);
      assert.match(shown, /PRACTICE-VARIANT/, JSON.stringify(preferences));
      assert.doesNotMatch(shown, /EXAM-VARIANT|ANSWER-TEXT|TEACHER-HINT/, JSON.stringify(preferences));
    }

    // The preview: a teacher with both views on is shown what the participant is.
    const preview = teacherReq();
    (await getPermissionContext(preview)).applyWrittenAttribute("config", JSON.stringify({ ve: 1, va: 1, vt: 1 }));
    preview[handoutViews] = { exam: false, answer: false };
    assert.equal(await preParse(markdown, preview, { embedDefaults: true }), await participant(null));

    const deck = teacherReq();
    deck[handoutViews] = { exam: true, answer: true };
    const solution = await preParse(markdown, deck, { embedDefaults: true });
    assert.match(solution, /EXAM-VARIANT/);
    assert.match(solution, /ANSWER-TEXT/);
    assert.doesNotMatch(solution, /PRACTICE-VARIANT|TEACHER-HINT/, "rendered as a student, the teacher's own blocks hidden");
  });

  test("an override without an exam field hides the exam variant", async () => {
    const markdown = handoutA.split("\n").slice(1).join("\n");
    const req = teacherReq();
    (await getPermissionContext(req)).applyWrittenAttribute("config", JSON.stringify({ ve: 1, vt: 1 }));
    assert.match(await preParse(markdown, req), /EXAM-VARIANT/, "without the override this teacher sees the exam variant");
    req[handoutViews] = { answer: true };
    const shown = await preParse(markdown, req, { embedDefaults: true });
    assert.match(shown, /PRACTICE-VARIANT/);
    assert.doesNotMatch(shown, /EXAM-VARIANT/);
  });

  test("offers a solution for #exam or #answer blocks, and none for neither", () => {
    assert.equal(hasSolution("POS/LT1-A.md"), true, "both");
    assert.equal(hasSolution("POS/ExamOnly.md"), true, "only #exam blocks");
    assert.equal(hasSolution("POS/AnswerOnly.md"), true, "only #answer blocks");
    assert.equal(hasSolution("POS/LT1-B.md"), false, "neither");
    assert.equal(hasSolution("POS/MentionOnly.md"), false, "named only in running text and in code");
    assert.equal(hasSolution("POS/Missing.md"), false, "does not resolve");
  });

  test("its views are not reachable by query, header or preference, and do not leak to another page", async () => {
    const markdown = handoutA.split("\n").slice(1).join("\n");
    const forged = studentReq("anna");
    forged.query = { handoutViews: "1", ve: "1", answer: "1" };
    forged.headers = { "x-handout-views": "1" };
    forged.body = { handoutViews: { exam: true, answer: true } };
    forged.handoutViews = { exam: true, answer: true };
    const page = await preParse(markdown, forged);
    assert.match(page, /PRACTICE-VARIANT/);
    assert.doesNotMatch(page, /EXAM-VARIANT|ANSWER-TEXT/);
    // The same session, after a handout check ran on its request, sees the practice variant again.
    const { db, course } = seeded();
    const { sitting } = running(db, course);
    startSitting(db, sitting.id);
    const req = studentReq("anna");
    await handoutAttachmentCheck(db, req, "POS/diagram.png", { username: "anna", teacher: false });
    assert.equal(req[handoutViews], undefined, "the views are gone after the check");
    assert.match(await preParse(markdown, req), /PRACTICE-VARIANT/);
  });
  test("a variable's value is rendered and sanitized with the rest of the file", async () => {
    // The steps of `renderHandout` after the directive: fill, pre-parse, Markdown, sanitizer.
    const req = studentReq("anna");
    req[handoutViews] = { exam: false, answer: false };
    const markdown = "Abgabe: %%var LINK%%\n\nPIN: %%var PIN%% %%note%%\n\nRaum: %%var ROOM%%\n";
    const filled = fillVariables(markdown, { LINK: "https://example.org", PIN: "<script>alert(1)</script>**4711**" });
    const html = sanitizeHtml(await new Marked({ gfm: true }).parse(await preParse(filled, req, { embedDefaults: true })));
    assert.match(html, /<a href="https:\/\/example\.org">https:\/\/example\.org<\/a>/, "a bare URL becomes a link");
    assert.match(html, /<strong>4711<\/strong>/, "inline Markdown in a value works");
    assert.doesNotMatch(html, /<script|alert/, "a script in a value is sanitized away");
    assert.match(html, /Raum: ‹ROOM›/, "a variable without a value");
    assert.doesNotMatch(html, /note/, "other comments are cut");
  });
});

describe("a handout's attachments", () => {
  test("are served while the handout is, under its views, and stop at once with the window, an absence or a regrouping", async () => {
    const { db, course } = seeded();
    const { sitting } = running(db, course);
    const check = (username, attachment) => handoutAttachmentCheck(db, studentReq(username), attachment, { username, teacher: false });
    assert.equal(await check("anna", "POS/diagram.png"), false, "before the start");
    // Started a minute back, so the end below cannot fall into the millisecond
    // the window opened in (`endSitting` refuses that, by design).
    startSitting(db, sitting.id, inMinutes(-1));
    assert.equal(await check("anna", "POS/diagram.png"), true, "the image it embeds");
    assert.equal(await check("anna", "POS/starter.zip"), true, "the archive it links");
    assert.equal(await check("anna", "POS/exam-only.png"), false, "inside the exam variant");
    assert.equal(await check("anna", "POS/answer-only.png"), false, "inside the answers");
    assert.equal(await check("anna", "POS/hint.png"), false, "inside a teacher block");
    assert.equal(await check("anna", "POS/b.png"), false, "only the other group's handout references it");
    assert.equal(await check("zoe", "POS/diagram.png"), false, "not a participant");

    setAttendance(db, sitting.id, "anna", { group: "B" });
    assert.equal(await check("anna", "POS/diagram.png"), false, "moved to the other group");
    assert.equal(await check("anna", "POS/b.png"), true);
    setAttendance(db, sitting.id, "anna", { group: "A", present: false });
    assert.equal(await check("anna", "POS/diagram.png"), false, "marked absent");
    setAttendance(db, sitting.id, "anna", { present: true });
    assert.equal(await check("anna", "POS/diagram.png"), true);
    endSitting(db, sitting.id);
    assert.equal(await check("anna", "POS/diagram.png"), false, "right after the window closed");
  });

  test("a teacher's decks are served the exam variant's and the answers' attachments, never the teacher blocks'", async () => {
    const { db, course } = seeded();
    running(db, course);
    const check = (attachment) => handoutAttachmentCheck(db, teacherReq(), attachment, { username: "tea", teacher: true });
    assert.equal(await check("POS/answer-only.png"), true);
    assert.equal(await check("POS/exam-only.png"), true);
    assert.equal(await check("POS/hint.png"), false, "rendered as a student");
  });
});

describe("a handout's variables", () => {
  /** An offline test with the variable handouts, and a sitting planned for `opensAt`. */
  function withVariables(db, course, options = {}) {
    const test = createOfflineTest(db, course.id, { name: "Quarkus", durationMinutes: 50, gradebookKind: "test", handoutA: "POS/Var-A.md", handoutB: "POS/Var-B.md", ...options });
    return test;
  }
  const names = (test) => test.variables.map((variable) => variable.name);
  const stored = (db) => db.prepare("SELECT test_id, name, value FROM test_variable ORDER BY test_id, name").all().map((row) => ({ ...row }));

  test("are the union of A and B in the order they first appear, with CLASS and DATE filled by the module", () => {
    const { db, course } = seeded();
    const test = withVariables(db, course);
    assert.deepEqual(names(test), ["CLASS", "DATE", "SUBMISSION_LINK", "FRANKLYN_PIN", "SUBMISSION_LINK_B"]);
    assert.deepEqual(test.variables[0], { name: "CLASS", value: "4BHIF", auto: true, missing: false });
    assert.deepEqual(test.variables[1], { name: "DATE", value: null, auto: true, missing: false }, "without a sitting no date, and never missing");
    assert.deepEqual(test.variables[3], { name: "FRANKLYN_PIN", value: null, auto: false, missing: true });
    const set = setTestVariables(db, test.id, { FRANKLYN_PIN: " 4711 " });
    assert.deepEqual(set.variables[3], { name: "FRANKLYN_PIN", value: "4711", auto: false, missing: false });
    assert.deepEqual(variablesFor(db, test.id), { CLASS: "4BHIF", FRANKLYN_PIN: "4711" });
    assert.deepEqual(names(withVariables(db, course, { handoutB: null })), ["CLASS", "DATE", "SUBMISSION_LINK", "FRANKLYN_PIN"]);
    assert.deepEqual(names(withVariables(db, course, { handoutA: "POS/Var-Auto.md", handoutB: null })), ["CLASS", "DATE"], "a lower-case name and other comments are none");
    assert.deepEqual(createOfflineTest(db, course.id, { name: "Plain", durationMinutes: 50, gradebookKind: "test", handoutA: "POS/LT1-A.md" }).variables, []);
  });

  test("DATE is the participant's sitting, started or planned; the preview's is the first started sitting", () => {
    const { db, course } = seeded();
    const test = withVariables(db, course);
    const first = createSitting(db, test.id, { opensAt: "2027-01-20T08:00:00.000Z" });
    assert.equal(variablesFor(db, test.id, first.id).DATE, "20.01.2027", "the planned day");
    assert.equal(variablesFor(db, test.id).DATE, "20.01.2027", "the preview before any start");
    setTestVariables(db, test.id, { SUBMISSION_LINK: "a", FRANKLYN_PIN: "b", SUBMISSION_LINK_B: "c" });
    startSitting(db, first.id, "2026-11-14T08:00:00.000Z");
    assert.equal(variablesFor(db, test.id, first.id).DATE, "14.11.2026", "the started day");
    const makeup = createSitting(db, test.id, { opensAt: "2027-01-27T08:00:00.000Z", participants: ["anna"] });
    assert.equal(variablesFor(db, test.id, makeup.id).DATE, "27.01.2027");
    startSitting(db, makeup.id, "2026-11-21T08:00:00.000Z");
    assert.equal(variablesFor(db, test.id, makeup.id).DATE, "21.11.2026", "the make-up's own day");
    assert.equal(variablesFor(db, test.id).DATE, "14.11.2026", "the preview and the deck: the first started sitting");
    assert.equal(getTest(db, test.id).variables[1].value, "14.11.2026");
    assert.equal(getSitting(db, makeup.id).variables[1].value, "21.11.2026");
  });

  test("a value whose variable leaves both files is kept, not shown, and comes back with it", () => {
    const { db, course } = seeded();
    const test = withVariables(db, course, { handoutB: null });
    setTestVariables(db, test.id, { FRANKLYN_PIN: "4711" });
    try {
      write("POS/Var-A.md", varA.replace("PIN: %%var FRANKLYN_PIN%%\n", "%%var ROOM%%\n"));
      const changed = getTest(db, test.id);
      assert.deepEqual(names(changed), ["CLASS", "DATE", "SUBMISSION_LINK", "ROOM"], "an added variable appears, a removed one goes");
      assert.equal(changed.variables[3].missing, true);
      assert.deepEqual(variablesFor(db, test.id), { CLASS: "4BHIF" });
      assert.deepEqual(stored(db), [{ test_id: test.id, name: "FRANKLYN_PIN", value: "4711" }]);
    } finally {
      write("POS/Var-A.md", varA);
    }
    assert.equal(getTest(db, test.id).variables.find((variable) => variable.name === "FRANKLYN_PIN").value, "4711");
  });

  test("an empty value deletes it; every refusal leaves the stored values as they were", () => {
    const { db, course } = seeded();
    const test = withVariables(db, course);
    setTestVariables(db, test.id, { FRANKLYN_PIN: "4711", SUBMISSION_LINK: "https://classroom.github.com/a/abc123" });
    const before = stored(db);
    for (const [values, key] of [
      [{ CLASS: "5AHIF" }, "exam.errors.tests.variableAuto"],
      [{ FRANKLYN_PIN: "1", DATE: "1.1.2027" }, "exam.errors.tests.variableAuto"],
      [{ FRANKLYN_PIN: "1", pin: "x" }, "exam.errors.tests.variableName"],
      [{ "PIN-2": "x" }, "exam.errors.tests.variableName"],
      [{ FRANKLYN_PIN: "47\n11" }, "exam.errors.tests.variableValue"],
      [{ FRANKLYN_PIN: "47\r11" }, "exam.errors.tests.variableValue"],
      [{ FRANKLYN_PIN: "a %%note%%" }, "exam.errors.tests.variableValue"],
      [{ FRANKLYN_PIN: "@@@ teacher" }, "exam.errors.tests.variableValue"],
      [{ FRANKLYN_PIN: "x".repeat(501) }, "exam.errors.tests.variableValue"],
      [{ FRANKLYN_PIN: 4711 }, "exam.errors.tests.variableValue"],
      [["FRANKLYN_PIN"], "exam.errors.tests.variableValue"],
      [undefined, "exam.errors.tests.variableValue"],
    ]) {
      assert.equal(keyOf(() => setTestVariables(db, test.id, values)), key, JSON.stringify(values));
      assert.deepEqual(stored(db), before, JSON.stringify(values));
    }
    setTestVariables(db, test.id, { FRANKLYN_PIN: "x".repeat(500) });
    setTestVariables(db, test.id, { FRANKLYN_PIN: "", SUBMISSION_LINK: null });
    assert.deepEqual(stored(db), [], "an empty value is no value");
    const online = Number(db.prepare("INSERT INTO test (course_id, name, created_at, updated_at) VALUES (?, 'Online', 'x', 'x')").run(course.id).lastInsertRowid);
    assert.equal(keyOf(() => setTestVariables(db, online, { PIN: "1" })), "exam.errors.tests.onlineNoVariables");
  });

  test("starting is refused while a variable has no value, and names them; CLASS and DATE need nothing", () => {
    const { db, course } = seeded();
    const test = withVariables(db, course);
    const sitting = createSitting(db, test.id, { opensAt: inMinutes(30) });
    assert.throws(
      () => startSitting(db, sitting.id),
      (error) => error.key === "exam.errors.tests.handoutVariablesMissing" && error.params.names === "SUBMISSION_LINK, FRANKLYN_PIN, SUBMISSION_LINK_B"
    );
    assert.deepEqual(getSitting(db, sitting.id).variables.filter((variable) => variable.missing).map((variable) => variable.name), ["SUBMISSION_LINK", "FRANKLYN_PIN", "SUBMISSION_LINK_B"]);
    setTestVariables(db, test.id, { SUBMISSION_LINK: "a", FRANKLYN_PIN: "4711" });
    assert.throws(() => startSitting(db, sitting.id), (error) => error.params?.names === "SUBMISSION_LINK_B");
    assert.equal(getSitting(db, sitting.id).startedAt ?? null, null, "not started");
    setTestVariables(db, test.id, { SUBMISSION_LINK_B: "b" });
    assert.ok(startSitting(db, sitting.id).startedAt);
    // Correcting a value during the window.
    setTestVariables(db, test.id, { FRANKLYN_PIN: "4712" });
    assert.equal(variablesFor(db, test.id, sitting.id).FRANKLYN_PIN, "4712");

    const auto = withVariables(db, course, { handoutA: "POS/Var-Auto.md", handoutB: null });
    const autoSitting = createSitting(db, auto.id, { opensAt: inMinutes(30) });
    assert.ok(startSitting(db, autoSitting.id).startedAt, "only CLASS and DATE");
  });

  test("the route is a teacher's, and the handout routes render with the saved values", async () => {
    const dbPath = temporaryPath();
    const saved = { path: process.env.EXAM_DB_PATH, periods: process.env.SCHOOL_PERIODS, fetch: global.fetch };
    process.env.EXAM_DB_PATH = dbPath;
    delete process.env.SCHOOL_PERIODS;
    const renders = [];
    const renderHandout = async (corpusPath, req, options) => {
      renders.push({ corpusPath, ...options });
      return `<p>${corpusPath}</p>`;
    };
    const started = await init({ startPage: () => "/index.html", renderHandout });
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const { course } = (() => {
      const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
      const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }, { username: "cara" }] });
      return { course: createCourse(db, klass.id, { subject: "POS", language: "de" }) };
    })();
    const test = withVariables(db, course, { handoutB: null });
    const sitting = createSitting(db, test.id, { opensAt: inMinutes(30) });
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
    try {
      const base = `http://127.0.0.1:${server.address().port}/exam`;
      const put = (as, role, values) =>
        saved.fetch(`${base}/api/tests/${test.id}/variables`, {
          method: "PUT",
          headers: { "X-As": as, "X-Role": role, "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        });
      assert.equal((await put("anna", "student", { FRANKLYN_PIN: "1" })).status, 403, "a student");
      assert.deepEqual(getTest(db, test.id).variables.find((variable) => variable.name === "FRANKLYN_PIN").value, null);
      assert.equal((await put("tdent", "teacher", { CLASS: "x" })).status, 400, "a refused value");
      const answer = await put("tdent", "teacher", { FRANKLYN_PIN: "4711", SUBMISSION_LINK: "https://example.org" });
      assert.equal(answer.status, 200);
      assert.equal((await answer.json()).variables.find((variable) => variable.name === "FRANKLYN_PIN").value, "4711", "it answers with the test");

      const ask = (url, as, role) => saved.fetch(`${base}${url}`, { headers: { "X-As": as, "X-Role": role } });
      assert.equal((await ask(`/tests/${test.id}/handouts/A/preview`, "tdent", "teacher")).status, 200);
      assert.deepEqual(renders.pop().vars, { CLASS: "4BHIF", DATE: viennaDate(sitting.opensAt).split("-").reverse().join("."), SUBMISSION_LINK: "https://example.org", FRANKLYN_PIN: "4711" });
      assert.equal((await ask(`/tests/${test.id}/handouts/A/solution`, "tdent", "teacher")).status, 200);
      assert.equal(renders.pop().vars.FRANKLYN_PIN, "4711", "the deck");
      startSitting(db, sitting.id);
      assert.equal((await put("tdent", "teacher", { FRANKLYN_PIN: "4712" })).status, 200, "during the window");
      assert.equal((await ask(`/my/sittings/${sitting.id}/handout`, "anna", "student")).status, 200);
      const participant = renders.pop();
      assert.equal(participant.vars.FRANKLYN_PIN, "4712", "the participant's handout");
      assert.equal(participant.vars.DATE, viennaDate(getSitting(db, sitting.id).startedAt).split("-").reverse().join("."));
    } finally {
      await new Promise((resolve) => server.close(resolve));
      global.fetch = saved.fetch;
      if (saved.path === undefined) delete process.env.EXAM_DB_PATH;
      else process.env.EXAM_DB_PATH = saved.path;
      if (saved.periods !== undefined) process.env.SCHOOL_PERIODS = saved.periods;
    }
  });
});
