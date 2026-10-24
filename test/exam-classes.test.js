/**
 * Classes and courses (`class-roster`), unit by unit: school years, classes and
 * their rosters, the directory checklist, and courses with their config
 * sheets.
 *
 * No browser, no login, no server: every database lives in a temporary
 * directory created and removed by the check that uses it, and the directory
 * is a list of people built here. The same behaviour against a running
 * instance is `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";

import {
  addToRoster,
  ConflictError,
  createClass,
  createCourse,
  createYear,
  currentYear,
  defaultWeights,
  deleteClass,
  deleteCourse,
  deleteYear,
  getClass,
  InvalidInputError,
  listClasses,
  NotFoundError,
  refreshNames,
  removeFromRoster,
  renameClass,
  renameYear,
  setCurrentYear,
  updateCourse,
} from "../exam/classes.js";
import { createColumn, setResult, setSemesterGrade } from "../exam/gradebook.js";
import { openDatabase } from "../exam/db.js";
import { classCandidates, directoryClassNames, isKnownTeacher, searchPeople } from "../exam/roster-source.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function freshDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-classes-"));
  temporaryDirs.push(dir);
  const { db } = openDatabase(path.join(dir, "exam.sqlite"));
  openDatabases.push(db);
  return db;
}

const year2026 = { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" };
const year2027 = { name: "2027/28", startsOn: "2027-09-06", summerStartsOn: "2028-02-14", endsOn: "2028-06-30" };

function person(username, roles, firstName = `Given-${username}`, lastName = `Family-${username}`) {
  return { username, firstName, lastName, roles: Object.fromEntries(roles.map((role) => [role, true])) };
}

/** The roster's usernames, those still attending only unless `all`. */
function usernames(db, classId, all = false) {
  return getClass(db, classId)
    .roster.filter((entry) => all || !entry.leftAt)
    .map((entry) => entry.username)
    .sort();
}

describe("school years", () => {
  test("the first year becomes current, a later one is created in advance and made current explicitly", () => {
    const db = freshDatabase();
    const first = createYear(db, year2026);
    assert.equal(first.current, true);
    const next = createYear(db, year2027);
    assert.equal(next.current, false, "a year created in advance is not current");
    assert.equal(currentYear(db).name, "2026/27");

    setCurrentYear(db, next.id);
    assert.equal(currentYear(db).name, "2027/28");
    const current = db.prepare("SELECT COUNT(*) AS n FROM school_year WHERE is_current = 1").get().n;
    assert.equal(current, 1, "exactly one year is current");
  });

  test("a year is named by its two calendar years and its dates are in order", () => {
    const db = freshDatabase();
    for (const name of ["2026", "2026/28", "26/27", "2026-27", ""]) {
      assert.throws(() => createYear(db, { ...year2026, name }), InvalidInputError, `"${name}" is refused`);
    }
    assert.throws(() => createYear(db, { ...year2026, summerStartsOn: "2026-09-01" }), InvalidInputError);
    assert.throws(() => createYear(db, { ...year2026, endsOn: "2027-02-01" }), InvalidInputError);
    assert.throws(() => createYear(db, { ...year2026, startsOn: "7.9.2026" }), InvalidInputError);
    assert.equal(createYear(db, { ...year2026, name: "2099/00" }).name, "2099/00", "a century turn counts on");
  });

  test("a year exists once", () => {
    const db = freshDatabase();
    createYear(db, year2026);
    assert.throws(() => createYear(db, year2026), ConflictError);
  });

  test("making a year current that does not exist changes nothing", () => {
    const db = freshDatabase();
    createYear(db, year2026);
    assert.throws(() => setCurrentYear(db, 99), NotFoundError);
    assert.equal(currentYear(db).name, "2026/27");
  });
});

