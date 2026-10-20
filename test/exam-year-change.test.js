/**
 * The year change (`school-year-change`), unit by unit: the migration that
 * adds closing, the triggers that make a closed year read-only, closing a
 * year, starting the next one from it, and deleting the records of students
 * who have left once the retention period has passed.
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

import {
  addToRoster,
  asRefusal,
  closeYear,
  ConflictError,
  copyCourse,
  createClass,
  createCourse,
  createNextClass,
  createYear,
  getClass,
  getYear,
  InvalidInputError,
  listClasses,
  nextYearProposal,
  removeFromRoster,
  renameYear,
  setCurrentYear,
  successorName,
  updateCourse,
} from "../exam/classes.js";
import { migrate, openDatabase, readMigrations } from "../exam/db.js";
import { courseOverview, createColumn, setResult, setSemesterGrade, studentRecord } from "../exam/gradebook.js";
import { importPool } from "../exam/pool-import.js";
import { listQuestions } from "../exam/pool.js";
import { createSitting, createTest } from "../exam/tests.js";
import { finalizeDue, startAttempt } from "../exam/attempts.js";
import { parseRetentionYears, purgeLeavers, retentionReport } from "../exam/retention.js";
import { init } from "../exam/index.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-year-change-"));
  temporaryDirs.push(dir);
  return path.join(dir, "exam.sqlite");
}

function freshDatabase() {
  const { db } = openDatabase(temporaryPath());
  openDatabases.push(db);
  return db;
}

const year2026 = { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" };
const year2027 = { name: "2027/28", startsOn: "2027-09-06", summerStartsOn: "2028-02-14", endsOn: "2028-06-30" };
// A day after 2026/27 has ended, the day the checks close it on.
const summer2027 = "2027-08-01";

// A 1×1 PNG.
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** A trimmed Moodle export: a question with an image and a true/false. */
function poolXml(lang) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/HTTP</text></category></question>
  <question type="multichoice"><name><text>Bild ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p><img src="@@PLUGINFILE@@/image.png" alt="">${lang} picture</p>]]></text>
      <file name="image.png" path="/" encoding="base64">${pixel}</file></questiontext>
    <answer fraction="100" format="html"><text><![CDATA[<p>yes ${lang}</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>no ${lang}</p>]]></text></answer>
  </question>
  <question type="truefalse"><name><text>Wahr ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>${lang} statement</p>]]></text></questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>
