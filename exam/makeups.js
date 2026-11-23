/**
 * The participants of make-ups (makeup-for-everyone-not-written design D1,
 * D2): a make-up still ahead is written by everybody on the roster who has
 * not written the test yet, plus the students marked to write it again
 * (`sitting_participant.retake`). Its rows are kept current on every write
 * that can change who has written, and left alone once it has opened
 * (online) or been started (offline), which fixes them.
 *
 * A module of its own, depending on `classes.js` alone, so that the roster
 * writes there and the start-up in `db.js` can call it without importing
 * the tests and attempts.
 */

import { getCourse, inTransaction, NotFoundError, now, rosterOf } from "./classes.js";

function testRow(db, id) {
  const row = db.prepare("SELECT * FROM test WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.tests.noTest");
  return row;
}

/** The usernames on the roster of the test row's class who have not left. */
export function activeRoster(db, test) {
  const course = getCourse(db, test.course_id);
  return rosterOf(db, course.classId)
    .filter((entry) => entry.leftAt === null)
    .map((entry) => entry.username);
}

/**
 * The students who count as having written the test `testId`
 * (makeup-for-everyone-not-written design D1): online, everyone with an
 * attempt of it, running or submitted; offline, everyone marked present in a
 * sitting of it that was started. Whether they are still on the roster is
 * not asked here.
 */
export function writtenOf(db, testId) {
  const test = testRow(db, testId);
  const rows =
    test.kind === "offline"
      ? db
          .prepare(
            `SELECT DISTINCT p.username FROM sitting_participant p JOIN sitting s ON s.id = p.sitting_id
             WHERE s.test_id = ? AND s.started_at IS NOT NULL AND p.present = 1`
          )
          .all(testId)
      : db.prepare("SELECT username FROM attempt WHERE test_id = ?").all(testId);
  return new Set(rows.map((row) => row.username));
}

/**
 * The make-ups of a test still ahead at `at` (design D1): online, those whose
 * start window has not opened; offline, those not started.
 */
function makeupsAhead(db, test, at) {
  return test.kind === "offline"
    ? db.prepare("SELECT * FROM sitting WHERE test_id = ? AND makeup = 1 AND started_at IS NULL").all(test.id)
    : db.prepare("SELECT * FROM sitting WHERE test_id = ? AND makeup = 1 AND opens_at > ?").all(test.id, at);
}

/**
 * Brings the participants of every make-up of the test `testId` still ahead
 * at `at` up to the rule (design D1): everybody on the roster who has not
 * left and has not written the test (`writtenOf`), together with the retakes -
 * rows marked `retake` whose student is on the roster and has written. A
 * retake whose student no longer counts as having written becomes a plain
 * participant. Only the differences are written, so attendance and group of
 * those who stay are kept, and a make-up that is current costs no write. A
 * make-up that has opened or started is never touched, which is what fixes
 * its participants - except the make-up `also`, the one a request has just
 * created or changed, which is filled even when its start window is open
 * already. A test of a closed year has nothing ahead. Called inside the
 * transaction of every write that can change who has written.
 */
export function refreshMakeups(db, testId, at = now(), { also = null } = {}) {
  const test = testRow(db, testId);
  const ahead = makeupsAhead(db, test, at);
  // The make-up just written is filled even if its start window is open already.
  if (also !== null && !ahead.some((sitting) => sitting.id === also)) ahead.push({ id: also });
  if (ahead.length === 0) return;
  if (getCourse(db, test.course_id).year.closed) return;
  const roster = new Set(activeRoster(db, test));
  const written = writtenOf(db, testId);
  const rowsOf = db.prepare("SELECT username, retake FROM sitting_participant WHERE sitting_id = ?");
  const drop = db.prepare("DELETE FROM sitting_participant WHERE sitting_id = ? AND username = ?");
  const take = db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, ?)");
  const plain = db.prepare("UPDATE sitting_participant SET retake = 0 WHERE sitting_id = ? AND username = ?");
  // Whoever has an attempt in the make-up itself stays its participant.
  const inIt = db.prepare("SELECT 1 FROM attempt WHERE sitting_id = ? AND username = ?");
  for (const sitting of ahead) {
    const rows = new Map(rowsOf.all(sitting.id).map((row) => [row.username, row.retake === 1]));
    for (const [username, retake] of rows) {
      if (inIt.get(sitting.id, username)) continue;
      if (!roster.has(username)) drop.run(sitting.id, username);
      else if (written.has(username) && !retake) drop.run(sitting.id, username);
      else if (!written.has(username) && retake) plain.run(sitting.id, username);
    }
    for (const username of roster) {
      if (!written.has(username) && !rows.has(username)) take.run(sitting.id, username);
    }
  }
}

/**
 * Brings every make-up still ahead up to the rule, for every test that has
 * one (design D2, Migration Plan): run once at start-up after migrating, so a
 * make-up planned with chosen students follows the rule from the deployment.
 */
export function refreshAllMakeups(db, at = now()) {
  const tests = db
    .prepare(
      `SELECT DISTINCT s.test_id AS id FROM sitting s JOIN test t ON t.id = s.test_id
       WHERE s.makeup = 1 AND (CASE WHEN t.kind = 'offline' THEN s.started_at IS NULL ELSE s.opens_at > ? END)`
    )
    .all(at);
  inTransaction(db, () => {
    for (const { id } of tests) refreshMakeups(db, id, at);
  });
}

/**
 * Brings the make-ups still ahead of every test of the courses of class
 * `classId` up to the rule: the roster writes of `exam/classes.js` call it,
 * since joining or leaving changes who has not written. Inside a transaction.
 */
export function refreshClassMakeups(db, classId, at = now()) {
  const tests = db
    .prepare(
      `SELECT DISTINCT s.test_id AS id FROM sitting s JOIN test t ON t.id = s.test_id JOIN course c ON c.id = t.course_id
       WHERE c.class_id = ? AND s.makeup = 1`
    )
    .all(classId);
  for (const { id } of tests) refreshMakeups(db, id, at);
}