describe("rosters", () => {
  test("a 5th-year class with former students: the checklist shows all, the roster holds the ticked", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const directory = [
      ...Array.from({ length: 70 }, (_, i) => person(`s${String(i).padStart(2, "0")}`, ["student", "5ahif"])),
      person("teach", ["teacher", "5ahif"]),
      person("other", ["student", "5bhif"]),
    ];
    const checklist = classCandidates(directory, "5ahif");
    assert.equal(checklist.ready, true);
    assert.equal(checklist.candidates.length, 70, "every member of the unit, and no teacher");
    assert.ok(!checklist.candidates.some((candidate) => candidate.username === "teach"));

    const ticked = checklist.candidates.slice(0, 25);
    const klass = createClass(db, year.id, { name: "5AHIF", students: ticked });
    assert.equal(klass.name, "5ahif", "stored lowercased, the way the directory holds it");
    assert.deepEqual(usernames(db, klass.id), ticked.map((p) => p.username).sort());
    assert.equal(listClasses(db, year.id)[0].students, 25);
  });

  test("a class is created with nobody on it unless someone is ticked", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const klass = createClass(db, year.id, { name: "4bhif" });
    assert.deepEqual(klass.roster, []);
  });

  test("a class exists once per school year, and again in the next", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const next = createYear(db, year2027);
    createClass(db, year.id, { name: "4BHIF" });
    assert.throws(() => createClass(db, year.id, { name: "4bhif" }), ConflictError);
    assert.equal(createClass(db, next.id, { name: "4bhif" }).yearId, next.id);
  });

  test("a class name is letters and digits", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    for (const name of ["", "4 bhif", "<b>", "../x"]) {
      assert.throws(() => createClass(db, year.id, { name }), InvalidInputError, `"${name}" is refused`);
    }
  });

  test("the directory changing later does not change a roster, and a name refresh changes names only", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const directory = [person("anna", ["student", "3ahif"]), person("bert", ["student", "3ahif"])];
    const klass = createClass(db, year.id, { name: "3ahif", students: classCandidates(directory, "3ahif").candidates });

    const later = [
      person("anna", ["student", "3bhif"], "Anna", "Married-Name"),
      person("cleo", ["student", "3ahif"]),
    ];
    assert.equal(refreshNames(db, klass.id, later), 1, "only anna is known to the directory now");
    assert.deepEqual(usernames(db, klass.id), ["anna", "bert"], "cleo is not added, bert is not removed, anna stays");
    const anna = getClass(db, klass.id).roster.find((entry) => entry.username === "anna");
    assert.equal(anna.familyName, "Married-Name");
    const bert = getClass(db, klass.id).roster.find((entry) => entry.username === "bert");
    assert.equal(bert.familyName, "Family-bert", "a person the directory no longer lists keeps their names");
  });

  test("a student changing class mid-year: marked as left in one, on the other from then on", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const a = createClass(db, year.id, { name: "3ahif", students: [{ username: "Dora" }] });
    const b = createClass(db, year.id, { name: "3bhif" });

    removeFromRoster(db, a.id, "dora");
    addToRoster(db, b.id, { username: "dora" });

    const left = getClass(db, a.id).roster;
    assert.equal(left.length, 1, "the entry is kept");
    assert.equal(left[0].username, "dora");
    assert.ok(left[0].leftAt, "and marked as left");
    assert.deepEqual(usernames(db, a.id), []);
    assert.deepEqual(usernames(db, b.id), ["dora"]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM student WHERE username = 'dora'").get().n, 1, "one person");
  });

  test("coming back clears the mark, and twice on the roster is refused", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const klass = createClass(db, year.id, { name: "2ahif", students: [{ username: "emil" }] });
    assert.throws(() => addToRoster(db, klass.id, { username: "EMIL" }), ConflictError);
    removeFromRoster(db, klass.id, "emil");
    assert.throws(() => removeFromRoster(db, klass.id, "emil"), NotFoundError, "only someone attending can leave");
    addToRoster(db, klass.id, { username: "emil" });
    assert.deepEqual(usernames(db, klass.id), ["emil"]);
    assert.equal(getClass(db, klass.id).roster.length, 1);
  });

  test("a username the directory does not know is added as it is", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const klass = createClass(db, year.id, { name: "1ahif" });
    const roster = addToRoster(db, klass.id, { username: "  NewKid " });
    assert.deepEqual(roster.map((entry) => [entry.username, entry.givenName, entry.familyName]), [["newkid", null, null]]);
    assert.throws(() => addToRoster(db, klass.id, { username: "" }), InvalidInputError);
    assert.throws(() => addToRoster(db, klass.id, { username: "two words" }), InvalidInputError);
  });
});