</quiz>`;
}

const inMinutes = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

/**
 * A school year holding a row in every table that belongs to one: the class
 * 4bhif with anna and ben, the course WMC with a column, results and an
 * override, and a test from the pool with a sitting, an attempt, an answer
 * and a refused browser. `db` may be at an older schema; nothing here needs
 * migration 010.
 */
function filledYear(db) {
  importPool(db, poolXml("de"), poolXml("en"));
  const year = createYear(db, year2026);
  const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
  const course = createCourse(db, klass.id, { subject: "WMC", language: "en", weights: { onlineTests: 40, manualTests: 30, participation: 15, homework: 15 } });
  const column = createColumn(db, course.id, { kind: "test", name: "1st test", date: "2026-11-03", maxPoints: 24 });
  setResult(db, column.id, "anna", { points: 18 });
  setResult(db, column.id, "ben", { points: 6 });
  const homework = createColumn(db, course.id, { kind: "homework", name: "Essay", date: "2027-04-01" });
  setResult(db, homework.id, "ben", { percent: 90 });
  setSemesterGrade(db, course.id, "ben", "ws", { override: 4, comment: "oral exam" });
  const quiz = createTest(db, course.id, { name: "Quiz", questionIds: listQuestions(db).map((question) => question.id) });
  const sitting = createSitting(db, quiz.id, { opensAt: inMinutes(60), closesAt: inMinutes(120), durationMinutes: 15 });
  const startedAt = inMinutes(61);
  const { attemptId } = startAttempt(db, "anna", quiz.id, startedAt);
  db.prepare("INSERT INTO response (attempt_id, test_answer_id) SELECT attempt_id, test_answer_id FROM attempt_token WHERE attempt_id = ? LIMIT 1").run(attemptId);
  db.prepare("INSERT INTO refused_device (attempt_id, at) VALUES (?, ?)").run(attemptId, startedAt);
  return { year, klass, course, column, quiz, sitting, attemptId, startedAt };
}

/** `fn` throws the database's refusal of a write to a closed year, as the module answers it. */
function refusedAsClosed(fn, message) {
  assert.throws(
    () => {
      try {
        fn();
      } catch (error) {
        throw asRefusal(error);
      }
    },
    (error) => error instanceof ConflictError && error.key === "exam.errors.years.closed",
    message
  );
}

/** A filled 2026/27, 2027/28 made current, and 2026/27 closed. */
function closedYear() {
  const db = freshDatabase();
  const filled = filledYear(db);
  const next = createYear(db, year2027);
  setCurrentYear(db, next.id);
  closeYear(db, filled.year.id, summer2027);
  return { db, next, ...filled };
}

/**
 * Every table with a path to `school_year` by its foreign keys, found in the
 * schema itself rather than listed here, so a table added later is found too.
 */
function tablesOfAYear(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name);
  const parents = new Map(tables.map((table) => [table, db.prepare(`PRAGMA foreign_key_list(${table})`).all().map((key) => key.table)]));
  const reaches = new Map([["school_year", true]]);
  const leadsToYear = (table, seen = new Set()) => {
    if (reaches.has(table)) return reaches.get(table);
    if (seen.has(table)) return false;
    seen.add(table);
    const found = (parents.get(table) ?? []).some((parent) => leadsToYear(parent, seen));
    reaches.set(table, found);
    return found;
  };
  return tables.filter((table) => table !== "school_year" && leadsToYear(table)).sort();
}

describe("the migration to the year change", () => {
  test("a database at schema 9 with a gradebook, a pool and tests migrates with every proposal unchanged", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 9));
    const { course } = filledYear(db);
    const sheets = () => ["ws", "ss"].map((semester) => courseOverview(db, course.id, semester));
    const records = () => ["anna", "ben"].map((username) => studentRecord(db, course.id, username));
    const counts = () => db.prepare("SELECT (SELECT COUNT(*) FROM question) AS questions, (SELECT COUNT(*) FROM attempt) AS attempts, (SELECT COUNT(*) FROM test_question) AS snapshot").get();
    const before = { sheets: sheets(), records: records(), counts: { ...counts() } };

    assert.deepEqual(migrate(db, dbPath), { from: 9, to: readMigrations().length });
    assert.deepEqual(sheets(), before.sheets, "every sheet and proposal is what it was");
    assert.deepEqual(records(), before.records, "every student's record is what it was");
    assert.deepEqual({ ...counts() }, before.counts, "the pool and the tests are untouched");
    assert.equal(getYear(db, course.year.id).closed, false, "no year is closed by the migration");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM purge_in_progress").get().n, 0);
  });
});

describe("the triggers", () => {
  test("every table with a path to school_year has its insert, update and delete trigger", () => {
    const db = freshDatabase();
    const tables = tablesOfAYear(db);
    assert.ok(tables.length >= 18, `found ${tables.join(", ")}`);
    const triggers = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'").all();
    for (const table of tables) {
      for (const event of ["insert", "update", "delete"]) {
        const trigger = triggers.find((candidate) => candidate.tbl_name === table && candidate.name === `${table}_closed_year_${event}`);
        assert.ok(trigger, `${table} has no ${event} trigger for a closed year`);
        assert.match(trigger.sql, new RegExp(`BEFORE ${event.toUpperCase()} ON ${table}\\b`), `${trigger.name} fires before the ${event}`);
        assert.match(trigger.sql, /RAISE\(ABORT, 'exam: school year closed'\)/, `${trigger.name} aborts`);
      }
      const remove = triggers.find((candidate) => candidate.name === `${table}_closed_year_delete`);
      assert.match(remove.sql, /NOT EXISTS \(SELECT 1 FROM purge_in_progress\)/, `${table}'s delete trigger lets a purge through`);
    }
  });

  test("a closed year refuses an update and a delete of every row it holds, whatever writes it", () => {
    const { db } = closedYear();
    for (const table of tablesOfAYear(db)) {
      const rows = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      assert.ok(rows > 0, `the fixture has a row in ${table}`);
      refusedAsClosed(() => db.prepare(`UPDATE ${table} SET rowid = rowid`).run(), `an update of ${table}`);
      refusedAsClosed(() => db.prepare(`DELETE FROM ${table}`).run(), `a delete from ${table}`);
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, rows, `${table} kept its rows`);
    }
  });

  test("an open year is written as before, beside a closed one", () => {
    const { db, next } = closedYear();
    const klass = createClass(db, next.id, { name: "5bhif", students: [{ username: "anna" }] });
    const course = createCourse(db, klass.id, { subject: "WMC" });
    const column = createColumn(db, course.id, { kind: "test", name: "T", date: "2027-11-03" });
    setResult(db, column.id, "anna", { percent: 80 });
    removeFromRoster(db, klass.id, "anna");
    assert.equal(studentRecord(db, course.id, "anna").semesters.ws.categories.manualTests.fraction, 0.8);
  });
});

