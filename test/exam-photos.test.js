/**
 * Students' photos (`student-photos`) unit by unit and through the module's
 * routes, without a browser: the header check of JPEG and PNG and the limits
 * of 256 KB and 600 px, storing and replacing, the matching against a
 * directory of its own (by username, by class and names regardless of case,
 * accents and the order of given names, two people with the same name, an
 * unknown person, a teacher), the summary per class, the photos without a
 * person and the three deletions with their confirmed number; the photo route
 * for the role `student-images` and a class the session sees - a teacher, an admin and a student
 * without it refused, a teacher in student view with it served - with private
 * caching, a 404 without a photo; the import routes for the role and an
 * admin together; and the version per row in the gradebook sheet, the
 * student page, the live view and the correction table, a replaced photo
 * changing it and no row carrying it for a session without the role.
 *
 * Every database lives in a temporary directory removed after the check.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import express from "express";

import { createClass, createCourse, createYear } from "../exam/classes.js";
import { openDatabase } from "../exam/db.js";
import { createColumn, setResult } from "../exam/gradebook.js";
import { createOfflineTest, createSitting, startSitting } from "../exam/tests.js";
import { checkPhoto, deletePhotos, matchPhotos, photoSummary, readPhoto, storePhoto, withPhotoVersions } from "../exam/photos.js";
import { registerPhotoRoutes } from "../exam/routes-photos.js";
import { init } from "../exam/index.js";
import { createQuestion } from "../exam/pool-edit.js";
import { enterTeacher } from "./exam-fixtures.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-photos-"));
  temporaryDirs.push(dir);
  return path.join(dir, "exam.sqlite");
}

function database() {
  const { db } = openDatabase(temporaryPath());
  openDatabases.push(db);
  return db;
}

/** A JPEG's header as far as the check reads it: SOI, an APP0 segment, a baseline frame of `width` x `height`, EOI. */
function jpeg(width, height, padding = 0) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(padding), Buffer.from([0xff, 0xd9])]);
}

/** A PNG's signature and IHDR chunk for `width` x `height`. */
function png(width, height) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]);
}

function keyOf(fn) {
  try {
    fn();
  } catch (error) {
    return error.key ?? error.message;
  }
  return null;
}

/** A directory of its own: people as `heldDirectoryPeople()` answers them. */
const person = (username, lastName, firstName, ...roles) => ({ username, lastName, firstName, roles: Object.fromEntries(roles.map((role) => [role, true])) });
const people = [
  person("mmuster", "Muster", "Max", "5ahif", "student"),
  person("abrunner", "Brünner", "Anna Lena", "5ahif", "student"),
  person("jhuber1", "Huber", "Julia", "5ahif", "student"),
  person("jhuber2", "Huber", "Julia", "5ahif", "student"),
  person("kkern", "Kern", "Karl", "4bhif", "student"),
  person("tlehrer", "Lehrer", "Tina", "5ahif", "teacher"),
];

describe("the photo itself", () => {
  test("A photo is imported for a student without one; a second import replaces the first", () => {
    const db = database();
    const stored = storePhoto(db, "MMuster", jpeg(134, 200), "admin1", "2026-11-27T18:00:00.000Z");
    assert.deepEqual([stored.username, stored.mime, stored.width, stored.height, stored.importedBy], ["mmuster", "image/jpeg", 134, 200, "admin1"]);
    const read = readPhoto(db, "mmuster");
    assert.equal(read.importedAt, "2026-11-27T18:00:00.000Z");
    assert.ok(read.image.equals(jpeg(134, 200)));
    storePhoto(db, "mmuster", png(300, 400), "admin2", "2026-11-28T08:00:00.000Z");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM student_photo").get().n, 1, "only the new photo");
    const replaced = readPhoto(db, "mmuster");
    assert.deepEqual([replaced.mime, replaced.width, replaced.height, replaced.importedBy], ["image/png", 300, 400, "admin2"]);
    assert.notEqual(replaced.version, read.version, "a replaced photo has a new version");
  });

  test("A file that is not an image is refused, and so is one too large or too wide", () => {
    const db = database();
    assert.equal(keyOf(() => storePhoto(db, "mmuster", Buffer.from("GIF89a not really"), "admin1")), "exam.errors.photos.notAnImage");
    assert.equal(keyOf(() => storePhoto(db, "mmuster", Buffer.from("<svg/>"), "admin1")), "exam.errors.photos.notAnImage");
    assert.equal(keyOf(() => storePhoto(db, "mmuster", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "admin1")), "exam.errors.photos.notAnImage", "a JPEG without a frame");
    assert.equal(keyOf(() => storePhoto(db, "mmuster", jpeg(601, 200), "admin1")), "exam.errors.photos.tooWide");
    assert.equal(keyOf(() => storePhoto(db, "mmuster", png(200, 601), "admin1")), "exam.errors.photos.tooWide");
    assert.equal(keyOf(() => storePhoto(db, "mmuster", jpeg(134, 200, 256 * 1024), "admin1")), "exam.errors.photos.tooLarge");
    assert.equal(readPhoto(db, "mmuster"), null, "nothing stored for mmuster");
    assert.deepEqual(checkPhoto(jpeg(600, 600)), { mime: "image/jpeg", width: 600, height: 600 }, "600 px is still allowed");
  });
});

