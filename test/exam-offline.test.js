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

import { createClass, createCourse, createYear } from "../exam/classes.js";
import { migrate, openDatabase, readMigrations } from "../exam/db.js";
import { courseColumns, deleteColumn, setResult, updateColumn } from "../exam/gradebook.js";
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
  getTest,
  listTests,
  rescheduleSitting,
  setAttendance,
  startSitting,
  updateSitting,
  updateTest,
  viennaDate,
} from "../exam/tests.js";
import { nextOpenTestsChange, openTestsOf, previewView, startAttempt } from "../exam/attempts.js";
import { liveSnapshot } from "../exam/live.js";
import { corpusFiles, handoutAttachmentCheck, handoutPath, servableHandout } from "../exam/handout.js";
import { preParse, scanFiles } from "../obsidian.js";
import { handoutViews } from "../permission-context.js";

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

before(async () => {
  corpus = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-offline-corpus-"));
  for (const file of ["POS/diagram.png", "POS/starter.zip", "POS/exam-only.png", "POS/answer-only.png", "POS/hint.png", "POS/b.png"]) write(file);
  write("POS/LT1-A.md", handoutA);
  write("POS/LT1-B.md", "@@@ teacher\n# Long test B\n![[b.png]]\n");
  write("POS/Open.md", "# Open to everyone\n");
  write("POS/Class.md", "@@@ 4bhif\n# For the class\n");
  write("POS/Other.md", "@@@ 5ahif\n# For another class\n");
  write("POS/Later.md", "# Another file\n");
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
    const started = startSitting(db, sitting.id);
    const extended = extendSitting(db, sitting.id, { minutes: 10 });
    assert.equal(Date.parse(extended.closesAt) - Date.parse(started.closesAt), 10 * 60000);
    const ended = endSitting(db, sitting.id);
    assert.equal(ended.state, "over");
    assert.deepEqual(openTestsOf(db, "anna"), [], "the window closed for everyone");
    deleteSitting(db, sitting.id);
    assert.equal(getTest(db, sitting.testId).sittings.length, 0, "once over it can go, in an emergency");
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
    assert.deepEqual(Object.keys(snapshot.participants[0]).sort(), ["familyName", "givenName", "group", "present", "username"], "names only");
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
    startSitting(db, sitting.id);
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

  test("renders the exam variant and hides practice, answers and teacher blocks; the solution shows the answers", async () => {
    const markdown = handoutA.split("\n").slice(1).join("\n");
    const student = studentReq("anna");
    student[handoutViews] = { answer: false };
    const shown = await preParse(markdown, student, { embedDefaults: true });
    assert.match(shown, /EXAM-VARIANT/);
    assert.doesNotMatch(shown, /PRACTICE-VARIANT|ANSWER-TEXT|TEACHER-HINT/);

    const deck = teacherReq();
    deck[handoutViews] = { answer: true };
    const solution = await preParse(markdown, deck, { embedDefaults: true });
    assert.match(solution, /EXAM-VARIANT/);
    assert.match(solution, /ANSWER-TEXT/);
    assert.doesNotMatch(solution, /PRACTICE-VARIANT|TEACHER-HINT/, "rendered as a student, the teacher's own blocks hidden");
  });

  test("its views are not reachable by query, header or preference, and do not leak to another page", async () => {
    const markdown = handoutA.split("\n").slice(1).join("\n");
    const forged = studentReq("anna");
    forged.query = { handoutViews: "1", ve: "1", answer: "1" };
    forged.headers = { "x-handout-views": "1" };
    forged.body = { handoutViews: { answer: true } };
    forged.handoutViews = { answer: true };
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
});

describe("a handout's attachments", () => {
  test("are served while the handout is, under its views, and stop at once with the window, an absence or a regrouping", async () => {
    const { db, course } = seeded();
    const { sitting } = running(db, course);
    const check = (username, attachment) => handoutAttachmentCheck(db, studentReq(username), attachment, { username, teacher: false });
    assert.equal(await check("anna", "POS/diagram.png"), false, "before the start");
    startSitting(db, sitting.id);
    assert.equal(await check("anna", "POS/diagram.png"), true, "the image it embeds");
    assert.equal(await check("anna", "POS/starter.zip"), true, "the archive it links");
    assert.equal(await check("anna", "POS/exam-only.png"), true, "inside the exam variant");
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

  test("a teacher's previews and decks are served the answers' attachments, never the teacher blocks'", async () => {
    const { db, course } = seeded();
    running(db, course);
    const check = (attachment) => handoutAttachmentCheck(db, teacherReq(), attachment, { username: "tea", teacher: true });
    assert.equal(await check("POS/answer-only.png"), true);
    assert.equal(await check("POS/exam-only.png"), true);
    assert.equal(await check("POS/hint.png"), false, "rendered as a student");
  });
});