describe("closing a school year", () => {
  test("a year is closed only after its end date, when it is not current and not closed already", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    assert.throws(() => closeYear(db, year.id, summer2027), (error) => error instanceof ConflictError && /current/.test(error.message));
    const next = createYear(db, year2027);
    setCurrentYear(db, next.id);
    assert.throws(() => closeYear(db, year.id, "2027-07-02"), (error) => error instanceof ConflictError && /ends on/.test(error.message), "not on its last day");
    assert.throws(() => closeYear(db, year.id, "2027-06-01"), (error) => error instanceof ConflictError && /ends on/.test(error.message));
    assert.equal(getYear(db, year.id).closed, false);

    const closed = closeYear(db, year.id, "2027-07-03");
    assert.equal(closed.closed, true);
    assert.match(closed.closedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.throws(() => closeYear(db, year.id, summer2027), (error) => error instanceof ConflictError && /closed already/.test(error.message));
  });

  test("an entry, a column, a course and a roster change in a closed year are refused, and nothing is written", () => {
    const { db, klass, course, column } = closedYear();
    const sheet = courseOverview(db, course.id, "ws");
    refusedAsClosed(() => setResult(db, column.id, "anna", { points: 24 }), "an entry");
    refusedAsClosed(() => createColumn(db, course.id, { kind: "test", name: "late", date: "2027-06-01" }), "a column");
    refusedAsClosed(() => createCourse(db, klass.id, { subject: "NVS" }), "a course");
    refusedAsClosed(() => updateCourse(db, course.id, { winterShare: 30 }), "a course's config sheet");
    refusedAsClosed(() => addToRoster(db, klass.id, { username: "carla" }), "a roster entry");
    refusedAsClosed(() => removeFromRoster(db, klass.id, "ben"), "taking someone off the roster");
    refusedAsClosed(() => createClass(db, klass.yearId, { name: "4chif" }), "a class");
    assert.deepEqual(courseOverview(db, course.id, "ws"), sheet, "the sheet is unchanged");
  });

  test("a closed year keeps its name and dates and is not deleted, but another year can be made current", () => {
    const { db, year, next } = closedYear();
    refusedAsClosed(() => renameYear(db, year.id, { name: "2025/26" }), "a rename");
    refusedAsClosed(() => db.prepare("UPDATE school_year SET closed_at = NULL WHERE id = ?").run(year.id), "reopening");
    refusedAsClosed(() => db.prepare("UPDATE school_year SET ends_on = '2027-09-01' WHERE id = ?").run(year.id), "new dates");
    refusedAsClosed(() => db.prepare("DELETE FROM school_year WHERE id = ?").run(year.id), "deleting it");
    assert.equal(setCurrentYear(db, year.id).current, true);
    assert.equal(setCurrentYear(db, next.id).current, true);
  });

  test("the sweep skips an attempt it can no longer submit in a closed year and logs it", () => {
    const db = freshDatabase();
    const { year, attemptId, sitting } = filledYear(db);
    setCurrentYear(db, createYear(db, year2027).id);
    closeYear(db, year.id, summer2027);
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.join(" "));
    try {
      assert.equal(finalizeDue(db, sitting.closesAt), 0);
    } finally {
      console.error = original;
    }
    assert.equal(db.prepare("SELECT submitted_at FROM attempt WHERE id = ?").get(attemptId).submitted_at, null);
    assert.match(logged.join("\n"), new RegExp(`Attempt ${attemptId} is in a closed school year`));
  });
});