describe("the directory checklist", () => {
  const directory = [
    person("zoe", ["student", "4bhif"], "Zoë", "Ärger"),
    person("adam", ["student", "4bhif"], "Adam", "Zimmer"),
    person("boss", ["admin", "4bhif"]),
    person("teach", ["teacher", "4ahif"]),
    person("mia", ["student", "5ahif", "htl", "examparticipant"], "Mia", "Berger"),
  ];

  test("offers the class's members by name, never a teacher or admin", () => {
    const { candidates } = classCandidates(directory, "4bhif");
    assert.deepEqual(candidates.map((c) => c.username), ["zoe", "adam"], "Ärger sorts beside A, before Zimmer");
    assert.deepEqual(Object.keys(candidates[0]).sort(), ["familyName", "givenName", "username"], "no roles leave");
    assert.ok(isKnownTeacher(directory, "Teach"));
    assert.ok(isKnownTeacher(directory, "boss"));
    assert.ok(!isKnownTeacher(directory, "zoe"));
    assert.ok(!isKnownTeacher(directory, "nobody"));
  });

  test("lists the role values that name a class", () => {
    assert.deepEqual(directoryClassNames(directory).classes, ["4ahif", "4bhif", "5ahif"]);
  });

  test("searches the whole directory by name or username, without teachers, from two characters", () => {
    assert.deepEqual(searchPeople(directory, "BER").people.map((p) => p.username), ["mia"]);
    assert.deepEqual(searchPeople(directory, "a").people, []);
    assert.deepEqual(searchPeople(directory, "teach").people, []);
  });

  test("says so when the directory holds nothing yet", () => {
    assert.deepEqual(classCandidates(null, "4bhif"), { ready: false });
    assert.deepEqual(directoryClassNames(null), { ready: false });
    assert.deepEqual(searchPeople(null, "zoe"), { ready: false });
  });
});

describe("courses", () => {
  test("a course is class × subject × year, once, however it is capitalized", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const klass = createClass(db, year.id, { name: "4bhif" });
    const course = createCourse(db, klass.id, { subject: "WMC", language: "en" });
    assert.equal(course.language, "en");
    assert.equal(course.className, "4bhif");
    assert.equal(course.year.name, "2026/27");
    assert.deepEqual(course.weights, defaultWeights, "a new course starts with equal weights");
    assert.deepEqual(
      course.weights,
      { onlineTests: 20, manualTests: 20, shortTests: 20, participation: 20, homework: 20 },
      "20 % for each of the five categories"
    );
    assert.throws(() => createCourse(db, klass.id, { subject: "WMC" }), ConflictError);
    assert.throws(() => createCourse(db, klass.id, { subject: " wmc " }), ConflictError);
    const other = createClass(db, year.id, { name: "4ahif" });
    assert.equal(createCourse(db, other.id, { subject: "WMC" }).language, "de", "another class has its own");
  });

  test("a course needs a subject and a known language", () => {
    const db = freshDatabase();
    const klass = createClass(db, createYear(db, year2026).id, { name: "4bhif" });
    assert.throws(() => createCourse(db, klass.id, { subject: "  " }), InvalidInputError);
    assert.throws(() => createCourse(db, klass.id, { subject: "WMC", language: "fr" }), InvalidInputError);
    assert.throws(() => createCourse(db, 99, { subject: "WMC" }), NotFoundError);
  });

  test("the config sheet's weights are whole percentages that make 100", () => {
    const db = freshDatabase();
    const klass = createClass(db, createYear(db, year2026).id, { name: "4bhif" });
    const course = createCourse(db, klass.id, { subject: "POSE" });
    const weights = { onlineTests: 40, manualTests: 40, shortTests: 0, participation: 10, homework: 10 };
    assert.deepEqual(updateCourse(db, course.id, { weights }).weights, weights);
    for (const bad of [
      { ...weights, homework: 11 },
      { ...weights, homework: 9.5, participation: 10.5 },
      { ...weights, homework: -10, participation: 30 },
      { onlineTests: 100 },
      { onlineTests: 40, manualTests: 40, participation: 10, homework: 10 },
      { ...weights, shortTests: 10 },
      { ...weights, bonus: 0 },
      [40, 40, 10, 10],
    ]) {
      assert.throws(() => updateCourse(db, course.id, { weights: bad }), InvalidInputError, JSON.stringify(bad));
    }
    assert.deepEqual(updateCourse(db, course.id, { language: "en" }).weights, weights, "a language change keeps them");
  });
});

