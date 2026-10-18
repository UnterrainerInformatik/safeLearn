/**
 * The exam module's foundation, unit by unit: the database file and its
 * migrations, the backups, the teacher/student gate and the embedding hooks.
 *
 * No browser, no login, no server, in the shape of
 * `test/permission-context.test.js`: `fetch` is stubbed for the account lookup
 * that carries the view preferences, and every database lives in a temporary
 * directory created and removed by the check that uses it. The same behaviour
 * against a running instance is `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";

import createDOMPurify from "dompurify";
import express from "express";
import { JSDOM } from "jsdom";

import { backupBeforeMigration, backupDaily, backupDirectory, dailyCopiesKept, preMigrationRetentionMs, pruneBackups } from "../exam/backup.js";
import { NewerSchemaError, migrate, openDatabase, readMigrations, schemaVersion } from "../exam/db.js";
import { identityOf, requireStudent, requireTeacher, teacherPage } from "../exam/gate.js";
import { init } from "../exam/index.js";
import { embedPlaceholder, preReplaceEmbeds, registerEmbedHandler } from "../obsidian.js";

const originalFetch = global.fetch;
const temporaryDirs = [];

afterEach(() => {
  global.fetch = originalFetch;
  for (const dir of temporaryDirs.splice(0)) {
    fs.chmodSync(dir, 0o700);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function temporaryDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-"));
  temporaryDirs.push(dir);
  return dir;
}

/** A migrations directory holding exactly `files`. */
function migrationsWith(files) {
  const dir = temporaryDir();
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

describe("the database file", () => {
  test("a new database is created and brought to the newest schema", () => {
    const dbPath = path.join(temporaryDir(), "nested", "exam.sqlite");
    const { db, migrated } = openDatabase(dbPath);
    try {
      assert.equal(migrated.from, 0);
      assert.equal(migrated.to, readMigrations().length);
      assert.equal(schemaVersion(db), readMigrations().length);
      assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
      assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
      const scale = db.prepare("SELECT grade, min_percent FROM grading_scale ORDER BY grade").all();
      assert.deepEqual(
        scale.map((row) => [row.grade, row.min_percent]),
        [[1, 88], [2, 75], [3, 63], [4, 50], [5, 0]]
      );
    } finally {
      db.close();
    }
  });

  test("a brand-new database gets no pre-migration copy, an older one does", () => {
    const dbPath = path.join(temporaryDir(), "exam.sqlite");
    const migrations = [
      { version: 1, name: "001-a.sql", sql: "CREATE TABLE a (x);" },
      { version: 2, name: "002-b.sql", sql: "CREATE TABLE b (y);" },
    ];
    const db = new DatabaseSync(dbPath);
    try {
      migrate(db, dbPath, migrations.slice(0, 1));
      assert.ok(!fs.existsSync(backupDirectory(dbPath)), "an empty database has nothing to keep");
      db.exec("INSERT INTO a VALUES (42)");

      migrate(db, dbPath, migrations);
      const copies = fs.readdirSync(backupDirectory(dbPath));
      assert.equal(copies.length, 1);
      assert.match(copies[0], /^exam-pre-v1-/);
      const copy = new DatabaseSync(path.join(backupDirectory(dbPath), copies[0]));
      try {
        assert.equal(schemaVersion(copy), 1, "the copy holds the database as it was before");
        assert.equal(copy.prepare("SELECT x FROM a").get().x, 42);
      } finally {
        copy.close();
      }
    } finally {
      db.close();
    }
  });

  test("a failing migration leaves the database at the last version that applied", () => {
    const dbPath = path.join(temporaryDir(), "exam.sqlite");
    const migrations = [
      { version: 1, name: "001-a.sql", sql: "CREATE TABLE a (x);" },
      { version: 2, name: "002-broken.sql", sql: "CREATE TABLE b (y); THIS IS NOT SQL;" },
    ];
    const db = new DatabaseSync(dbPath);
    try {
      assert.throws(() => migrate(db, dbPath, migrations), /002-broken\.sql failed/);
      assert.equal(schemaVersion(db), 1);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      assert.deepEqual(tables.map((row) => row.name), ["a"], "the half of 002 that ran was rolled back");
    } finally {
      db.close();
    }
  });

  test("a database from a newer image is refused and left untouched", () => {
    const dbPath = path.join(temporaryDir(), "exam.sqlite");
    const newer = new DatabaseSync(dbPath);
    newer.exec(`PRAGMA user_version = ${readMigrations().length + 1}`);
    newer.close();
    const before = fs.readFileSync(dbPath);

    assert.throws(
      () => openDatabase(dbPath),
      (error) =>
        error instanceof NewerSchemaError &&
        error.found === readMigrations().length + 1 &&
        error.supported === readMigrations().length &&
        error.message.includes(String(error.found)) &&
        error.message.includes(String(error.supported))
    );
    assert.deepEqual(fs.readFileSync(dbPath), before, "not a byte of the file changed");
    assert.ok(!fs.existsSync(`${dbPath}-wal`), "and no WAL file was started beside it");
  });

  test("a read-only data directory is refused before anything is written", { skip: process.getuid?.() === 0 }, () => {
    const dir = temporaryDir();
    fs.chmodSync(dir, 0o500);
    assert.throws(() => openDatabase(path.join(dir, "exam.sqlite")));
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  test("migration files must count up from 1 without a gap", () => {
    const dir = migrationsWith({ "001-a.sql": "", "003-c.sql": "" });
    assert.throws(() => readMigrations(dir), /003-c\.sql should carry number 2/);
  });
});

describe("the backups", () => {
  test("a daily copy opens as a database on its own", () => {
    const dbPath = path.join(temporaryDir(), "exam.sqlite");
    const { db } = openDatabase(dbPath);
    try {
      db.exec("INSERT INTO student (username) VALUES ('sdent')");
      const copyPath = backupDaily(db, dbPath);
      const copy = new DatabaseSync(copyPath, { readOnly: true });
      try {
        assert.equal(copy.prepare("SELECT username FROM student").get().username, "sdent");
        assert.equal(copy.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      } finally {
        copy.close();
      }
    } finally {
      db.close();
    }
  });

  test("daily copies beyond the retention are removed, oldest first", () => {
    const dbPath = path.join(temporaryDir(), "exam.sqlite");
    const { db } = openDatabase(dbPath);
    try {
      const start = Date.UTC(2026, 9, 1);
      for (let day = 0; day < dailyCopiesKept + 3; day++) {
        backupDaily(db, dbPath, new Date(start + day * 24 * 60 * 60 * 1000));
      }
      const daily = fs.readdirSync(backupDirectory(dbPath)).filter((name) => name.startsWith("exam-daily-")).sort();
      assert.equal(daily.length, dailyCopiesKept);
      assert.match(daily[0], /^exam-daily-2026-10-04/, "the three oldest are the ones that went");
    } finally {
      db.close();
    }
  });

  test("pre-migration copies are kept for their retention and then removed", () => {
    const dbPath = path.join(temporaryDir(), "exam.sqlite");
    const { db } = openDatabase(dbPath);
    try {
      const old = backupBeforeMigration(db, dbPath, 1);
      const recent = backupBeforeMigration(db, dbPath, 2);
      const now = Date.now();
      const longAgo = (now - preMigrationRetentionMs - 60_000) / 1000;
      fs.utimesSync(old, longAgo, longAgo);
      const stranger = path.join(backupDirectory(dbPath), "notes.txt");
      fs.writeFileSync(stranger, "not ours");

      pruneBackups(dbPath, new Date(now));
      assert.ok(!fs.existsSync(old));
      assert.ok(fs.existsSync(recent));
      assert.ok(fs.existsSync(stranger), "a file the module did not write is left alone");
    } finally {
      db.close();
    }
  });
});

// ################### The gate ###################

/** A session as passport leaves it on `req`, with roles as LDAP groups. */
function session(groups, username = "TDent") {
  return {
    user: {
      name: "Some One",
      preferred_username: username.toLowerCase(),
      accessToken: "access-token",
      accessTokenDecoded: { preferred_username: username },
      keycloakConfig: {
        "auth-server-url": "https://identity.example/",
        realm: "demo",
        resource: "safelearn",
      },
      rolesCalculated: JSON.stringify(groups),
    },
  };
}

/** Answers the account lookup with these view preferences. */
function stubPreferences(preferences) {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ attributes: { config: [JSON.stringify(preferences)] } }),
  });
}