describe("starting the next year", () => {
  function person(username, roles) {
    return { username, firstName: `Given-${username}`, lastName: `Family-${username}`, roles: Object.fromEntries(roles.map((role) => [role, true])) };
  }

  /** 2026/27 with 3ahif (anna, ben, carla who left) and 5ahif, and 2027/28 created after it. */
  function twoYears() {
    const db = freshDatabase();
    const last = createYear(db, year2026);
    const third = createClass(db, last.id, { name: "3ahif", students: [{ username: "anna", givenName: "Anna" }, { username: "ben" }, { username: "carla" }] });
    removeFromRoster(db, third.id, "carla");
    const fifth = createClass(db, last.id, { name: "5ahif", students: [{ username: "dora" }] });
    const course = createCourse(db, third.id, { subject: "WMC", language: "en", weights: { onlineTests: 40, manualTests: 30, participation: 15, homework: 15 }, winterShare: 40 });
    const column = createColumn(db, course.id, { kind: "test", name: "T", date: "2026-11-03" });
    setResult(db, column.id, "anna", { percent: 70 });
    createTest(db, course.id, { name: "Quiz", questionIds: importedQuestions(db) });
    const next = createYear(db, year2027);
    // The directory now: anna and a newcomer in 4ahif, a teacher holding the role too.
    const people = [person("anna", ["4ahif"]), person("eva", ["4ahif"]), person("teach", ["4ahif", "teacher"]), person("ben", [])];
    return { db, last, next, third, fifth, course, people };
  }

  function importedQuestions(db) {
    importPool(db, poolXml("de"), poolXml("en"));
    return listQuestions(db).map((question) => question.id);
  }

  test("a class moves one level up, a fifth-year class has no successor", () => {
    assert.equal(successorName("3ahif"), "4ahif");
    assert.equal(successorName("1a"), "2a");
    assert.equal(successorName("4bhitm"), "5bhitm");
    assert.equal(successorName("5ahif"), null);
    assert.equal(successorName("abc"), null);
  });

  test("the proposal ticks last year's roster, shows the directory's other members, never a teacher", () => {
    const { db, next, third, people } = twoYears();
    const proposal = nextYearProposal(db, next.id, people);
    assert.equal(proposal.previous.name, "2026/27");
    const [fourth, fifth] = proposal.classes;
    assert.deepEqual([fourth.from.name, fourth.name, fourth.existing], ["3ahif", "4ahif", null]);
    assert.deepEqual([fifth.from.name, fifth.name], ["5ahif", null], "a fifth-year class is listed without a successor");
    const flagged = (lastYear) => fourth.people.filter((entry) => entry.lastYear === lastYear).map((entry) => entry.username).sort();
    assert.deepEqual(flagged(true), ["anna", "ben"], "last year's roster, without who left");
    assert.deepEqual(flagged(false), ["eva"], "the directory's newcomers, never a teacher");
    assert.equal(fourth.people.findIndex((entry) => !entry.lastYear), 2, "last year's roster comes first");
    assert.equal(fourth.people.find((entry) => entry.username === "anna").givenName, "Anna");
    assert.deepEqual(fourth.courses.map((course) => course.subject), ["WMC"]);
    assert.equal(third.yearId, proposal.previous.id);
  });

  test("without the directory, last year's roster is still offered", () => {
    const { db, next } = twoYears();
    const [fourth] = nextYearProposal(db, next.id, null).classes;
    assert.deepEqual(fourth.people.map((entry) => entry.username).sort(), ["anna", "ben"]);
  });

  test("a successor that exists already is marked as done", () => {
    const { db, next, people } = twoYears();
    const existing = createClass(db, next.id, { name: "4AHIF" });
    const [fourth] = nextYearProposal(db, next.id, people).classes;
    assert.equal(fourth.existing, existing.id);
    assert.equal(fourth.people, undefined);
  });

  test("the first year has nothing to start from", () => {
    const db = freshDatabase();
    const first = createYear(db, year2026);
    assert.deepEqual(nextYearProposal(db, first.id, []), { year: getYear(db, first.id), previous: null, classes: [] });
  });

  test("creating the successor puts on it exactly the ticked people, and copies a course without columns and tests", () => {
    const { db, next, third, course } = twoYears();
    const created = createNextClass(db, next.id, { from: third.id, students: [{ username: "anna" }, { username: "eva" }], courseIds: [course.id] });
    assert.equal(created.name, "4ahif");
    assert.equal(created.year.id, next.id);
    assert.deepEqual(created.roster.map((entry) => entry.username).sort(), ["anna", "eva"]);
    const [copy] = created.courses;
    assert.deepEqual(
      [copy.subject, copy.language, copy.weights, copy.winterShare],
      [course.subject, course.language, course.weights, course.winterShare]
    );
    assert.notEqual(copy.id, course.id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assessment WHERE course_id = ?").get(copy.id).n, 0, "no column");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM test WHERE course_id = ?").get(copy.id).n, 0, "no test");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM test WHERE course_id = ?").get(course.id).n, 1, "last year's test stays");
  });

  test("a class and its courses are created together or not at all", () => {
    const { db, next, third, fifth, course } = twoYears();
    assert.throws(() => createNextClass(db, next.id, { from: third.id, courseIds: [course.id, course.id] }), ConflictError);
    assert.deepEqual(listClasses(db, next.id), [], "the class is not left behind without its courses");
    assert.throws(() => createNextClass(db, next.id, { from: fifth.id }), InvalidInputError, "no successor");
    assert.throws(() => createNextClass(db, next.id, { from: third.id, courseIds: [999] }), InvalidInputError, "a course of another class");
    const later = createYear(db, { name: "2028/29", startsOn: "2028-09-04", summerStartsOn: "2029-02-12", endsOn: "2029-06-29" });
    assert.throws(() => createNextClass(db, later.id, { from: third.id }), InvalidInputError, "a class of a year before the previous one");
  });

  test("a closed year can be the source of a proposal and of a copy", () => {
    const { db, last, next, third, course, people } = twoYears();
    setCurrentYear(db, next.id);
    closeYear(db, last.id, summer2027);
    const [fourth] = nextYearProposal(db, next.id, people).classes;
    assert.equal(fourth.name, "4ahif");
    const created = createNextClass(db, next.id, { from: third.id, students: [{ username: "anna" }], courseIds: [course.id] });
    assert.equal(getClass(db, created.id).courses.length, 1);
    assert.equal(copyCourse(db, course.id, createClass(db, next.id, { name: "4bhif" }).id).subject, "WMC");
  });
});