describe("matching an import", () => {
  test("by username, by class and names, ambiguous, unknown and teachers", () => {
    const { matched, ambiguous, unmatched } = matchPhotos(people, [
      { key: "a", file: null, class: "5AHIF", familyName: "Muster", givenName: "Max" },
      { key: "b", file: null, class: "5ahif", familyName: "BRUNNER", givenName: "Lena  Anna" },
      { key: "c", file: null, class: "5AHIF", familyName: "Huber", givenName: "Julia" },
      { key: "d", file: null, class: "5AHIF", familyName: "Nobody", givenName: "Known" },
      { key: "e", file: "kkern.jpg", class: "", familyName: "", givenName: "" },
      { key: "f", file: null, class: "5AHIF", familyName: "Lehrer", givenName: "Tina" },
      { key: "g", file: "tlehrer.png", class: "", familyName: "", givenName: "" },
      { key: "h", file: null, class: "4BHIF", familyName: "Muster", givenName: "Max" },
      { key: "i", file: "mmuster.jpg", class: "4BHIF", familyName: "Somebody", givenName: "Else" },
    ]);
    const matchedBy = Object.fromEntries(matched.map(({ key, person: found }) => [key, found.username]));
    assert.deepEqual(matchedBy, { a: "mmuster", b: "abrunner", e: "kkern", i: "mmuster" }, "A clean import, accents and the order of given names, A file named after a username");
    assert.deepEqual(ambiguous.map(({ key, candidates }) => [key, candidates.map((candidate) => candidate.username).sort()]), [["c", ["jhuber1", "jhuber2"]]], "Two students with the same name");
    assert.deepEqual(unmatched.map(({ key }) => key).sort(), ["d", "f", "g", "h"], "A student the directory does not know, A teacher in the directory, a student of another class");
    assert.equal(keyOf(() => matchPhotos(null, [])), "exam.errors.photos.directoryNotReady");
    assert.equal(keyOf(() => matchPhotos(people, [{ key: "x" }, { key: "x" }])), "exam.errors.photos.entries", "a key twice");
  });
});

describe("the photos held", () => {
  test("A student has left the school; Deleting a class's photos; all of them", () => {
    const db = database();
    for (const username of ["mmuster", "abrunner", "kkern", "gone1", "gone2"]) storePhoto(db, username, jpeg(134, 200), "admin1");
    const summary = photoSummary(db, people);
    assert.equal(summary.total, 5);
    assert.deepEqual(summary.classes, [{ name: "4bhif", photos: 1 }, { name: "5ahif", photos: 2 }]);
    assert.deepEqual(summary.withoutPerson, ["gone1", "gone2"]);
    assert.equal(photoSummary(db, null).withoutPerson, null, "no directory, no list of photos without a person");
    assert.equal(keyOf(() => deletePhotos(db, people, { scope: "withoutPerson", expected: 1 })), "exam.errors.photos.countChanged", "a number that no longer fits deletes nothing");
    assert.equal(keyOf(() => deletePhotos(db, null, { scope: "withoutPerson", expected: 2 })), "exam.errors.photos.directoryNotReady");
    assert.deepEqual(deletePhotos(db, people, { scope: "withoutPerson", expected: 2 }), { deleted: 2 });
    assert.equal(readPhoto(db, "gone1"), null);
    assert.deepEqual(deletePhotos(db, people, { scope: "class", className: "5AHIF", expected: 2 }), { deleted: 2 });
    assert.equal(readPhoto(db, "mmuster"), null);
    assert.ok(readPhoto(db, "kkern"), "the photos of other classes are unchanged");
    assert.deepEqual(deletePhotos(db, people, { scope: "all", expected: 1 }), { deleted: 1 });
    assert.equal(photoSummary(db, people).total, 0);
  });

  test("the version per row: only existing photos, a null row stays null", () => {
    const db = database();
    storePhoto(db, "mmuster", jpeg(134, 200), "admin1", "2026-11-27T18:00:00.000Z");
    const rows = withPhotoVersions(db, [{ username: "mmuster" }, { username: "kkern" }, null]);
    assert.equal(typeof rows[0].photo, "string");
    assert.equal(rows[1].photo, null);
    assert.equal(rows[2], null);
  });
});

