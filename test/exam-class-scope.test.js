/**
 * The teachers entered in a class (`class-teachers`) and what they decide,
 * through the module's whole router and without a browser:
 *
 * - every route the module registers, walked as a teacher entered in another
 *   class: a route naming a record of the foreign class answers 403 or 404
 *   and changes nothing, and no answer of any route carries a name of the
 *   foreign class, its course, its test or its student - a route added later
 *   without a scope fails here, and so does one the walk cannot fill in;
 * - the lists that carry a photo version carry one only for rows of a class
 *   the session sees;
 * - creating, renaming and deleting a class and its teacher list are an
 *   admin's, a student is refused as a teacher, an entry takes effect with the
 *   next request, an admin sees the classes without teachers first;
 * - the year change offers last year's teachers ticked and enters only the
 *   confirmed ones; a closed year keeps its teachers' list editable;
 * - removing a teacher closes their open live view of the class.
 *
 * Every database lives in a temporary directory removed after the check.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import express from "express";

import { closeYear, createClass, createCourse, createYear, getClass, listClasses, setCurrentYear } from "../exam/classes.js";
import { openDatabase } from "../exam/db.js";
import { createColumn, setResult } from "../exam/gradebook.js";
import { createOfflineTest, createSitting, createTest } from "../exam/tests.js";
import { startAttempt } from "../exam/attempts.js";
import { storePhoto } from "../exam/photos.js";
import { createQuestion } from "../exam/pool-edit.js";
import { init } from "../exam/index.js";
import { enterTeacher } from "./exam-fixtures.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-scope-"));
  temporaryDirs.push(dir);
  return path.join(dir, "exam.sqlite");
}

/** A JPEG's header as far as the photo check reads it. */
function jpeg(width = 134, height = 200) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

/** A directory of its own, as `heldDirectoryPeople()` answers it. */
const person = (username, lastName, firstName, ...roles) => ({ username, lastName, firstName, roles: Object.fromEntries(roles.map((role) => [role, true])) });
const people = [
  person("tdent", "Dent", "Tina", "teacher"),
  person("fremd", "Fremd", "Fritz", "teacher"),
  person("amaier", "Maier", "Anna", "teacher"),
  person("mhuber", "Huber", "Max", "teacher"),
  person("anna", "Ahorn", "Anna", "4ahif", "student"),
  person("foreignkid", "Kind", "Fremdes", "9zzz", "student"),
];
const directory = () => ({ configured: true, people, state: "ready" });

/**
 * The module's router in a local app, every request as the session `X-As`
 * names with the roles `X-Role` lists; the stored preferences say teacher
 * view. Answers the app's base and a `close`.
 */