describe("the retention period", () => {
  const originalDbPath = process.env.EXAM_DB_PATH;
  const originalYears = process.env.EXAM_RETENTION_YEARS;
  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.EXAM_DB_PATH;
    else process.env.EXAM_DB_PATH = originalDbPath;
    if (originalYears === undefined) delete process.env.EXAM_RETENTION_YEARS;
    else process.env.EXAM_RETENTION_YEARS = originalYears;
  });

  test("EXAM_RETENTION_YEARS is a whole number of years from 1 to 10, two when unset", () => {
    assert.equal(parseRetentionYears(undefined), 2);
    assert.equal(parseRetentionYears(""), 2);
    assert.equal(parseRetentionYears(" 3 "), 3);
    assert.equal(parseRetentionYears("1"), 1);
    assert.equal(parseRetentionYears("10"), 10);
    for (const malformed of ["two", "0", "11", "2.5", "-1", "2y"]) {
      assert.throws(() => parseRetentionYears(malformed), /^Error: EXAM_RETENTION_YEARS: /, malformed);
    }
  });

  test("a malformed EXAM_RETENTION_YEARS disables the module with the variable named, before the database is opened", async () => {
    process.env.EXAM_DB_PATH = temporaryPath();
    process.env.EXAM_RETENTION_YEARS = "two";
    const started = await init({ startPage: () => "/index.html" });
    assert.equal(started.active, false);
    assert.match(started.reason, /^EXAM_RETENTION_YEARS: "two"/);
    assert.equal(fs.existsSync(process.env.EXAM_DB_PATH), false, "no database is created");
  });
});

