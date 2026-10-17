/**
 * Copies of the exam database, written with `VACUUM INTO`: a consistent
 * snapshot that opens as a database on its own, taken without stopping writers.
 *
 * Two kinds, told apart by name, in `exam-backups/` beside the database:
 *
 *   exam-daily-<stamp>.sqlite        once a day while the module runs; the
 *                                    newest `dailyCopiesKept` are kept
 *   exam-pre-v<N>-<stamp>.sqlite     before a migration away from version N;
 *                                    kept for `preMigrationRetentionMs`
 *
 * Beside the database rather than at a fixed `data/exam-backups/`, so a
 * database the harness creates in a temporary directory takes its copies with
 * it when that directory is removed.
 */

import fs from "node:fs";
import path from "node:path";

export const dailyCopiesKept = 14;
export const preMigrationRetentionMs = 90 * 24 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export function backupDirectory(dbPath) {
  return path.join(path.dirname(dbPath), "exam-backups");
}

/** A timestamp that sorts as text and is valid in a file name on every system. */
function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function quoteSqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function writeCopy(db, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  db.exec(`VACUUM INTO ${quoteSqlString(target)}`);
  return target;
}

export function backupBeforeMigration(db, dbPath, version, now = new Date()) {
  return writeCopy(db, path.join(backupDirectory(dbPath), `exam-pre-v${version}-${stamp(now)}.sqlite`));
}

export function backupDaily(db, dbPath, now = new Date()) {
  const written = writeCopy(db, path.join(backupDirectory(dbPath), `exam-daily-${stamp(now)}.sqlite`));
  pruneBackups(dbPath, now);
  return written;
}

/**
 * Removes daily copies beyond the newest `dailyCopiesKept` and pre-migration
 * copies older than `preMigrationRetentionMs`. A file in the directory that
 * matches neither name is not ours and is left alone.
 */
export function pruneBackups(dbPath, now = new Date()) {
  const dir = backupDirectory(dbPath);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const removed = [];
  const remove = (name) => {
    fs.rmSync(path.join(dir, name), { force: true });
    removed.push(name);
  };

  const daily = names.filter((name) => /^exam-daily-.+\.sqlite$/.test(name)).sort();
  for (const name of daily.slice(0, Math.max(0, daily.length - dailyCopiesKept))) {
    remove(name);
  }

  for (const name of names.filter((name) => /^exam-pre-v\d+-.+\.sqlite$/.test(name))) {
    const { mtimeMs } = fs.statSync(path.join(dir, name));
    if (now.getTime() - mtimeMs > preMigrationRetentionMs) {
      remove(name);
    }
  }
  return removed;
}

/** When the newest daily copy was written, or null if there is none. */
function newestDailyCopy(dbPath) {
  try {
    const times = fs
      .readdirSync(backupDirectory(dbPath))
      .filter((name) => /^exam-daily-.+\.sqlite$/.test(name))
      .map((name) => fs.statSync(path.join(backupDirectory(dbPath), name)).mtimeMs);
    return times.length > 0 ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

/**
 * Takes a daily copy now if the newest one is a day old or missing, and then
 * once a day. A failing copy is logged and tried again the next day; it never
 * disables the module. The timer does not keep the process alive.
 */
export function scheduleDailyBackups(db, dbPath) {
  const run = () => {
    try {
      backupDaily(db, dbPath);
    } catch (error) {
      console.error(`[exam] Daily backup failed: ${error.message}`);
    }
  };
  const newest = newestDailyCopy(dbPath);
  if (newest === null || Date.now() - newest >= dayMs) {
    run();
  }
  const timer = setInterval(run, dayMs);
  timer.unref();
  return timer;
}
