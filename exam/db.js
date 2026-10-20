/**
 * The exam module's database: one SQLite file, opened through `node:sqlite`.
 *
 * Plain SQL and no ORM, so a later move to another database means changing the
 * dialect rather than rewriting the module. `DatabaseSync` is synchronous; at
 * one school's scale a single-row write takes microseconds, which the event
 * loop does not notice (design.md, D2).
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

import { backupBeforeMigration } from "./backup.js";

const migrationsDir = path.join(import.meta.dirname, "migrations");

/**
 * Where the database lives: `data/exam.sqlite` beside the directory cache, on
 * the volume a deployment mounts at `/app/data`. `EXAM_DB_PATH` exists for the
 * verification harness, which points every run at a database of its own; a
 * deployment does not set it (`test/deployment-config.test.js` says so).
 */
export function databasePath() {
  const configured = process.env.EXAM_DB_PATH;
  return configured ? configured : path.join("data", "exam.sqlite");
}

/**
 * The numbered migrations, in the order they apply. A file is named
 * `NNN-what.sql`, and its number is the schema version it brings the database
 * to, so the files have to count up from 1 without a gap.
 */
export function readMigrations(dir = migrationsDir) {
  const migrations = fs
    .readdirSync(dir)
    .filter((name) => /^\d{3}-[a-z0-9-]+\.sql$/.test(name))
    .sort()
    .map((name) => ({
      version: Number(name.slice(0, 3)),
      name,
      sql: fs.readFileSync(path.join(dir, name), "utf8"),
    }));
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migration ${migration.name} should carry number ${index + 1}: migrations count up from 1 without a gap.`
      );
    }
  });
  return migrations;
}

export function schemaVersion(db) {
  return db.prepare("PRAGMA user_version").get().user_version;
}

/**
 * Brings `db` up to the newest migration, one transaction per file. A file that
 * fails is rolled back on its own, so the database stays at the last version
 * that applied completely, and the error is passed on.
 *
 * Before the first pending migration runs, a copy of the database at its old
 * version is written (`backupBeforeMigration`). A brand-new, empty database has
 * nothing to keep and gets no copy.
 */
export function migrate(db, dbPath, migrations = readMigrations()) {
  const target = migrations.length;
  const current = schemaVersion(db);
  if (current > target) {
    throw new NewerSchemaError(current, target);
  }
  const pending = migrations.filter((migration) => migration.version > current);
  if (pending.length === 0) {
    return { from: current, to: current };
  }
  if (current > 0) {
    backupBeforeMigration(db, dbPath, current);
  }
  for (const migration of pending) {
    if (foreignKeysOff(migration)) migrateWithoutForeignKeys(db, migration);
    else applyMigration(db, migration);
  }
  return { from: current, to: target };
}

/**
 * Whether a migration asks to run with foreign keys off: its first line is
 * `-- foreign_keys: off`. Only a migration that rebuilds a table needs it
 * (exam-questions-follow-pool design D6).
 */
function foreignKeysOff(migration) {
  return /^-- foreign_keys: off[ \t]*(\r?\n|$)/.test(migration.sql);
}

/** One migration in one transaction; `check` runs last, before the commit. */
function applyMigration(db, migration, check = () => {}) {
  db.exec("BEGIN");
  try {
    db.exec(migration.sql);
    check();
    // PRAGMA takes no bound parameters; the version is a number we produced.
    db.exec(`PRAGMA user_version = ${migration.version}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw new Error(`Migration ${migration.name} failed: ${error.message}`, { cause: error });
  }
}

/**
 * A migration that rebuilds tables, with foreign keys off: SQLite's rebuild
 * drops a table that others reference, which would cascade or fail with them
 * on. The pragma has no effect inside a transaction, so it is set before
 * `BEGIN`. Every reference has to hold again before the commit, or the
 * migration is rolled back; the setting is restored either way.
 */
function migrateWithoutForeignKeys(db, migration) {
  const before = db.prepare("PRAGMA foreign_keys").get().foreign_keys;
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    applyMigration(db, migration, () => {
      const broken = db.prepare("PRAGMA foreign_key_check").all();
      if (broken.length > 0) {
        const tables = [...new Set(broken.map((row) => row.table))].join(", ");
        throw new Error(`${broken.length} broken foreign key reference(s) in ${tables}`);
      }
    });
  } finally {
    db.exec(`PRAGMA foreign_keys = ${before ? "ON" : "OFF"}`);
  }
}

/** A database written by a newer image than this one. It is left untouched. */
export class NewerSchemaError extends Error {
  constructor(found, supported) {
    super(
      `The database is at schema version ${found}, and this image only knows versions up to ${supported}. ` +
        `It was written by a newer image; it is left untouched.`
    );
    this.found = found;
    this.supported = supported;
  }
}

/**
 * Opens the database, creating it and its directory if need be, and migrates
 * it. Throws on anything that keeps the module from running - the caller turns
 * that into "module disabled" and the reader keeps serving.
 *
 * The version is checked before anything is written, so a database from a
 * newer image is opened and closed without a single change to the file.
 */
export function openDatabase(dbPath = databasePath()) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  // Asked up front: SQLite opens an existing file in a read-only directory
  // without complaint and only fails later, at the WAL file or a backup.
  fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
  // Opening a file that does not exist creates it, which on a read-only
  // directory fails here - before any pragma or migration ran.
  const db = new DatabaseSync(dbPath);
  try {
    const supported = readMigrations().length;
    const found = schemaVersion(db);
    if (found > supported) {
      throw new NewerSchemaError(found, supported);
    }
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    const migrated = migrate(db, dbPath);
    return { db, migrated };
  } catch (error) {
    db.close();
    throw error;
  }
}