describe("deleting the records of students who have left", () => {
  /**
   * The filled 2026/27, closed; 2027/28 current with ben moved up and dora new,
   * while anna left after 2026/27. carla was recorded but never on a roster.
   */
  function afterAYear() {
    const db = freshDatabase();
    const filled = filledYear(db);
    const next = createYear(db, year2027);
    setCurrentYear(db, next.id);
    createClass(db, next.id, { name: "5bhif", students: [{ username: "ben" }, { username: "dora" }] });
    closeYear(db, filled.year.id, summer2027);
    db.prepare("INSERT INTO student (username) VALUES ('carla')").run();
    return { db, next, ...filled };
  }

  const counts = (db) =>
    Object.fromEntries(
      ["student", "roster_entry", "manual_entry", "semester_grade", "attempt", "attempt_question", "attempt_token", "response", "refused_device", "sitting_participant", "class", "course", "assessment", "test", "test_question", "sitting", "question_usage"].map((table) => [
        table,
        db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,
      ])
    );

  test("a leaver is due once the period after their last year has passed; never on a roster is due at once", () => {
    const { db } = afterAYear();
    // anna's last year ended 2027-07-02: with two years, kept up to 2029-07-02.
    assert.deepEqual(retentionReport(db, "2028-08-01", 2), {
      years: 2,
      students: 1,
      records: { results: 0, overrides: 0, attempts: 0, sittings: 0, rosterEntries: 0 },
    }, "only carla, who was never on a roster");
    assert.equal(retentionReport(db, "2029-07-02", 2).students, 1, "not on the last day of the period");
    assert.deepEqual(retentionReport(db, "2029-07-03", 2), {
      years: 2,
      students: 2,
      records: { results: 1, overrides: 0, attempts: 1, sittings: 1, rosterEntries: 1 },
    }, "anna and carla, counted per kind");
    assert.equal(retentionReport(db, "2028-07-03", 1).students, 2, "a shorter period from the deployment");
  });

  test("a student on a roster of the current year is never reported, however old their records", () => {
    const { db } = afterAYear();
    const report = retentionReport(db, "2040-01-01", 2);
    assert.equal(report.students, 2, "anna and carla, never ben or dora");
    assert.equal(report.records.overrides, 0, "ben's override stays");
  });

  test("the purge deletes the reported records, through a closed year, and nothing else", () => {
    const { db, attemptId, year } = afterAYear();
    const before = counts(db);
    const anna = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE username = 'anna'`).get().n;
    const ofAttempt = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE attempt_id = ?`).get(attemptId).n;
    const attemptRows = Object.fromEntries(["attempt_question", "attempt_token", "response", "refused_device"].map((table) => [table, ofAttempt(table)]));
    for (const [table, rows] of Object.entries(attemptRows)) assert.ok(rows > 0, `the fixture has ${table} rows for anna's attempt`);
    const expected = {
      student: 2,
      roster_entry: anna("roster_entry"),
      manual_entry: anna("manual_entry"),
      semester_grade: anna("semester_grade"),
      attempt: anna("attempt"),
      sitting_participant: anna("sitting_participant"),
      ...attemptRows,
    };

    const report = retentionReport(db, "2029-07-03", 2);
    assert.deepEqual(purgeLeavers(db, "2029-07-03", report, 2), report);

    const after = counts(db);
    for (const table of Object.keys(before)) {
      assert.equal(after[table], before[table] - (expected[table] ?? 0), `${table} lost exactly the leavers' rows`);
    }
    assert.deepEqual(db.prepare("SELECT username FROM student ORDER BY username").all().map((row) => row.username), ["ben", "dora"]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM purge_in_progress").get().n, 0, "the marker is gone again");
    assert.equal(retentionReport(db, "2029-07-03", 2).students, 0);
    assert.equal(getYear(db, year.id).closed, true);
    refusedAsClosed(() => db.prepare("DELETE FROM manual_entry").run(), "the closed year refuses a delete again");
  });

  test("a purge whose counts changed since the report is refused and deletes nothing", () => {
    const { db } = afterAYear();
    const report = retentionReport(db, "2029-07-03", 2);
    db.prepare("INSERT INTO student (username) VALUES ('erik')").run();
    const before = counts(db);
    assert.throws(() => purgeLeavers(db, "2029-07-03", report, 2), (error) => error instanceof ConflictError && error.key === "exam.errors.retention.changed");
    assert.throws(() => purgeLeavers(db, "2029-07-03", null, 2), InvalidInputError);
    assert.throws(() => purgeLeavers(db, "2029-07-03", { students: report.students }, 2), ConflictError, "a report without its counts");
    assert.deepEqual(counts(db), before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM purge_in_progress").get().n, 0);
  });

  test("the marker lets deletes through, never an insert or an update", () => {
    const { db, course } = afterAYear();
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO purge_in_progress (id) VALUES (1)").run();
      refusedAsClosed(() => createColumn(db, course.id, { kind: "test", name: "late", date: "2027-06-01" }), "an insert");
      refusedAsClosed(() => db.prepare("UPDATE manual_entry SET value = 1").run(), "an update");
      db.prepare("DELETE FROM manual_entry").run();
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM manual_entry").get().n, 0);
    } finally {
      db.exec("ROLLBACK");
    }
  });
});
