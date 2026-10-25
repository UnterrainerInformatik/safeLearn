/**
 * The changes of running sittings, for the teacher's live view (`online-test`,
 * exam-online-tests design D7): an in-process emitter keyed by sitting, fed by
 * the write paths of the attempts and by the sweep. Nothing polls the database
 * for changes; a listener hears of every change as it is written.
 *
 * An event names the participant and what happened - started, saved (with the
 * remaining time only), submitted, away, back, refused device, released,
 * bound to the next browser after a release -
 * never an answer. An offline sitting (`offline-test`) has no attempts: its
 * events are the window's and the attendance's.
 */

import { EventEmitter } from "node:events";

import { getCourse, NotFoundError, now } from "./classes.js";
import { sittingState } from "./tests.js";
import { handoutsOf } from "./handout.js";
import { browserLabel } from "./user-agent.js";

const emitter = new EventEmitter();
// One listener per open live view; a class's teachers are a handful.
emitter.setMaxListeners(0);

/** Tells every live view of `sittingId` that `type` happened to `username`'s attempt. */
export function notify(sittingId, type, username, data = {}) {
  emitter.emit(`sitting:${sittingId}`, { type, username, ...data });
  emitter.emit("tests", { username });
}

/**
 * Tells every student's stream of open tests that a sitting was created,
 * changed or deleted - `username` null, since it may concern anyone on it.
 */
export function notifySittings() {
  emitter.emit("tests", { username: null });
}

/**
 * Calls `listener()` whenever the open tests of `username` may have changed:
 * a sitting written, or one of their own attempts. Answers the function that
 * stops it.
 */
export function listenTests(username, listener) {
  const heard = (event) => {
    if (event.username === null || event.username === username) listener();
  };
  emitter.on("tests", heard);
  return () => emitter.off("tests", heard);
}

/** Calls `listener(event)` for every change of `sittingId`; answers the function that stops it. */
export function listen(sittingId, listener) {
  const name = `sitting:${sittingId}`;
  emitter.on(name, listener);
  return () => emitter.off(name, listener);
}

/**
 * One participant as the live view shows them: not started, writing (with the
 * time left) or submitted; how often and how long they left the page; how
 * many requests from another browser were refused; and which browser the
 * attempt is bound to and which was refused last (exam-live-bound-browser
 * D4) - `boundBrowser` null while the attempt is unbound or there is none,
 * its `full` null for a binding from before browser strings were kept.
 * Never an answer.
 */
function participantFrom(row, attempt, { count: refused, userAgent: refusedAgent }, at, offline = false) {
  // An offline sitting's participant is a row of the attendance table (exam-offline-sittings design D8).
  if (offline) {
    return { username: row.username, givenName: row.given_name, familyName: row.family_name, present: row.present === 1, group: row.handout_group };
  }
  const status = attempt === undefined ? "not started" : attempt.submitted_at !== null ? "submitted" : "writing";
  const awayNow = attempt?.away_since && attempt.submitted_at === null ? Math.max(0, Date.parse(at) - Date.parse(attempt.away_since)) : 0;
  return {
    username: row.username,
    givenName: row.given_name,
    familyName: row.family_name,
    status,
    attemptId: attempt?.id ?? null,
    startedAt: attempt?.started_at ?? null,
    submittedAt: attempt?.submitted_at ?? null,
    remainingMs: status === "writing" ? Math.max(0, Date.parse(attempt.deadline) - Date.parse(at)) : null,
    away: Boolean(attempt?.away_since) && status === "writing",
    focusCount: attempt?.focus_count ?? 0,
    focusMs: (attempt?.focus_ms ?? 0) + awayNow,
    refused,
    bound: attempt ? attempt.device_hash !== null : null,
    boundBrowser: attempt && attempt.device_hash !== null ? browserLabel(attempt.device_user_agent) : null,
    refusedBrowser: refused > 0 && refusedAgent ? browserLabel(refusedAgent) : null,
  };
}