/** Runs one middleware and reports how it answered. */
function through(middleware, req) {
  return new Promise((resolve) => {
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json() {
        resolve({ passed: false, status: this.statusCode });
      },
    };
    middleware(req, res, (arg) => resolve({ passed: arg === undefined, next: arg }));
  });
}

describe("the gate", () => {
  test("the identity is the username, lowercased, never the Keycloak id", () => {
    const req = session({ student: true }, "SDent");
    req.user.sub = "0000-1111";
    assert.equal(identityOf(req), "sdent");
    assert.equal(identityOf({ user: { accessTokenDecoded: {} } }), null);
  });

  test("a teacher passes the teacher gate, a student is refused", async () => {
    stubPreferences({ vt: 1 });
    assert.equal((await through(requireTeacher, session({ teacher: true }))).passed, true);
    const refused = await through(requireTeacher, session({ student: true }));
    assert.deepEqual(refused, { passed: false, status: 403 });
  });

  test("an admin passes the teacher gate", async () => {
    stubPreferences({ vt: 1 });
    assert.equal((await through(requireTeacher, session({ admin: true }))).passed, true);
  });

  test("a teacher in student view is refused teacher actions and passes the student gate", async () => {
    stubPreferences({ vt: 0 });
    assert.deepEqual(await through(requireTeacher, session({ teacher: true })), { passed: false, status: 403 });
    assert.equal((await through(requireStudent, session({ teacher: true }))).passed, true);
  });

  test("switching back to the teacher view restores the teacher gate", async () => {
    stubPreferences({ vt: 0 });
    assert.equal((await through(requireTeacher, session({ teacher: true }))).passed, false);
    // A new request rebuilds the role set from the preferences it finds.
    stubPreferences({ vt: 1 });
    assert.equal((await through(requireTeacher, session({ teacher: true }))).passed, true);
    assert.deepEqual(await through(requireStudent, session({ teacher: true })), { passed: false, status: 403 });
  });

  test("a student passes the student gate", async () => {
    stubPreferences({ vt: 1 });
    assert.equal((await through(requireStudent, session({ student: true }))).passed, true);
  });

  test("a module page refused to a student leaves the router instead of answering", async () => {
    stubPreferences({ vt: 1 });
    assert.deepEqual(await through(teacherPage, session({ student: true })), { passed: false, next: "router" });
    assert.equal((await through(teacherPage, session({ teacher: true }))).passed, true);
  });
});

