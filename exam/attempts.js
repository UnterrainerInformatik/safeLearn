/**
 * Attempts at online tests (`online-test`, exam-online-tests design D5, D6):
 * what a student has open, starting and resuming an attempt, the writing
 * page's payload, saving answers, submitting, finalizing at the deadline,
 * binding an attempt to one browser, and the focus log.
 *
 * The server owns everything that decides a grade. The order of questions and
 * answers is shuffled per attempt here, an answer reaches the browser only as
 * a random token valid for this attempt, and no payload carries a correct
 * flag, an original position or an id of the snapshot. The deadline is the
 * server's clock; a request after it changes nothing.
 *
 * Plain SQL over the module's database, synchronous like `DatabaseSync`. The
 * router decides who is asking; every function here that touches an attempt
 * also checks that it is the asker's own.
 */

import crypto from "node:crypto";

import { ConflictError, getCourse, inTransaction, InvalidInputError, isClosedYearError, NotFoundError, now } from "./classes.js";
import { readScale } from "./gradebook.js";
import { gradeFor } from "./grading.js";
import { notify } from "./live.js";

/** A request for an attempt from another browser than the one it is bound to. Answered with 409. */
export class DeviceRefusedError extends ConflictError {
  constructor() {
    super("exam.errors.attempts.otherBrowser");
  }
}

/** The SHA-256 of a device secret, as the attempt keeps it. */
function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest("hex");
}

/** The longest browser string kept; an attacker-sized header must not bloat the database. */
const userAgentLimit = 512;

/** A request's browser string as it is kept: cut to the limit, null when there is none. */
export function keptUserAgent(value) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, userAgentLimit) : null;
}

/** A new random secret or token: 128 bits, URL-safe. */
function randomToken() {
  return crypto.randomBytes(16).toString("base64url");
}

/** `items` in a random order (Fisher–Yates with `crypto.randomInt`). A new array. */
export function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** The earlier of two ISO timestamps. */
function earlier(a, b) {
  return a < b ? a : b;
}

function msBetween(from, to) {
  return Date.parse(to) - Date.parse(from);
}

// ---------------------------------------------------------- finalization

/**
 * Scores an attempt: a question counts 1 when the set of chosen answers is
 * exactly the set of correct ones, 0 otherwise.
 */
export function scoreAttempt(db, attemptId) {
  const questions = db.prepare("SELECT test_question_id AS id FROM attempt_question WHERE attempt_id = ?").all(attemptId);
  const correctOf = db.prepare("SELECT id FROM test_answer WHERE test_question_id = ? AND correct = 1 ORDER BY id");
  const chosenOf = db.prepare(
    `SELECT r.test_answer_id AS id FROM response r JOIN test_answer a ON a.id = r.test_answer_id
     WHERE r.attempt_id = ? AND a.test_question_id = ? ORDER BY r.test_answer_id`
  );
  let score = 0;
  for (const question of questions) {
    const correct = correctOf.all(question.id).map((row) => row.id);
    const chosen = chosenOf.all(attemptId, question.id).map((row) => row.id);
    if (correct.length === chosen.length && correct.every((id, index) => id === chosen[index])) score += 1;
  }
  return score;
}

/**
 * For each question of a test's snapshot, how many submitted attempts
 * answered it correctly - by the rule `scoreAttempt` applies - out of how many
 * submitted attempts there are. Counts only, never who (`board-solution`).
 */