async function serveModule(dbPath) {
  const saved = { path: process.env.EXAM_DB_PATH, periods: process.env.SCHOOL_PERIODS, fetch: global.fetch };
  process.env.EXAM_DB_PATH = dbPath;
  delete process.env.SCHOOL_PERIODS;
  const started = await init({ startPage: () => "/index.html", renderHandout: async () => "<p>handout</p>", directory });
  assert.equal(started.active, true, started.reason);
  global.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1")) return saved.fetch(url, options);
    return { ok: true, json: async () => ({ attributes: { config: [JSON.stringify({ vt: 1 })] } }) };
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const username = req.get("X-As");
    req.user = {
      name: username,
      preferred_username: username,
      accessToken: "access-token",
      accessTokenDecoded: { preferred_username: username, exp: Date.now() / 1000 + 3600 },
      keycloakConfig: { "auth-server-url": "https://identity.example/", realm: "demo", resource: "safelearn" },
      rolesCalculated: JSON.stringify(Object.fromEntries((req.get("X-Role") ?? "").split(",").filter(Boolean).map((role) => [role, true]))),
    };
    next();
  });
  app.use("/exam", started.router);
  app.use((req, res) => res.status(404).send("UNMATCHED"));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/exam`;
  /** A request as `as` with `roles`; a JSON `body` for a write. Answers status and text. */
  const ask = async (url, as, roles, { method = "GET", body, signal } = {}) => {
    const answer = await saved.fetch(`${base}${url}`, {
      method,
      signal,
      headers: { "X-As": as, "X-Role": roles, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await answer.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // A page or an image.
    }
    return { status: answer.status, text, json };
  };
  return {
    router: started.router,
    base,
    ask,
    raw: saved.fetch,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections?.();
      global.fetch = saved.fetch;
      if (saved.path === undefined) delete process.env.EXAM_DB_PATH;
      else process.env.EXAM_DB_PATH = saved.path;
      if (saved.periods !== undefined) process.env.SCHOOL_PERIODS = saved.periods;
    },
  };
}

/**
 * Two classes of one year, each with a course, a column with a result, a
 * note, an online test with an open sitting and an attempt, and an offline
 * test with a sitting: `own` (4ahif, with anna, `tdent` entered) and
 * `foreign` (9zzz, with foreignkid, `fremd` entered). The foreign class's
 * names are the markers no answer to `tdent` may carry. One pool question is
 * used in both classes' tests. Both students have a photo.
 */
function twoClasses(db) {
  const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
  const category = db.prepare("INSERT INTO question_category (parent_id, name_de, name_en, position) VALUES (NULL, 'K', 'K', 0) RETURNING id").get().id;
  const { question } = createQuestion(db, {
    categoryId: category,
    type: "multichoice",
    nameDe: "Frage",
    nameEn: "Question",
    textDe: "<p>F</p>",
    textEn: "<p>Q</p>",
    answers: [
      { textDe: "<p>a</p>", textEn: "<p>a</p>", correct: true },
      { textDe: "<p>b</p>", textEn: "<p>b</p>", correct: false },
    ],
  });
  const free = createQuestion(db, { categoryId: category, type: "freetext", nameDe: "Frei", nameEn: "Free", textDe: "<p>F</p>", textEn: "<p>F</p>", solutionDe: "<p>S</p>", solutionEn: "<p>S</p>", answers: [] }).question;
  const build = (name, student, teacher, subject, testName) => {
    const klass = createClass(db, year.id, { name, students: [{ username: student, familyName: "X", givenName: "Y" }] });
    enterTeacher(db, klass.id, teacher);
    const course = createCourse(db, klass.id, { subject, language: "de" });
    const column = createColumn(db, course.id, { kind: "test", name: `${testName} SA`, date: "2026-11-03", maxPoints: 24 });
    setResult(db, column.id, student, { points: 17 });
    const test = createTest(db, course.id, { name: testName, questionIds: [question.id] });
    const sitting = createSitting(db, test.id, { opensAt: new Date(Date.now() + 60 * 60000).toISOString(), closesAt: new Date(Date.now() + 120 * 60000).toISOString(), durationMinutes: 20 });
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(new Date(Date.now() - 60000).toISOString(), new Date(Date.now() + 60 * 60000).toISOString(), sitting.id);
    const attempt = startAttempt(db, student, test.id).attemptId;
    const offline = createOfflineTest(db, course.id, { name: `${testName} Quickie`, durationMinutes: 15, gradebookKind: "shorttest", questionIds: [free.id] });
    const offlineSitting = createSitting(db, offline.id, { opensAt: new Date(Date.now() + 60 * 60000).toISOString() });
    const testQuestion = db.prepare("SELECT id FROM test_question WHERE test_id = ?").get(test.id).id;
    storePhoto(db, student, jpeg(), "admin1");
    return { klass, course, column, test, sitting, attempt, offline, offlineSitting, testQuestion, student };
  };
  const spare = createQuestion(db, {
    categoryId: category,
    type: "multichoice",
    nameDe: "Ersatz",
    nameEn: "Spare",
    textDe: "<p>E</p>",
    textEn: "<p>S</p>",
    answers: [
      { textDe: "<p>a</p>", textEn: "<p>a</p>", correct: true },
      { textDe: "<p>b</p>", textEn: "<p>b</p>", correct: false },
    ],
  }).question;
  return {
    year,
    question,
    spare,
    category,
    own: build("4ahif", "anna", "tdent", "WMC", "Owntest"),
    foreign: build("9zzz", "foreignkid", "fremd", "FOREIGNSUBJ", "Foreigntest"),
  };
}

/** What no answer to a teacher of the other class may carry. */
const markers = ["9zzz", "9ZZZ", "FOREIGNSUBJ", "Foreigntest", "foreignkid"];

/**
 * The path of a registered route with every parameter filled from the
 * foreign class's records, and whether it names one of them; null for a
 * parameter the walk does not know, which fails the walk.
 */
function filled(routePath, fixture) {
  const { foreign, year, spare, category } = fixture;
  const segments = routePath.split("/");
  let namesForeign = false;
  const byPrevious = {
    years: () => year.id,
    classes: () => ((namesForeign = true), foreign.klass.id),
    courses: () => ((namesForeign = true), foreign.course.id),
    assessments: () => ((namesForeign = true), foreign.column.id),
    tests: () => ((namesForeign = true), foreign.test.id),
    sittings: () => ((namesForeign = true), foreign.sitting.id),
    attempts: () => ((namesForeign = true), foreign.attempt),
    // The pool belongs to no class: the walk's writes go to a question of its own.
    questions: () => spare.id,
    categories: () => category,
    imports: () => 1,
    images: () => 1,
  };
  const byName = {
    testId: () => ((namesForeign = true), foreign.test.id),
    username: () => foreign.student,
    attempt: () => foreign.attempt,
    column: () => foreign.column.id,
    testQuestion: () => foreign.testQuestion,
    group: () => "A",
    semester: () => "ws",
    n: () => 1,
    token: () => "x",
    name: () => "9zzz",
  };
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (!segment.startsWith(":")) continue;
    const name = segment.slice(1);
    const fill = name === "id" ? byPrevious[segments[index - 1]] : byName[name];
    if (!fill) return null;
    segments[index] = String(fill());
  }
  // A student's own pages name the asker's records only; their routes decide by the asker, not by a class.
  return { path: segments.join("/"), namesForeign: namesForeign && !routePath.startsWith("/my/") && !routePath.startsWith("/api/my/") };
}

/**
 * The routes that answer from the directory, not from the module's records:
 * its class units and its people, which every teacher searches to maintain a
 * roster (`class-roster`). The foreign class's directory unit is named there
 * by design.
 */
const fromTheDirectory = (url) => url.startsWith("/api/directory/");

/** Every route the router registers, as `{ method, path }`. */
function registeredRoutes(router) {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map((method) => ({ method: method.toUpperCase(), path: layer.route.path })));
}

describe("a teacher of another class", () => {
  test("every registered route answers 403 or 404 for the foreign class's records, and no answer names them", async () => {
    const dbPath = temporaryPath();
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const fixture = twoClasses(db);
    // What the foreign class holds, compared after the walk.
    const holdings = () =>
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM roster_entry WHERE class_id = :class AND left_at IS NULL) AS roster,
             (SELECT COUNT(*) FROM course WHERE class_id = :class) AS courses,
             (SELECT COUNT(*) FROM test t JOIN course k ON k.id = t.course_id WHERE k.class_id = :class) AS tests,
             (SELECT COUNT(*) FROM sitting s JOIN test t ON t.id = s.test_id JOIN course k ON k.id = t.course_id WHERE k.class_id = :class) AS sittings,
             (SELECT COUNT(*) FROM assessment a JOIN course k ON k.id = a.course_id WHERE k.class_id = :class) AS columns,
             (SELECT COUNT(*) FROM manual_entry e JOIN assessment a ON a.id = e.assessment_id JOIN course k ON k.id = a.course_id WHERE k.class_id = :class) AS results,
             (SELECT COUNT(*) FROM attempt a JOIN test t ON t.id = a.test_id JOIN course k ON k.id = t.course_id WHERE k.class_id = :class) AS attempts,
             (SELECT COUNT(*) FROM class_teacher WHERE class_id = :class) AS teachers,
             (SELECT name FROM class WHERE id = :class) AS name`
        )
        .get({ class: fixture.foreign.klass.id });
    const before = { ...holdings() };
    const app = await serveModule(dbPath);
    try {
      const routes = registeredRoutes(app.router);
      assert.ok(routes.length > 80, `found ${routes.length} routes`);
      const unknown = routes.filter((route) => filled(route.path, fixture) === null);
      assert.deepEqual(unknown, [], "every parameter of every route can be filled in");
      // Reads first, then writes, so a write that wrongly went through cannot hide a read.
      const ordered = [...routes.filter((route) => route.method === "GET"), ...routes.filter((route) => route.method !== "GET")];
      const leaks = [];
      for (const route of ordered) {
        const { path: url, namesForeign } = filled(route.path, fixture);
        let answer;
        try {
          answer = await app.ask(url, "tdent", "teacher,student-images", {
            method: route.method,
            body: route.method === "GET" ? undefined : {},
            signal: AbortSignal.timeout(1500),
          });
        } catch (error) {
          // A stream that opened and stayed open: only the student's own may.
          if (error.name !== "TimeoutError") throw error;
          if (namesForeign || route.path !== "/api/my/events") leaks.push(`${route.method} ${url}: a stream opened`);
          continue;
        }
        if (namesForeign && ![403, 404].includes(answer.status)) leaks.push(`${route.method} ${url}: ${answer.status}`);
        if (answer.status < 300 && !fromTheDirectory(url) && markers.some((marker) => answer.text.includes(marker))) leaks.push(`${route.method} ${url}: names the foreign class`);
        assert.ok(answer.status < 500, `${route.method} ${url} failed: ${answer.text.slice(0, 300)}`);
      }
      // The pages and lists the bar's query names.
      for (const url of [
        `/tests?class=${fixture.foreign.klass.id}`,
        `/tests?course=${fixture.foreign.course.id}`,
        `/pool?course=${fixture.foreign.course.id}`,
        `/scale?class=${fixture.foreign.klass.id}`,
        `/api/tests?class=${fixture.foreign.klass.id}`,
        `/api/tests?course=${fixture.foreign.course.id}`,
        `/api/course-lookup?class=9zzz&subject=FOREIGNSUBJ&year=2026%2F27`,
        `/api/photos/foreignkid`,
      ]) {
        const answer = await app.ask(url, "tdent", "teacher,student-images");
        if (![403, 404].includes(answer.status)) leaks.push(`GET ${url}: ${answer.status}`);
      }
      for (const url of [`/?year=${fixture.year.id}`, "/tests", `/api/tests?year=${fixture.year.id}`, `/api/years/${fixture.year.id}/classes`, `/api/pool/questions/${fixture.question.id}`]) {
        const answer = await app.ask(url, "tdent", "teacher");
        assert.equal(answer.status, 200, url);
        if (markers.some((marker) => answer.text.includes(marker))) leaks.push(`GET ${url}: names the foreign class`);
      }
      assert.deepEqual(leaks, [], "nothing of the foreign class reaches the teacher");

      // Nothing of the foreign class changed.
      assert.deepEqual({ ...holdings() }, before, "A write to another class: nothing is stored");

      // The own class is there for the same teacher, and the usage counts the foreign test without naming it.
      assert.equal((await app.ask(`/api/courses/${fixture.own.course.id}/gradebook?semester=ws`, "tdent", "teacher")).status, 200);
      const usage = (await app.ask(`/api/pool/questions/${fixture.question.id}`, "tdent", "teacher")).json;
      assert.deepEqual([usage.usage.length, usage.usesElsewhere, usage.uses], [1, 1, 2], "the question pool's usage list: one shown, one counted");
      const adminUsage = (await app.ask(`/api/pool/questions/${fixture.question.id}`, "boss", "teacher,admin")).json;
      assert.deepEqual([adminUsage.usage.length, adminUsage.usesElsewhere], [2, 0], "an admin sees every use");
    } finally {
      await app.close();
    }
  });

  test("the lists that carry a photo version carry it only for rows of a class the session sees", async () => {
    const dbPath = temporaryPath();
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const fixture = twoClasses(db);
    const app = await serveModule(dbPath);
    try {
      const { own } = fixture;
      const lists = [
        [`/api/classes/${own.klass.id}`, (json) => json.roster],
        [`/api/courses/${own.course.id}/gradebook?semester=ws`, (json) => [...json.students, ...json.left]],
        [`/api/courses/${own.course.id}/students/anna`, (json) => [json.student]],
        [`/api/sittings/${own.sitting.id}/live`, (json) => json.participants],
        [`/api/tests/${own.offline.id}/grades`, (json) => json.rows],
      ];
      for (const [url, rows] of lists) {
        const answer = await app.ask(url, "tdent", "teacher,student-images");
        assert.equal(answer.status, 200, url);
        const withPhoto = rows(answer.json).filter((row) => row && typeof row.photo === "string").map((row) => row.username);
        assert.ok(withPhoto.every((username) => username === "anna"), `${url}: only the own class's rows carry a photo (${withPhoto})`);
        assert.ok(!answer.text.includes("foreignkid"), `${url}: no row of the foreign class`);
      }
      assert.equal((await app.ask("/photos/anna", "tdent", "teacher,student-images")).status, 200, "the own class's photo is served");
      assert.equal((await app.ask("/photos/foreignkid", "tdent", "teacher,student-images")).status, 404, "the foreign class's is not");
    } finally {
      await app.close();
    }
  });
});