/**
 * A local app around a router, every request as the session `X-As` names
 * with the roles `X-Role` lists (comma-separated), as the token and the
 * directory groups would carry them. `X-View: student` is a teacher in
 * student view.
 */
async function serve(router) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const username = req.get("X-As");
    req.user = {
      name: username,
      preferred_username: username,
      // The preferences mock below reads the student view from the token.
      accessToken: req.get("X-View") === "student" ? "access-token-student-view" : "access-token",
      accessTokenDecoded: { preferred_username: username, exp: Date.now() / 1000 + 3600 },
      keycloakConfig: { "auth-server-url": "https://identity.example/", realm: "demo", resource: "safelearn" },
      rolesCalculated: JSON.stringify(Object.fromEntries((req.get("X-Role") ?? "").split(",").filter(Boolean).map((role) => [role, true]))),
    };
    next();
  });
  app.use("/exam", router);
  app.use((req, res) => res.status(404).send("UNMATCHED"));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return { base: `http://127.0.0.1:${server.address().port}/exam`, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Each request's stored preferences: student view (`vt` 0) for the token of a session that asks for it. */
function preferencesFetch(saved) {
  return async (url, init) => {
    if (String(url).startsWith("http://127.0.0.1")) return saved(url, init);
    const studentView = String(init?.headers?.Authorization ?? "").includes("student-view");
    return { ok: true, json: async () => ({ attributes: { config: [JSON.stringify({ vt: studentView ? 0 : 1 })] } }) };
  };
}

describe("the photo routes", () => {
  test("who receives a photo, and who imports", async () => {
    const db = database();
    const router = express.Router();
    const handle = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);
    registerPhotoRoutes(router, { db, handle, startPage: () => "/index.html", directory: () => ({ configured: true, people }) });
    router.use((error, req, res, next) => {
      const status = error.constructor.name === "InvalidInputError" ? 400 : error.constructor.name === "ConflictError" ? 409 : 500;
      res.status(status).json({ error: error.message });
    });
    storePhoto(db, "mmuster", jpeg(134, 200), "admin1");
    // `someone` is entered in 5ahif, whose roster holds mmuster and abrunner, who has no photo;
    // kkern is on the roster of 4bhif only, and `stranger` is entered in no class (class-bound-teachers D4).
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const own = createClass(db, year.id, { name: "5ahif", students: [{ username: "mmuster" }, { username: "abrunner" }] });
    createClass(db, year.id, { name: "4bhif", students: [{ username: "kkern" }] });
    enterTeacher(db, own.id, "someone");
    const saved = global.fetch;
    global.fetch = preferencesFetch(saved);
    const app = await serve(router);
    try {
      const ask = async (url, roles, init = {}, as = "someone") => {
        const answer = await saved(`${app.base}${url}`, { ...init, headers: { "X-As": as, "X-Role": roles, ...(init.headers ?? {}) } });
        return { status: answer.status, headers: answer.headers, bytes: Buffer.from(await answer.arrayBuffer()) };
      };
      const granted = await ask("/photos/mmuster?v=1", "teacher,student-images");
      assert.equal(granted.status, 200, "A teacher with the role requests a photo of their own class");
      assert.ok(granted.headers.get("cache-control").includes("private"));
      assert.ok(granted.headers.get("cache-control").includes("immutable"));
      assert.equal(granted.headers.get("content-type"), "image/jpeg");
      assert.ok(granted.bytes.equals(jpeg(134, 200)));
      for (const [roles, scenario] of [
        ["teacher", "A teacher without the role requests a photo"],
        ["teacher,admin", "An admin without the role requests a photo"],
        ["student", "A student requests a photo"],
      ]) {
        const refused = await ask("/photos/mmuster", roles);
        assert.equal(refused.status, 403, scenario);
        assert.ok(!refused.bytes.includes(jpeg(134, 200)), `${scenario}: no image data`);
      }
      assert.equal((await ask("/photos/mmuster", "student", {}, "mmuster")).status, 403, "their own photo included");
      assert.equal((await ask("/photos/abrunner", "teacher,student-images")).status, 404, "A student of their own class without a photo");
      const foreign = await ask("/photos/mmuster", "teacher,student-images", {}, "stranger");
      assert.equal(foreign.status, 404, "A teacher with the role requests a photo of another class");
      assert.ok(!foreign.bytes.includes(jpeg(134, 200)), "no image data for another class");
      assert.equal((await ask("/photos/mmuster", "teacher,admin,student-images", {}, "stranger")).status, 200, "An admin with the role requests any photo, entered in no class");
      assert.equal((await ask("/photos/mmuster", "teacher,admin", {}, "stranger")).status, 403, "An admin without the role is still refused");
      db.prepare("UPDATE roster_entry SET left_at = ? WHERE username = 'mmuster'").run("2026-11-28T08:00:00.000Z");
      assert.equal((await ask("/photos/mmuster", "teacher,student-images")).status, 200, "a roster entry marked as left counts");
      assert.equal((await ask("/photos/mmuster", "teacher,student-images", { headers: { "X-View": "student" } })).status, 200, "a teacher in student view holding the role: the role alone decides");
      assert.equal((await ask("/photos/mmuster", "teacher", { headers: { "X-View": "student" } })).status, 403, "a teacher in student view without it");
      const admin = "teacher,admin,student-images";
      assert.equal((await ask("/api/photos/summary", admin, { headers: { "X-View": "student" } })).status, 403, "an admin in student view does not import");

      const put = (username, roles, body = jpeg(134, 200)) => ask(`/api/photos/${username}`, roles, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body });
      const match = (roles) =>
        ask("/api/photos/match", roles, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [{ key: "a", file: "kkern.jpg" }] }) });
      for (const [roles, scenario] of [
        ["teacher,student-images", "A teacher who is no admin"],
        ["teacher,admin", "An admin without the role"],
      ]) {
        assert.equal((await put("kkern", roles)).status, 403, `${scenario}: storing`);
        assert.equal((await match(roles)).status, 403, `${scenario}: matching`);
        assert.equal((await ask("/api/photos/summary", roles)).status, 403, `${scenario}: the summary`);
        assert.equal((await ask("/api/photos/delete", roles, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "all", expected: 1 }) })).status, 403, `${scenario}: deleting`);
        assert.equal((await ask("/photos", roles)).status, 404, `${scenario}: the page is a path with nothing behind it`);
      }
      assert.equal(readPhoto(db, "kkern"), null, "nothing was stored by a refused session");
      const matched = JSON.parse((await match(admin)).bytes.toString());
      assert.deepEqual(matched.matched.map(({ person: found }) => found.username), ["kkern"]);
      assert.equal((await put("kkern", admin)).status, 200, "an admin with the role stores");
      assert.equal((await ask("/photos/kkern", "teacher,admin,student-images")).status, 200, "the stored photo, to an admin");
      assert.equal(readPhoto(db, "kkern").importedBy, "someone");
      assert.equal((await put("kkern", admin, Buffer.from("not an image"))).status, 400, "A file that is not an image is refused");
      assert.equal((await put("tlehrer", admin)).status, 400, "no photo for a teacher");
      assert.equal((await put("nobody", admin)).status, 400, "no photo for a username the directory does not hold");
      const summary = JSON.parse((await ask("/api/photos/summary", admin)).bytes.toString());
      assert.deepEqual([summary.directory, summary.total], ["ready", 2]);
      const deleted = await ask("/api/photos/delete", admin, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "class", className: "4bhif", expected: 1 }) });
      assert.equal(deleted.status, 200);
      assert.equal((await ask("/photos/kkern", "teacher,student-images")).status, 404, "kkern is of another class than someone's");
    } finally {
      await app.close();
      global.fetch = saved;
    }
  });
});