export function correctShares(db, testId) {
  const submitted = db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE test_id = ? AND submitted_at IS NOT NULL").get(testId).n;
  const correct = new Map();
  const chosenRows = db
    .prepare(
      `SELECT r.attempt_id AS attemptId, a.test_question_id AS questionId, a.id AS answerId
       FROM response r JOIN attempt t ON t.id = r.attempt_id JOIN test_answer a ON a.id = r.test_answer_id
       WHERE t.test_id = ? AND t.submitted_at IS NOT NULL`
    )
    .all(testId);
  const chosen = new Map();
  for (const row of chosenRows) {
    const key = `${row.attemptId}:${row.questionId}`;
    if (!chosen.has(key)) chosen.set(key, new Set());
    chosen.get(key).add(row.answerId);
  }
  const questions = db.prepare("SELECT id FROM test_question WHERE test_id = ?").all(testId);
  const correctOf = db.prepare("SELECT id FROM test_answer WHERE test_question_id = ? AND correct = 1");
  const attempts = db.prepare("SELECT id FROM attempt WHERE test_id = ? AND submitted_at IS NOT NULL").all(testId);
  for (const question of questions) {
    const right = correctOf.all(question.id).map((row) => row.id);
    let count = 0;
    for (const attempt of attempts) {
      const picked = chosen.get(`${attempt.id}:${question.id}`) ?? new Set();
      if (picked.size === right.length && right.every((id) => picked.has(id))) count += 1;
    }
    correct.set(question.id, count);
  }
  return { submitted, correct };
}

/**
 * Submits an attempt at `at`, or at its deadline if that came first: scores
 * it and closes an absence still open. Does nothing to a submitted attempt.
 */
function finalize(db, row, at) {
  if (row.submitted_at !== null) return;
  const submittedAt = earlier(at, row.deadline);
  const away = row.away_since === null ? 0 : Math.max(0, msBetween(row.away_since, submittedAt));
  inTransaction(db, () => {
    const score = scoreAttempt(db, row.id);
    db.prepare("UPDATE attempt SET submitted_at = ?, score = ?, focus_ms = focus_ms + ?, away_since = NULL WHERE id = ? AND submitted_at IS NULL").run(
      submittedAt,
      score,
      away,
      row.id
    );
  });
  notify(row.sitting_id, "submitted", row.username);
}

/**
 * Finalizes every attempt whose deadline has passed at `at` - of `username`
 * only, when given. The sweep runs this for everyone; every request touching
 * a student's attempts runs it for them first. An attempt in a closed school
 * year cannot be written any more; it is logged and skipped, so the others
 * are still finalized (exam-year-change design D2). Answers how many were.
 */
export function finalizeDue(db, at = now(), username = null) {
  const rows =
    username === null
      ? db.prepare("SELECT * FROM attempt WHERE submitted_at IS NULL AND deadline <= ?").all(at)
      : db.prepare("SELECT * FROM attempt WHERE submitted_at IS NULL AND deadline <= ? AND username = ?").all(at, username);
  let finalized = 0;
  for (const row of rows) {
    try {
      finalize(db, row, at);
      finalized += 1;
    } catch (error) {
      if (!isClosedYearError(error)) throw error;
      console.error(`[exam] Attempt ${row.id} is in a closed school year and stays unsubmitted.`);
    }
  }
  return finalized;
}

/**
 * Runs the sweep once now and then every `intervalMs`, so an attempt whose
 * page was closed is submitted at its deadline without any request. Answers
 * the function that stops it.
 */