describe("the class's teachers", () => {
  test("creating, renaming and deleting a class and its teachers are an admin's; an entry counts from the next request", async () => {
    const dbPath = temporaryPath();
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const app = await serveModule(dbPath);
    const teacher = (url, options) => app.ask(url, "amaier", "teacher", options);
    const admin = (url, options) => app.ask(url, "boss", "teacher,admin", options);
    try {
      assert.equal((await teacher(`/api/years/${year.id}/classes`, { method: "POST", body: { name: "4bhif" } })).status, 403, "A teacher tries to create a class");
      assert.equal(listClasses(db, year.id).length, 0, "no class is created");
      const created = await admin(`/api/years/${year.id}/classes`, { method: "POST", body: { name: "4bhif", students: ["anna"], teachers: ["mhuber"] } });
      assert.equal(created.status, 200, created.text);
      const classId = created.json.id;
      assert.deepEqual(created.json.teachers.map((entry) => entry.username), ["mhuber"], "the teachers ticked on creation are entered");
      assert.equal((await teacher(`/api/classes/${classId}`)).status, 404, "a teacher not entered does not see it");
      assert.deepEqual((await teacher(`/api/years/${year.id}/classes`)).json, [], "nor in the year's list");

      for (const [method, url, body] of [
        ["POST", `/api/classes/${classId}/teachers`, { username: "amaier" }],
        ["DELETE", `/api/classes/${classId}/teachers/mhuber`, undefined],
        ["PUT", `/api/classes/${classId}`, { name: "4chif" }],
        ["DELETE", `/api/classes/${classId}`, undefined],
        ["GET", "/api/directory/teachers", undefined],
        ["GET", `/api/years/${year.id}/next-classes`, undefined],
        ["POST", `/api/years/${year.id}/next-classes`, { from: classId }],
      ]) {
        assert.equal((await teacher(url, { method, body })).status, 403, `A teacher tries ${method} ${url}`);
      }
      enterTeacher(db, classId, "amaier");
      assert.equal((await teacher(`/api/classes/${classId}`)).status, 200, "an entered teacher sees it with the next request");
      for (const [method, url, body] of [
        ["POST", `/api/classes/${classId}/teachers`, { username: "tdent" }],
        ["PUT", `/api/classes/${classId}`, { name: "4chif" }],
        ["DELETE", `/api/classes/${classId}`, undefined],
      ]) {
        assert.equal((await teacher(url, { method, body })).status, 403, `An entered teacher tries ${method} ${url}`);
      }
      assert.equal(getClass(db, classId).name, "4bhif", "the class keeps its name");

      assert.equal((await admin(`/api/classes/${classId}/teachers`, { method: "POST", body: { username: "anna" } })).status, 400, "A student is entered as a teacher");
      assert.equal((await admin(`/api/classes/${classId}/teachers`, { method: "POST", body: { username: "nobody" } })).status, 400, "a username the directory does not hold");
      const entered = await admin(`/api/classes/${classId}/teachers`, { method: "POST", body: { username: "TDent" } });
      assert.equal(entered.status, 200, entered.text);
      assert.deepEqual(entered.json.map((entry) => [entry.username, entry.familyName]), [["tdent", "Dent"], ["mhuber", "Huber"], ["amaier", "Maier"]], "by family name");
      assert.deepEqual((await teacher(`/api/classes/${classId}`)).json.teachers.map((entry) => entry.username), ["tdent", "mhuber", "amaier"], "the class page lists its teachers for every teacher of it");
      const picker = (await admin("/api/directory/teachers")).json;
      assert.deepEqual(picker.teachers.map((entry) => entry.username), ["tdent", "fremd", "mhuber", "amaier"], "the picker offers the directory's teachers, no student");

      assert.equal((await admin(`/api/classes/${classId}/teachers/amaier`, { method: "DELETE" })).status, 200);
      assert.equal((await teacher(`/api/classes/${classId}`)).status, 404, "A teacher is removed: their next request does not see it");
      assert.equal((await admin(`/api/classes/${classId}/teachers/amaier`, { method: "DELETE" })).status, 404, "removing one not entered");

      const renamed = await admin(`/api/classes/${classId}`, { method: "PUT", body: { name: "4chif" } });
      assert.equal(renamed.status, 200);
      assert.equal(getClass(db, classId).teachers.length, 2, "renaming changes no teacher entry");
      assert.equal((await admin(`/api/classes/${classId}`, { method: "DELETE" })).status, 200, "an admin deletes the empty class");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM class_teacher WHERE class_id = ?").get(classId).n, 0, "its teacher entries went with it");
    } finally {
      await app.close();
    }
  });

  test("an admin sees every class, those without teachers first and marked by their count; a teacher sees no count", async () => {
    const dbPath = temporaryPath();
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const [a, b, c] = ["3ahif", "4bhif", "5chif"].map((name) => createClass(db, year.id, { name }));
    enterTeacher(db, b.id, "tdent");
    enterTeacher(db, b.id, "amaier");
    const app = await serveModule(dbPath);
    try {
      const overview = (await app.ask(`/api/years/${year.id}/classes`, "boss", "teacher,admin")).json;
      assert.deepEqual(overview.map((klass) => [klass.name, klass.teacherCount]), [["3ahif", 0], ["5chif", 0], ["4bhif", 2]], "After the migration: the classes without teachers first");
      assert.equal((await app.ask(`/api/classes/${a.id}`, "boss", "teacher,admin")).status, 200, "An admin opens a class without teachers");
      const own = (await app.ask(`/api/years/${year.id}/classes`, "tdent", "teacher")).json;
      assert.deepEqual(own.map((klass) => klass.name), ["4bhif"], "The overview of a school year: only the teacher's classes");
      assert.ok(!("teacherCount" in own[0]), "no count for a teacher");
      assert.equal((await app.ask(`/api/classes/${c.id}`, "tdent", "teacher")).status, 404);
    } finally {
      await app.close();
    }
  });

  test("the year change offers last year's teachers ticked and enters only the confirmed ones; a closed year keeps its list editable", async () => {
    const dbPath = temporaryPath();
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const last = createYear(db, { name: "2025/26", startsOn: "2025-09-08", summerStartsOn: "2026-02-16", endsOn: "2026-07-03" });
    const old = createClass(db, last.id, { name: "3ahif", students: [{ username: "anna" }] });
    enterTeacher(db, old.id, "amaier");
    enterTeacher(db, old.id, "mhuber");
    const next = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    setCurrentYear(db, next.id);
    const app = await serveModule(dbPath);
    const admin = (url, options) => app.ask(url, "boss", "teacher,admin", options);
    try {
      const proposal = (await admin(`/api/years/${next.id}/next-classes`)).json;
      const offered = proposal.classes.find((entry) => entry.from.name === "3ahif");
      assert.equal(offered.name, "4ahif");
      assert.deepEqual(
        offered.teachers.map((entry) => [entry.username, entry.lastYear]),
        [["mhuber", true], ["amaier", true], ["tdent", false], ["fremd", false]],
        "last year's teachers ticked, the directory's other teachers beside them"
      );
      const created = await admin(`/api/years/${next.id}/next-classes`, { method: "POST", body: { from: old.id, students: ["anna"], teachers: ["amaier"] } });
      assert.equal(created.status, 200, created.text);
      assert.deepEqual(getClass(db, created.json.id).teachers.map((entry) => entry.username), ["amaier"], "Carrying the teachers over: only the confirmed one");
      assert.deepEqual(getClass(db, old.id).teachers.map((entry) => entry.username).sort(), ["amaier", "mhuber"], "last year's class keeps both");

      closeYear(db, last.id);
      const roster = getClass(db, old.id).roster;
      const entered = await admin(`/api/classes/${old.id}/teachers`, { method: "POST", body: { username: "tdent" } });
      assert.equal(entered.status, 200, `Entering a teacher in a closed year: ${entered.text}`);
      const seen = await app.ask(`/api/classes/${old.id}`, "tdent", "teacher");
      assert.equal(seen.status, 200, "tdent sees the closed year's class");
      assert.deepEqual(seen.json.roster.map((entry) => [entry.username, entry.leftAt]), roster.map((entry) => [entry.username, entry.leftAt]), "and nothing of the year changed");
      assert.equal((await app.ask(`/api/classes/${old.id}/roster`, "tdent", "teacher", { method: "POST", body: { username: "ben" } })).status, 409, "the year's roster stays read-only");
      assert.equal((await admin(`/api/classes/${old.id}/teachers/mhuber`, { method: "DELETE" })).status, 200, "removing in a closed year");
      const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'class_teacher'").all();
      assert.deepEqual(triggers, [], "the teachers' list has no closed-year trigger");
    } finally {
      await app.close();
    }
  });

  test("removing a teacher closes their open live view of the class", async () => {
    const dbPath = temporaryPath();
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const fixture = twoClasses(db);
    const app = await serveModule(dbPath);
    try {
      const controller = new AbortController();
      const response = await app.raw(`${app.base}/api/sittings/${fixture.own.sitting.id}/events`, { headers: { "X-As": "tdent", "X-Role": "teacher" }, signal: controller.signal });
      assert.equal(response.status, 200);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let received = "";
      const until = async (pattern) => {
        while (!pattern.test(received)) {
          const { value, done } = await reader.read();
          if (done) return false;
          received += decoder.decode(value);
        }
        return true;
      };
      assert.ok(await until(/event: snapshot/), "the live view opened");
      // Another teacher's removal and another class's do not close it.
      enterTeacher(db, fixture.own.klass.id, "amaier");
      assert.equal((await app.ask(`/api/classes/${fixture.own.klass.id}/teachers/amaier`, "boss", "teacher,admin", { method: "DELETE" })).status, 200);
      assert.equal((await app.ask(`/api/classes/${fixture.foreign.klass.id}/teachers/fremd`, "boss", "teacher,admin", { method: "DELETE" })).status, 200);
      assert.equal((await app.ask(`/api/classes/${fixture.own.klass.id}/teachers/tdent`, "boss", "teacher,admin", { method: "DELETE" })).status, 200);
      const timeout = setTimeout(() => controller.abort(), 5000);
      assert.ok(await until(/event: refused/), `the stream is refused: ${received}`);
      assert.equal(received.match(/event: refused/g).length, 1, "once, for the teacher's own removal");
      const { done } = await reader.read();
      clearTimeout(timeout);
      assert.equal(done, true, "and ends");
      assert.equal((await app.ask(`/api/sittings/${fixture.own.sitting.id}/events`, "tdent", "teacher", { signal: AbortSignal.timeout(1500) })).status, 404, "reconnecting is not found");
    } finally {
      await app.close();
    }
  });
});