describe("the lists carry a version per row", () => {
  test("sheet, student page, live view and correction table, for the role only", async () => {
    const dbPath = temporaryPath();
    const savedEnv = { path: process.env.EXAM_DB_PATH, periods: process.env.SCHOOL_PERIODS };
    process.env.EXAM_DB_PATH = dbPath;
    delete process.env.SCHOOL_PERIODS;
    const saved = global.fetch;
    const started = await init({ startPage: () => "/index.html", renderHandout: async () => "" });
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const klass = createClass(db, year.id, { name: "5ahif", students: [{ username: "mmuster" }, { username: "kkern" }] });
    enterTeacher(db, klass.id);
    const course = createCourse(db, klass.id, { subject: "POS", language: "de" });
    const column = createColumn(db, course.id, { kind: "test", name: "SA1", date: "2026-11-03", maxPoints: 24 });
    setResult(db, column.id, "mmuster", { points: 17 });
    const category = db.prepare("INSERT INTO question_category (parent_id, name_de, name_en, position) VALUES (NULL, 'K', 'K', 0) RETURNING id").get().id;
    const free = createQuestion(db, { categoryId: category, type: "freetext", nameDe: "F", nameEn: "F", textDe: "<p>F</p>", textEn: "<p>F</p>", solutionDe: "<p>S</p>", solutionEn: "<p>S</p>", answers: [] }).question.id;
    const test = createOfflineTest(db, course.id, { name: "Quickie", durationMinutes: 15, gradebookKind: "shorttest", questionIds: [free] });
    const sitting = createSitting(db, test.id, { opensAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    startSitting(db, sitting.id);
    storePhoto(db, "mmuster", jpeg(134, 200), "admin1", "2026-11-27T18:00:00.000Z");
    global.fetch = preferencesFetch(saved);
    const app = await serve(started.router);
    try {
      const ask = async (url, roles) => {
        const answer = await saved(`${app.base}/api${url}`, { headers: { "X-As": "tdent", "X-Role": roles } });
        assert.equal(answer.status, 200, `${url} as ${roles}`);
        return answer.text();
      };
      const lists = async (roles) => {
        const sheet = JSON.parse(await ask(`/courses/${course.id}/gradebook?semester=ws`, roles));
        const student = JSON.parse(await ask(`/courses/${course.id}/students/mmuster`, roles));
        const live = JSON.parse(await ask(`/sittings/${sitting.id}/live`, roles));
        const screen = JSON.parse(await ask(`/sittings/${sitting.id}/live?screen=1`, roles));
        const grades = JSON.parse(await ask(`/tests/${test.id}/grades`, roles));
        const photoOf = (rows, username) => rows.find((row) => row.username === username)?.photo;
        return {
          sheet: [photoOf(sheet.students, "mmuster"), photoOf(sheet.students, "kkern")],
          student: student.student.photo,
          live: [photoOf(live.participants, "mmuster"), photoOf(live.participants, "kkern")],
          screen: screen.participants.some((row) => "photo" in row),
          grades: [photoOf(grades.rows, "mmuster"), photoOf(grades.rows, "kkern")],
          raw: JSON.stringify([sheet, student, live, grades]),
        };
      };
      const shown = await lists("teacher,student-images");
      const version = readPhoto(db, "mmuster").version;
      assert.deepEqual(shown.sheet, [version, null], "The sheet of a class with photos: the version, null without a photo");
      assert.equal(shown.student, version, "the student page's heading");
      assert.deepEqual(shown.live, [version, null], "the live view of an offline sitting");
      assert.equal(shown.screen, false, "the class's screen carries no photo");
      assert.deepEqual(shown.grades, [version, null], "the correction table");
      assert.ok(!shown.raw.includes("base64") && !shown.raw.includes("/9j/"), "no payload carries image data");

      const hidden = await lists("teacher");
      assert.ok(!hidden.raw.includes('"photo"'), "A teacher without the role opens the sheet: no row says a photo exists");

      storePhoto(db, "mmuster", png(134, 200), "admin1", "2026-11-28T09:00:00.000Z");
      const again = await lists("teacher,student-images");
      assert.notEqual(again.sheet[0], version, "A photo is replaced: the version changes");
      assert.equal(again.live[0], again.sheet[0]);
    } finally {
      await app.close();
      global.fetch = saved;
      if (savedEnv.path === undefined) delete process.env.EXAM_DB_PATH;
      else process.env.EXAM_DB_PATH = savedEnv.path;
      if (savedEnv.periods !== undefined) process.env.SCHOOL_PERIODS = savedEnv.periods;
    }
  });
});