// ################### Embedding ###################

const DOMPurify = createDOMPurify(new JSDOM("").window);

describe("the embedding hooks", () => {
  test("a page without a block is returned unchanged and asks nothing", async () => {
    let asked = 0;
    global.fetch = async () => {
      asked += 1;
      return { ok: true, json: async () => ({}) };
    };
    const md = "# Title\n\n```js\nconst a = 1;\n```\n";
    assert.equal(await preReplaceEmbeds(md, session({ teacher: true })), md);
    assert.equal(asked, 0);
  });

  test("with no handler, a known kind is a notice for a teacher and nothing for a student", async () => {
    stubPreferences({ vt: 1 });
    const md = "before\n\n```safelearn-results\ncourse: 4ahif-wmc\n```\n\nafter";
    const asTeacher = await preReplaceEmbeds(md, session({ teacher: true }));
    assert.match(asTeacher, /class="sl-embed-notice"/);
    assert.ok(!asTeacher.includes("course: 4ahif-wmc"), "the block's source is gone");
    const asStudent = await preReplaceEmbeds(md, session({ student: true }));
    assert.ok(!asStudent.includes("sl-embed"));
    assert.ok(!asStudent.includes("safelearn-results"));
    assert.match(asStudent, /before\n[\s\S]*after/);
  });

  test("a teacher in student view gets what a student gets", async () => {
    stubPreferences({ vt: 0 });
    const md = "```safelearn-gradebook\ncourse: x\n```";
    assert.equal((await preReplaceEmbeds(md, session({ teacher: true }))).trim(), "");
  });

  test("an unknown kind renders nothing, even for a teacher", async () => {
    stubPreferences({ vt: 1 });
    const md = "```safelearn-foo\na: b\n```";
    assert.equal((await preReplaceEmbeds(md, session({ teacher: true }))).trim(), "");
  });

  test("a block written inside a longer fence stays text", async () => {
    stubPreferences({ vt: 1 });
    const md = "````md\n```safelearn-test\ntest: example\n```\n````";
    assert.equal(await preReplaceEmbeds(md, session({ teacher: true })), md);
  });

  test("a registered handler receives the parameters and its placeholder survives sanitizing", async () => {
    stubPreferences({ vt: 1 });
    let received = null;
    registerEmbedHandler("live", async (params) => {
      received = params;
      return embedPlaceholder("live", params);
    });
    try {
      const md = '```safelearn-live\nSitting: 7\nnote: a "quoted" <b>value</b> & more\nnot a parameter line\n```';
      const replaced = await preReplaceEmbeds(md, session({ teacher: true }));
      assert.deepEqual(received, { sitting: "7", note: 'a "quoted" <b>value</b> & more' });

      const sanitized = DOMPurify.sanitize(replaced);
      const placeholder = new JSDOM(sanitized).window.document.querySelector(".sl-embed");
      assert.ok(placeholder, "the placeholder survives DOMPurify");
      assert.equal(placeholder.dataset.slEmbed, "live");
      assert.equal(placeholder.dataset.slSitting, "7");
      assert.equal(placeholder.dataset.slNote, 'a "quoted" <b>value</b> & more');
      assert.equal(placeholder.querySelector("b"), null, "a value never becomes markup");

      const deck = await preReplaceEmbeds(md, session({ teacher: true }), { defaultsOnly: true });
      assert.ok(!deck.includes('class="sl-embed"'), "the presentation and document views use the defaults");
      assert.match(deck, /sl-embed-notice/);
    } finally {
      registerEmbedHandler("live", undefined);
    }
  });
});