function testKind(db, sitting) {
  return db.prepare("SELECT kind FROM test WHERE id = ?").get(sitting.test_id).kind;
}

function sittingRow(db, sittingId) {
  const sitting = db.prepare("SELECT * FROM sitting WHERE id = ?").get(sittingId);
  if (!sitting) throw new NotFoundError("exam.errors.tests.noSitting");
  return sitting;
}

function participantRows(db, sittingId, username = null) {
  const select = `SELECT p.username, p.present, p.handout_group, s.given_name, s.family_name FROM sitting_participant p JOIN student s ON s.username = p.username
    WHERE p.sitting_id = ?`;
  return username === null
    ? db.prepare(`${select} ORDER BY s.family_name COLLATE NOCASE, s.given_name COLLATE NOCASE, p.username`).all(sittingId)
    : db.prepare(`${select} AND p.username = ?`).all(sittingId, username);
}

const noRefusals = { count: 0, userAgent: null };

/**
 * The refusals of the attempts `where` selects, per username: how many, and
 * the browser string of the latest.
 */
function refusalsOf(db, where, value) {
  const rows = db
    .prepare(
      `SELECT a.username, COUNT(*) AS n,
         (SELECT l.user_agent FROM refused_device l WHERE l.attempt_id = a.id ORDER BY l.at DESC, l.id DESC LIMIT 1) AS latest
       FROM refused_device r JOIN attempt a ON a.id = r.attempt_id ${where} GROUP BY a.id`
    )
    .all(value);
  return new Map(rows.map((row) => [row.username, { count: row.n, userAgent: row.latest }]));
}

/** One participant of a sitting, as `liveSnapshot` lists them; null for somebody who is not one. */
export function liveParticipant(db, sittingId, username, at = now()) {
  const sitting = sittingRow(db, sittingId);
  const [row] = participantRows(db, sittingId, username);
  if (!row) return null;
  if (testKind(db, sitting) === "offline") return participantFrom(row, undefined, noRefusals, at, true);
  const attempt = db.prepare("SELECT * FROM attempt WHERE test_id = ? AND username = ?").get(sitting.test_id, username);
  const refused = attempt ? refusalsOf(db, "WHERE r.attempt_id = ?", attempt.id).get(username) : undefined;
  return participantFrom(row, attempt, refused ?? noRefusals, at);
}

/**
 * A sitting as its live view shows it: the server's clock, the test, the
 * window, its state, and every participant.
 */
export function liveSnapshot(db, sittingId, at = now()) {
  const sitting = sittingRow(db, sittingId);
  const test = db.prepare("SELECT id, name, course_id, kind, handout_a, handout_b FROM test WHERE id = ?").get(sitting.test_id);
  const offline = test.kind === "offline";
  const course = getCourse(db, test.course_id);
  const attempts = new Map(db.prepare("SELECT * FROM attempt WHERE test_id = ?").all(test.id).map((attempt) => [attempt.username, attempt]));
  const refused = refusalsOf(db, "WHERE a.test_id = ?", test.id);
  return {
    serverTime: at,
    sitting: {
      id: sitting.id,
      opensAt: sitting.opens_at,
      closesAt: sitting.closes_at,
      durationS: sitting.duration_s,
      makeup: sitting.makeup === 1,
      startedAt: sitting.started_at,
      state: sittingState({ opensAt: sitting.opens_at, closesAt: sitting.closes_at, offline, startedAt: sitting.started_at }, at),
    },
    kind: test.kind,
    test: { id: test.id, name: test.name, kind: test.kind, handouts: offline ? handoutsOf(test) : [] },
    course: { id: course.id, subject: course.subject, language: course.language, className: course.className },
    participants: participantRows(db, sittingId).map((row) =>
      participantFrom(row, attempts.get(row.username), refused.get(row.username) ?? noRefusals, at, offline)
    ),
  };
}