export function scheduleSweep(db, intervalMs = 30000) {
  const sweep = () => {
    try {
      const finalized = finalizeDue(db);
      if (finalized > 0) console.log(`[exam] Submitted ${finalized} attempt(s) at their deadline.`);
    } catch (error) {
      console.error("[exam] The sweep of due attempts failed:", error);
    }
  };
  sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

// ------------------------------------------------------- what is open

/**
 * The tests `username` can write at `at`: those with a sitting open now that
 * they take part in and that they have not submitted. Each with its course,
 * how long an attempt takes, and the attempt if one is running. `testId`
 * narrows it to one test.
 */
export function openTestsOf(db, username, { at = now(), testId = null } = {}) {
  finalizeDue(db, at, username);
  const rows = db
    .prepare(
      `SELECT t.id AS testId, t.name, t.course_id AS courseId, MAX(s.closes_at) AS closesAt, MIN(s.duration_s) AS durationS
       FROM sitting_participant p
       JOIN sitting s ON s.id = p.sitting_id
       JOIN test t ON t.id = s.test_id
       WHERE p.username = ? AND s.opens_at <= ? AND ? < s.closes_at
         AND NOT EXISTS (SELECT 1 FROM attempt a WHERE a.test_id = t.id AND a.username = p.username AND a.submitted_at IS NOT NULL)
       GROUP BY t.id
       ORDER BY MAX(s.closes_at), t.id`
    )
    .all(username, at, at)
    .filter((row) => testId === null || row.testId === testId);
  const attemptOf = db.prepare("SELECT id, deadline FROM attempt WHERE test_id = ? AND username = ?");
  return rows.map((row) => {
    const course = getCourse(db, row.courseId);
    const attempt = attemptOf.get(row.testId, username);
    return {
      testId: row.testId,
      name: row.name,
      className: course.className,
      subject: course.subject,
      language: course.language,
      closesAt: row.closesAt,
      durationS: row.durationS,
      attempt: attempt ? { attemptId: attempt.id, remainingMs: Math.max(0, msBetween(at, attempt.deadline)) } : null,
    };
  });
}

/**
 * The next moment after `at` at which the open tests of `username` change by
 * time alone: a sitting of theirs opening or closing, or a running attempt
 * of theirs reaching its deadline. Null when nothing lies ahead.
 */
export function nextOpenTestsChange(db, username, at = now()) {
  const row = db
    .prepare(
      `SELECT MIN(t) AS next FROM (
         SELECT s.opens_at AS t FROM sitting s JOIN sitting_participant p ON p.sitting_id = s.id WHERE p.username = ? AND s.opens_at > ?
         UNION ALL
         SELECT s.closes_at FROM sitting s JOIN sitting_participant p ON p.sitting_id = s.id WHERE p.username = ? AND s.closes_at > ?
         UNION ALL
         SELECT deadline FROM attempt WHERE username = ? AND submitted_at IS NULL AND deadline > ?
       )`
    )
    .get(username, at, username, at, username, at);
  return row?.next ?? null;
}

// ------------------------------------------------------------ starting

/**
 * Starts `username`'s attempt at a test, or answers the one they have.
 *
 * A new attempt is written in one transaction: its start, its deadline -
 * the earlier of start plus duration and the end of the sitting's window -
 * the shuffled questions, each question's shuffled answers behind fresh
 * tokens, and the hash of a new device secret, which is answered as `secret`
 * for the browser's cookie. `UNIQUE (test_id, username)` makes a second start
 * of the same attempt impossible, across all sittings.
 */
export function startAttempt(db, username, testId, at = now(), { userAgent = null } = {}) {
  finalizeDue(db, at, username);
  const existing = db.prepare("SELECT * FROM attempt WHERE test_id = ? AND username = ?").get(testId, username);
  if (existing) {
    if (existing.submitted_at !== null) throw new ConflictError("exam.errors.attempts.submittedByYou");
    return { attemptId: existing.id, created: false };
  }
  const sitting = db
    .prepare(
      `SELECT s.* FROM sitting s JOIN sitting_participant p ON p.sitting_id = s.id
       WHERE s.test_id = ? AND p.username = ? AND s.opens_at <= ? AND ? < s.closes_at
       ORDER BY s.closes_at DESC, s.id LIMIT 1`
    )
    .get(testId, username, at, at);
  if (!sitting) throw new NotFoundError("exam.errors.attempts.noOpenTest");
  // A test whose last question was deleted from the pool before it began.
  if (db.prepare("SELECT 1 FROM test_question WHERE test_id = ? LIMIT 1").get(testId) === undefined) {
    throw new ConflictError("exam.errors.attempts.noQuestions");
  }
  const secret = randomToken();
  const attemptId = inTransaction(db, () => {
    const questions = db.prepare("SELECT id FROM test_question WHERE test_id = ? ORDER BY position").all(testId);
    const deadline = earlier(new Date(Date.parse(at) + sitting.duration_s * 1000).toISOString(), sitting.closes_at);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO attempt (test_id, sitting_id, username, started_at, deadline, question_count, device_hash, device_user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(testId, sitting.id, username, at, deadline, questions.length, hashSecret(secret), keptUserAgent(userAgent));
    const id = Number(lastInsertRowid);
    const placeQuestion = db.prepare("INSERT INTO attempt_question (attempt_id, position, test_question_id) VALUES (?, ?, ?)");
    const placeAnswer = db.prepare("INSERT INTO attempt_token (attempt_id, token, test_answer_id, position) VALUES (?, ?, ?, ?)");
    const answersOf = db.prepare("SELECT id FROM test_answer WHERE test_question_id = ? ORDER BY position");
    shuffle(questions).forEach((question, position) => {
      placeQuestion.run(id, position, question.id);
      shuffle(answersOf.all(question.id)).forEach((answer, place) => placeAnswer.run(id, randomToken(), answer.id, place));
    });
    return id;
  });
  notify(sitting.id, "started", username);
  return { attemptId, created: true, secret };
}

// ------------------------------------------------------ one's own attempt

/**
 * `username`'s attempt `id`, finalized first if its deadline has passed. An
 * attempt of somebody else is answered exactly like one that does not exist.
 */
export function ownAttempt(db, id, username, at = now()) {
  const row = db.prepare("SELECT * FROM attempt WHERE id = ? AND username = ?").get(id, username);
  if (!row) throw new NotFoundError("exam.errors.attempts.noAttempt");
  if (row.submitted_at === null && row.deadline <= at) {
    finalize(db, row, at);
    return db.prepare("SELECT * FROM attempt WHERE id = ?").get(id);
  }
  return row;
}

/**
 * Checks that a request for an open attempt comes from the browser bound to
 * it: `secret` is that browser's cookie. An attempt released by the teacher
 * binds to the first browser that asks, which then gets `bound` - a new
 * secret for its cookie. Any other browser is refused, and the refusal is
 * recorded for the live view. `userAgent` is the asking browser's string,
 * kept with a new binding and with a refusal so the teacher sees which
 * browser it was; it never decides anything.
 */
export function checkDevice(db, row, secret, at = now(), { userAgent = null } = {}) {
  if (row.submitted_at !== null) return {};
  if (row.device_hash === null) {
    const fresh = randomToken();
    db.prepare("UPDATE attempt SET device_hash = ?, device_user_agent = ? WHERE id = ?").run(hashSecret(fresh), keptUserAgent(userAgent), row.id);
    notify(row.sitting_id, "bound", row.username);
    return { bound: fresh };
  }
  const given = typeof secret === "string" ? Buffer.from(hashSecret(secret)) : null;
  const kept = Buffer.from(row.device_hash);
  if (given && given.length === kept.length && crypto.timingSafeEqual(given, kept)) return {};
  db.prepare("INSERT INTO refused_device (attempt_id, at, user_agent) VALUES (?, ?, ?)").run(row.id, at, keptUserAgent(userAgent));
  notify(row.sitting_id, "refused", row.username);
  throw new DeviceRefusedError();
}

/** Refuses anything but reading the result once an attempt is submitted or past its deadline. */
function requireOpen(row, at) {
  if (row.submitted_at !== null || row.deadline <= at) {
    throw new ConflictError("exam.errors.attempts.timeUp");
  }
}

/** What a submitted attempt shows its student: points, questions and grade - nothing about the answers. */
export function resultView(db, row) {
  const fraction = row.question_count === 0 ? 0 : row.score / row.question_count;
  return { submitted: true, score: row.score, questionCount: row.question_count, grade: gradeFor(fraction, readScale(db)) };
}

/**
 * The writing page's payload: the questions in the attempt's order, in the
 * course's language, each answer as its text and its token, the tokens chosen
 * so far, and the time left. Nothing else - no correct flag, no original
 * position, no id of the snapshot.
 */
export function writingView(db, row, at = now()) {
  requireOpen(row, at);
  const test = db.prepare("SELECT name, course_id FROM test WHERE id = ?").get(row.test_id);
  const language = getCourse(db, test.course_id).language;
  const text = language === "en" ? "text_en" : "text_de";
  const questions = db
    .prepare(
      `SELECT aq.position, q.id, q.type, q.${text} AS text
       FROM attempt_question aq JOIN test_question q ON q.id = aq.test_question_id
       WHERE aq.attempt_id = ? ORDER BY aq.position`
    )
    .all(row.id);
  const answersOf = db.prepare(
    `SELECT t.token, a.${text} AS text, EXISTS (SELECT 1 FROM response r WHERE r.attempt_id = t.attempt_id AND r.test_answer_id = a.id) AS chosen
     FROM attempt_token t JOIN test_answer a ON a.id = t.test_answer_id
     WHERE t.attempt_id = ? AND a.test_question_id = ? ORDER BY t.position`
  );
  return {
    attempt: row.id,
    name: test.name,
    language,
    remainingMs: msBetween(at, row.deadline),
    questions: questions.map((question) => {
      const answers = answersOf.all(row.id, question.id);
      return {
        n: question.position + 1,
        type: question.type,
        text: question.text,
        answers: answers.map((answer) => ({ token: answer.token, text: answer.text })),
        chosen: answers.filter((answer) => answer.chosen === 1).map((answer) => answer.token),
      };
    }),
  };
}

/**
 * Saves the answers chosen for question `n` (counted from 1 in the attempt's
 * order) as the set of `tokens`, replacing what was saved for it. A question
 * with one correct answer accepts at most one. Refused once the attempt is
 * submitted or its deadline has passed.
 */
export function saveAnswer(db, row, n, tokens, at = now()) {
  requireOpen(row, at);
  if (!Array.isArray(tokens) || !tokens.every((token) => typeof token === "string") || new Set(tokens).size !== tokens.length) {
    throw new InvalidInputError("exam.errors.attempts.answerShape");
  }
  const question = db
    .prepare(
      `SELECT q.id, q.type FROM attempt_question aq JOIN test_question q ON q.id = aq.test_question_id
       WHERE aq.attempt_id = ? AND aq.position = ?`
    )
    .get(row.id, Number(n) - 1);
  if (!question) throw new NotFoundError("exam.errors.attempts.noQuestion");
  if (question.type !== "multichoiceset" && tokens.length > 1) {
    throw new InvalidInputError("exam.errors.attempts.oneAnswer");
  }
  const answerOf = db.prepare(
    `SELECT a.id FROM attempt_token t JOIN test_answer a ON a.id = t.test_answer_id
     WHERE t.attempt_id = ? AND t.token = ? AND a.test_question_id = ?`
  );
  const answerIds = tokens.map((token) => {
    const answer = answerOf.get(row.id, token, question.id);
    if (!answer) throw new InvalidInputError("exam.errors.attempts.notAnAnswer");
    return answer.id;
  });
  inTransaction(db, () => {
    db.prepare(
      "DELETE FROM response WHERE attempt_id = ? AND test_answer_id IN (SELECT id FROM test_answer WHERE test_question_id = ?)"
    ).run(row.id, question.id);
    const choose = db.prepare("INSERT INTO response (attempt_id, test_answer_id) VALUES (?, ?)");
    for (const id of answerIds) choose.run(row.id, id);
  });
  const remainingMs = msBetween(at, row.deadline);
  notify(row.sitting_id, "saved", row.username, { remainingMs });
  return { saved: true, remainingMs };
}

/** Submits an open attempt now, at the student's request. Answers the result. */
export function submitAttempt(db, row, at = now()) {
  requireOpen(row, at);
  finalize(db, row, at);
  return resultView(db, db.prepare("SELECT * FROM attempt WHERE id = ?").get(row.id));
}

/**
 * Records that the writing page lost (`away`) or regained (`back`) the
 * student's attention. An absence is counted when it begins and timed when it
 * ends; one still open at the deadline is timed up to it. Never read by the
 * scoring.
 */
export function recordFocus(db, row, state, at = now()) {
  if (state !== "away" && state !== "back") throw new InvalidInputError("exam.errors.attempts.focusState");
  if (row.submitted_at !== null || row.deadline <= at) return { recorded: false };
  if (state === "away") {
    if (row.away_since !== null) return { recorded: false };
    db.prepare("UPDATE attempt SET focus_count = focus_count + 1, away_since = ? WHERE id = ?").run(at, row.id);
  } else {
    if (row.away_since === null) return { recorded: false };
    db.prepare("UPDATE attempt SET focus_ms = focus_ms + ?, away_since = NULL WHERE id = ?").run(Math.max(0, msBetween(row.away_since, at)), row.id);
  }
  notify(row.sitting_id, state, row.username);
  return { recorded: true };
}

/**
 * Releases an attempt from the browser it is bound to, at the teacher's
 * request; the next browser that opens it is bound instead. The answers and
 * the deadline stay as they are.
 */
export function releaseAttempt(db, id) {
  const row = db.prepare("SELECT * FROM attempt WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.attempts.noAttempt");
  if (row.submitted_at !== null) throw new ConflictError("exam.errors.attempts.submittedAlready");
  db.prepare("UPDATE attempt SET device_hash = NULL, device_user_agent = NULL WHERE id = ?").run(id);
  notify(row.sitting_id, "released", row.username);
  return { released: id };
}

/**
 * An admin's correction: deletes an attempt with its questions, tokens,
 * answers and refused browsers, submitted or not. The student counts as not
 * started again and can write the test while a sitting of theirs is open.
 */
export function deleteAttempt(db, id) {
  const row = db.prepare("SELECT * FROM attempt WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.attempts.noAttempt");
  db.prepare("DELETE FROM attempt WHERE id = ?").run(id);
  notify(row.sitting_id, "deleted", row.username);
  return { deleted: id };
}

// ---------------------------------------------------------- a teacher's try

/**
 * A test as a student would write it, for its teacher to try beforehand: the
 * snapshot shuffled and behind fresh tokens like an attempt, in the course's
 * language, with the first sitting's duration if one is scheduled. Nothing is
 * written - no attempt, no tokens kept - so nothing can be saved or submitted,
 * and no grade or usage changes.
 */
export function previewView(db, testId) {
  const test = db.prepare("SELECT id, name, course_id FROM test WHERE id = ?").get(testId);
  if (!test) throw new NotFoundError("exam.errors.attempts.noTest");
  const language = getCourse(db, test.course_id).language;
  const text = language === "en" ? "text_en" : "text_de";
  const first = db.prepare("SELECT duration_s FROM sitting WHERE test_id = ? ORDER BY opens_at, id LIMIT 1").get(testId);
  const questions = db.prepare(`SELECT id, type, ${text} AS text FROM test_question WHERE test_id = ? ORDER BY position`).all(testId);
  const answersOf = db.prepare(`SELECT ${text} AS text FROM test_answer WHERE test_question_id = ? ORDER BY position`);
  return {
    preview: true,
    name: test.name,
    language,
    remainingMs: first ? first.duration_s * 1000 : null,
    questions: shuffle(questions).map((question, index) => ({
      n: index + 1,
      type: question.type,
      text: question.text,
      answers: shuffle(answersOf.all(question.id)).map((answer) => ({ token: randomToken(), text: answer.text })),
      chosen: [],
    })),
  };
}