// ################### Start-up and failure ###################

describe("starting the module", () => {
  const originalDbPath = process.env.EXAM_DB_PATH;
  const originalPeriods = process.env.SCHOOL_PERIODS;
  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.EXAM_DB_PATH;
    else process.env.EXAM_DB_PATH = originalDbPath;
    if (originalPeriods === undefined) delete process.env.SCHOOL_PERIODS;
    else process.env.SCHOOL_PERIODS = originalPeriods;
  });

  test("a malformed SCHOOL_PERIODS disables the module with the entry named, before the database is opened", async () => {
    const dir = temporaryDir();
    process.env.EXAM_DB_PATH = path.join(dir, "exam.sqlite");
    process.env.SCHOOL_PERIODS = "1=08:00-08:50,2=08:45-09:35";
    const started = await init({ startPage: () => "/index.html" });
    assert.equal(started.active, false);
    assert.match(started.reason, /^SCHOOL_PERIODS: period 2 \("2=08:45-09:35"\) overlaps period 1/);
    assert.equal(fs.existsSync(process.env.EXAM_DB_PATH), false, "no database is created");
  });

  test("a database that cannot be opened disables the module with a reason", { skip: process.getuid?.() === 0 }, async () => {
    const dir = temporaryDir();
    fs.chmodSync(dir, 0o500);
    process.env.EXAM_DB_PATH = path.join(dir, "exam.sqlite");
    const started = await init({ startPage: () => "/index.html" });
    assert.equal(started.active, false);
    assert.match(started.reason, /could not be opened/);
    assert.ok(started.reason.includes(process.env.EXAM_DB_PATH), "the reason names the database");
  });

  test("a module request that throws fails alone with a server error", async () => {
    process.env.EXAM_DB_PATH = path.join(temporaryDir(), "exam.sqlite");
    delete process.env.SCHOOL_PERIODS;
    const started = await init({ startPage: () => "/index.html" });
    assert.equal(started.active, true);

    const app = express();
    app.use((req, res, next) => {
      // A session whose user object breaks on first touch: the module's own
      // handler for /api/me is the first thing that reads it.
      if (req.get("X-Break") === "1") {
        Object.defineProperty(req, "user", {
          get() {
            throw new Error("broken on purpose");
          },
        });
      } else {
        req.user = session({ student: true }, "SDent").user;
      }
      next();
    });
    app.use("/exam", started.router);
    stubPreferences({ vt: 1 });

    const logged = [];
    const originalConsoleError = console.error;
    console.error = (...args) => logged.push(args.map(String).join(" "));
    const server = app.listen(0);
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const broken = await originalFetch(`${base}/exam/api/me`, { headers: { "X-Break": "1" } });
      assert.equal(broken.status, 500);
      assert.ok(logged.some((line) => line.includes("broken on purpose")), "the failure is logged");

      const next = await originalFetch(`${base}/exam/api/me`);
      assert.equal(next.status, 200, "the next request is answered as if nothing happened");
      assert.deepEqual(await next.json(), { username: "sdent", teacher: false, admin: false, periods: [] });
    } finally {
      console.error = originalConsoleError;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