describe("renaming and deleting years, classes and courses", () => {
  test("a rename follows the rules of creation, and a duplicate is refused with the stored name kept", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const later = createYear(db, year2027);
    assert.throws(() => renameYear(db, later.id, { name: "2026/27" }), ConflictError);
    assert.throws(() => renameYear(db, later.id, { name: "2027/29" }), InvalidInputError);
    assert.equal(renameYear(db, later.id, { name: "2028/29" }).name, "2028/29");

    const a = createClass(db, year.id, { name: "4ahif" });
    createClass(db, year.id, { name: "4bhif" });
    assert.throws(() => renameClass(db, a.id, { name: "4BHIF" }), ConflictError);
    assert.equal(getClass(db, a.id).name, "4ahif", "kept");
    assert.equal(renameClass(db, a.id, { name: "4CHIF" }).name, "4chif");

    const wmc = createCourse(db, a.id, { subject: "WMx" });
    createCourse(db, a.id, { subject: "POSE" });
    assert.throws(() => updateCourse(db, wmc.id, { subject: "pose" }), ConflictError, "the same subject, however capitalized");
    assert.throws(() => updateCourse(db, wmc.id, { subject: " " }), InvalidInputError);
    const renamed = updateCourse(db, wmc.id, { subject: "WMC" });
    assert.deepEqual([renamed.subject, renamed.language, renamed.weights], ["WMC", "de", defaultWeights], "nothing else changes");
  });

  test("the current year and a year with classes are not deleted; an empty one is", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const later = createYear(db, year2027);
    assert.throws(() => deleteYear(db, year.id), (error) => error instanceof ConflictError && /current/.test(error.message));
    createClass(db, later.id, { name: "1ahif" });
    assert.throws(() => deleteYear(db, later.id), (error) => error instanceof ConflictError && /1 class\b/.test(error.message));
    const empty = createYear(db, { name: "2028/29", startsOn: "2028-09-04", summerStartsOn: "2029-02-12", endsOn: "2029-06-29" });
    deleteYear(db, empty.id);
    assert.throws(() => renameYear(db, empty.id, { name: "2030/31" }), NotFoundError);
  });

  test("a class with courses is not deleted; deleting one removes its roster and keeps its students", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
    const course = createCourse(db, klass.id, { subject: "WMC" });
    assert.throws(() => deleteClass(db, klass.id), (error) => error instanceof ConflictError && /1 course\b/.test(error.message));
    deleteCourse(db, course.id);
    deleteClass(db, klass.id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM roster_entry WHERE class_id = ?").get(klass.id).n, 0, "the roster went with it");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM student WHERE username IN ('anna', 'ben')").get().n, 2, "the students stay");
    assert.throws(() => getClass(db, klass.id), NotFoundError);
  });

  test("a course with a column, a result, a grade or a test is not deleted, and the refusal counts each", () => {
    const db = freshDatabase();
    const year = createYear(db, year2026);
    const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }] });
    const blocked = (course, pattern) =>
      assert.throws(() => deleteCourse(db, course.id), (error) => error instanceof ConflictError && pattern.test(error.message), String(pattern));

    const withColumn = createCourse(db, klass.id, { subject: "A" });
    createColumn(db, withColumn.id, { kind: "test", name: "Empty", date: "2026-10-01", maxPoints: 10 });
    blocked(withColumn, /columns 1, results 0, grades 0, online tests 0/);

    const withResult = createCourse(db, klass.id, { subject: "B" });
    const column = createColumn(db, withResult.id, { kind: "test", name: "1st", date: "2026-10-01", maxPoints: 10 });
    setResult(db, column.id, "anna", { points: 5 });
    blocked(withResult, /columns 1, results 1/);

    const withGrade = createCourse(db, klass.id, { subject: "C" });
    setSemesterGrade(db, withGrade.id, "anna", "ws", { override: 2 });
    blocked(withGrade, /grades 1/);

    const withTest = createCourse(db, klass.id, { subject: "D" });
    const at = new Date().toISOString();
    db.prepare("INSERT INTO test (course_id, name, created_at, updated_at) VALUES (?, 'T', ?, ?)").run(withTest.id, at, at);
    blocked(withTest, /online tests 1/);

    const empty = createCourse(db, klass.id, { subject: "E" });
    deleteCourse(db, empty.id);
    assert.deepEqual(getClass(db, klass.id).courses.map((c) => c.subject), ["A", "B", "C", "D"]);
  });
});

describe("the classes migration", () => {
  test("the case-insensitive course index and the username index exist", () => {
    const db = freshDatabase();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => row.name);
    assert.ok(indexes.includes("course_class_subject_nocase"));
    assert.ok(indexes.includes("roster_entry_username"));
  });
});
