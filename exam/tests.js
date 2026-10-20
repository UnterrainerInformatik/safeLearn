/**
 * Online tests as teachers manage them (`online-test`): a test assembled from
 * the pool for a course, the snapshot of its questions, the sittings it is
 * written in, and the lists of a course's or a school year's tests.
 *
 * A test copies its questions with both languages, answers and correct flags
 * when it is created (exam-online-tests design D2), so editing, retiring or
 * deleting a pool question later never changes a test or a grade derived from
 * one. Images are referenced, not copied; `test_image` keeps the database from
 * dropping one a test shows.
 *
 * Plain SQL over the module's database, synchronous like `DatabaseSync`; who
 * may ask for what is the router's business.
 */

import {
  ConflictError,
  currentYear,
  ForbiddenError,
  getClass,
  getCourse,
  getYear,
  inTransaction,
  InvalidInputError,
  listClasses,
  listCourses,
  NotFoundError,
  now,
  rosterOf,
} from "./classes.js";
import { viennaLocal } from "./client/periods.js";
import { finalizeDue } from "./attempts.js";

/** The calendar date in Vienna of an ISO timestamp, as `YYYY-MM-DD`. */
export function viennaDate(iso) {
  return viennaLocal(iso).date;
}

function normalizeName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length === 0 || trimmed.length > 80) {
    throw new InvalidInputError("exam.errors.tests.name");
  }
  return trimmed;
}

/** Whether any attempt of the test has started; from then on its questions are fixed. */
export function testStarted(db, testId) {
  return db.prepare("SELECT 1 FROM attempt WHERE test_id = ? LIMIT 1").get(testId) !== undefined;
}

function testRow(db, id) {
  const row = db.prepare("SELECT * FROM test WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.tests.noTest");
  return row;
}

/**
 * The pool questions with `questionIds`, in that order: every one known, not
 * retired, and none twice. A test without a question is refused.
 */
function chosenQuestions(db, questionIds) {
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    throw new InvalidInputError("exam.errors.tests.oneQuestion");
  }
  if (!questionIds.every((id) => Number.isInteger(id) && id > 0)) {
    throw new InvalidInputError("exam.errors.tests.questionIds");
  }
  if (new Set(questionIds).size !== questionIds.length) {
    throw new InvalidInputError("exam.errors.tests.questionOnce");
  }
  const read = db.prepare("SELECT * FROM question WHERE id = ?");
  return questionIds.map((id) => {
    const question = read.get(id);
    if (!question) throw new InvalidInputError("exam.errors.tests.noPoolQuestion", { id });
    if (question.retired === 1) throw new InvalidInputError("exam.errors.tests.questionRetired", { name: question.name_de });
    return question;
  });
}

/**
 * Copies `questions` into the test, links their images and records their
 * usage for the test's course. Called inside a transaction.
 */
function snapshot(db, test, questions) {
  const insertQuestion = db.prepare(
    `INSERT INTO test_question (test_id, question_id, position, type, name_de, name_en, text_de, text_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAnswer = db.prepare(
    "INSERT INTO test_answer (test_question_id, position, text_de, text_en, correct) VALUES (?, ?, ?, ?, ?)"
  );
  const answersOf = db.prepare("SELECT * FROM answer WHERE question_id = ? ORDER BY position");
  const linkImages = db.prepare("INSERT OR IGNORE INTO test_image (test_id, image_id) SELECT ?, id FROM image WHERE question_id = ?");
  const recordUsage = db.prepare("INSERT INTO question_usage (question_id, test_id, course_id, used_on) VALUES (?, ?, ?, ?)");
  const usedOn = usageDate(db, test.id);
  questions.forEach((question, index) => {
    const { lastInsertRowid } = insertQuestion.run(
      test.id,
      question.id,
      index,
      question.type,
      question.name_de,
      question.name_en,
      question.text_de,
      question.text_en
    );
    for (const answer of answersOf.all(question.id)) {
      insertAnswer.run(Number(lastInsertRowid), answer.position, answer.text_de, answer.text_en, answer.correct);
    }
    linkImages.run(test.id, question.id);
    recordUsage.run(question.id, test.id, test.course_id, usedOn);
  });
}

/** Removes a test's snapshot, its image links and its usage records. Inside a transaction. */
function dropSnapshot(db, testId) {
  db.prepare("DELETE FROM question_usage WHERE test_id = ?").run(testId);
  db.prepare("DELETE FROM test_image WHERE test_id = ?").run(testId);
  db.prepare("DELETE FROM test_question WHERE test_id = ?").run(testId);
}

/**
 * The date a test's usage is recorded under: its first sitting's start, in
 * Vienna, or today while it has none.
 */
function usageDate(db, testId) {
  const first = db.prepare("SELECT MIN(opens_at) AS at FROM sitting WHERE test_id = ?").get(testId).at;
  return viennaDate(first ?? now());
}

/** Moves a test's usage records to the date `usageDate` answers now. */
export function refreshUsageDate(db, testId) {
  db.prepare("UPDATE question_usage SET used_on = ? WHERE test_id = ?").run(usageDate(db, testId), testId);
}

/**
 * Creates the test `name` for a course from the pool questions `questionIds`,
 * in that order, with a snapshot of each.
 */
export function createTest(db, courseId, { name, questionIds } = {}) {
  getCourse(db, courseId);
  const trimmed = normalizeName(name);
  const questions = chosenQuestions(db, questionIds);
  return inTransaction(db, () => {
    const at = now();
    const { lastInsertRowid } = db
      .prepare("INSERT INTO test (course_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(courseId, trimmed, at, at);
    const test = testRow(db, Number(lastInsertRowid));
    snapshot(db, test, questions);
    return getTest(db, test.id);
  });
}

/**
 * Renames a test, or - only while no attempt has started - replaces its
 * questions with a fresh snapshot of `questionIds`.
 */
export function updateTest(db, id, { name, questionIds } = {}) {
  const test = testRow(db, id);
  const trimmed = name === undefined ? test.name : normalizeName(name);
  const questions = questionIds === undefined ? null : chosenQuestions(db, questionIds);
  return inTransaction(db, () => {
    if (questions !== null) {
      if (testStarted(db, id)) throw new ConflictError("exam.errors.tests.writtenQuestionsFixed");
      dropSnapshot(db, id);
      snapshot(db, test, questions);
    }
    db.prepare("UPDATE test SET name = ?, updated_at = ? WHERE id = ?").run(trimmed, now(), id);
    return getTest(db, id);
  });
}

/**
 * Deletes a test with its sittings and usage records, only while no attempt
 * has started - or, for an admin, with every attempt written of it and their
 * answers, which takes its column out of the gradebook.
 */
export function deleteTest(db, id, { admin = false } = {}) {
  testRow(db, id);
  inTransaction(db, () => {
    if (testStarted(db, id) && !admin) throw new ConflictError("exam.errors.tests.writtenCannotDelete");
    // An attempt's questions, tokens, answers and refused browsers go with it.
    db.prepare("DELETE FROM attempt WHERE test_id = ?").run(id);
    dropSnapshot(db, id);
    db.prepare("DELETE FROM sitting WHERE test_id = ?").run(id);
    db.prepare("DELETE FROM test WHERE id = ?").run(id);
  });
  return { deleted: id };
}

/**
 * An admin's correction of a written test: takes the pool question
 * `questionId` out of its snapshot and out of every attempt - their answers to
 * it included - closes the gap it leaves in each attempt's order, and scores
 * every submitted attempt again over the questions left, so the gradebook and
 * the students' results follow. The last question cannot go; delete the test.
 */
export function removeWrittenQuestion(db, testId, questionId, rescore) {
  testRow(db, testId);
  return inTransaction(db, () => {
    const question = db.prepare("SELECT id FROM test_question WHERE test_id = ? AND question_id = ?").get(testId, questionId);
    if (!question) throw new NotFoundError("exam.errors.tests.questionNotInTest");
    if (db.prepare("SELECT COUNT(*) AS n FROM test_question WHERE test_id = ?").get(testId).n === 1) {
      throw new ConflictError("exam.errors.tests.keepOneQuestion");
    }
    const answers = "SELECT id FROM test_answer WHERE test_question_id = ?";
    db.prepare(`DELETE FROM response WHERE test_answer_id IN (${answers})`).run(question.id);
    db.prepare(`DELETE FROM attempt_token WHERE test_answer_id IN (${answers})`).run(question.id);
    const attempts = db.prepare("SELECT id, submitted_at FROM attempt WHERE test_id = ?").all(testId);
    const placed = db.prepare("SELECT position FROM attempt_question WHERE attempt_id = ? AND test_question_id = ?");
    const unplace = db.prepare("DELETE FROM attempt_question WHERE attempt_id = ? AND test_question_id = ?");
    // Two steps, so no position is held twice while the later ones move up.
    const lift = db.prepare("UPDATE attempt_question SET position = -position - 1 WHERE attempt_id = ? AND position > ?");
    const settle = db.prepare("UPDATE attempt_question SET position = -position - 2 WHERE attempt_id = ? AND position < 0");
    for (const attempt of attempts) {
      const at = placed.get(attempt.id, question.id);
      if (!at) continue;
      unplace.run(attempt.id, question.id);
      lift.run(attempt.id, at.position);
      settle.run(attempt.id);
    }
    db.prepare("DELETE FROM test_question WHERE id = ?").run(question.id);
    db.prepare("DELETE FROM question_usage WHERE test_id = ? AND question_id = ?").run(testId, questionId);
    db.prepare("DELETE FROM test_image WHERE test_id = ? AND image_id IN (SELECT id FROM image WHERE question_id = ?)").run(testId, questionId);
    const count = db.prepare("SELECT COUNT(*) AS n FROM attempt_question WHERE attempt_id = ?");
    const store = db.prepare("UPDATE attempt SET question_count = ?, score = CASE WHEN submitted_at IS NULL THEN NULL ELSE ? END WHERE id = ?");
    for (const attempt of attempts) {
      store.run(count.get(attempt.id).n, attempt.submitted_at === null ? null : rescore(db, attempt.id), attempt.id);
    }
    db.prepare("UPDATE test SET updated_at = ? WHERE id = ?").run(now(), testId);
    return getTest(db, testId);
  });
}

/** A test's snapshot: its questions in the teacher's order, each with its answers and correct flags. */
export function testQuestions(db, testId) {
  const answers = db.prepare(
    "SELECT id, position, text_de AS textDe, text_en AS textEn, correct FROM test_answer WHERE test_question_id = ? ORDER BY position"
  );
  return db
    .prepare(
      `SELECT id, question_id AS questionId, position, type, name_de AS nameDe, name_en AS nameEn,
         text_de AS textDe, text_en AS textEn
       FROM test_question WHERE test_id = ? ORDER BY position`
    )
    .all(testId)
    .map((question) => ({
      ...question,
      answers: answers.all(question.id).map((answer) => ({ ...answer, correct: answer.correct === 1 })),
    }));
}

/** The state of a sitting at `at`: scheduled, open or over. */
export function sittingState(sitting, at = now()) {
  if (at < sitting.opensAt) return "scheduled";
  if (at < sitting.closesAt) return "open";
  return "over";
}

/** A test's sittings in the order they open, each with its participants and the number of its attempts. */
export function testSittings(db, testId, at = now()) {
  const participants = db.prepare("SELECT username FROM sitting_participant WHERE sitting_id = ? ORDER BY username");
  const attempts = db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE sitting_id = ?");
  return db
    .prepare(
      `SELECT id, opens_at AS opensAt, closes_at AS closesAt, duration_s AS durationS, makeup
       FROM sitting WHERE test_id = ? ORDER BY opens_at, id`
    )
    .all(testId)
    .map((sitting) => ({
      ...sitting,
      makeup: sitting.makeup === 1,
      state: sittingState({ opensAt: sitting.opensAt, closesAt: sitting.closesAt }, at),
      participants: participants.all(sitting.id).map((row) => row.username),
      attempts: attempts.get(sitting.id).n,
    }));
}

/** How many attempts of a test have started and how many are submitted. */
function attemptCounts(db, testId) {
  return db
    .prepare("SELECT COUNT(*) AS started, COUNT(submitted_at) AS submitted FROM attempt WHERE test_id = ?")
    .get(testId);
}

/**
 * One test as its teacher page shows it: the course, the snapshot with correct
 * flags, the sittings, and whether it has been written.
 */
export function getTest(db, id) {
  const row = testRow(db, id);
  const course = getCourse(db, row.course_id);
  const { started, submitted } = attemptCounts(db, id);
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    course: {
      id: course.id,
      classId: course.classId,
      className: course.className,
      subject: course.subject,
      language: course.language,
      yearName: course.year.name,
    },
    started: started > 0,
    attempts: { started, submitted },
    questions: testQuestions(db, id),
    sittings: testSittings(db, id),
  };
}

/** A course's tests for a list: name, number of questions, sittings and counts. */
function courseTests(db, courseId) {
  return db
    .prepare(
      `SELECT t.id, t.name, (SELECT COUNT(*) FROM test_question q WHERE q.test_id = t.id) AS questions
       FROM test t WHERE t.course_id = ?
       ORDER BY (SELECT MIN(opens_at) FROM sitting s WHERE s.test_id = t.id) IS NULL,
         (SELECT MIN(opens_at) FROM sitting s WHERE s.test_id = t.id), t.created_at, t.id`
    )
    .all(courseId)
    .map((test) => ({
      ...test,
      sittings: testSittings(db, test.id).map(({ participants, ...sitting }) => ({ ...sitting, participants: participants.length })),
      ...attemptCounts(db, test.id),
    }));
}

/**
 * The courses a test list covers: the one course when `courseId` is given,
 * the courses of the class when `classId` is, otherwise every course of the
 * school year - `yearId`, or the current one.
 */
function coursesInScope(db, { yearId = null, classId = null, courseId = null }) {
  if (courseId !== null) {
    const course = getCourse(db, courseId);
    return { scope: "course", year: course.year, courses: [course] };
  }
  if (classId !== null) {
    // A class chosen without a course: that class's courses only.
    const klass = getClass(db, classId);
    return { scope: "class", year: klass.year, klass, courses: klass.courses.map((course) => ({ ...course, className: klass.name })) };
  }
  const year = yearId !== null ? getYear(db, yearId) : currentYear(db);
  if (!year) return { scope: "year", year: null, courses: [] };
  const courses = listClasses(db, year.id).flatMap((klass) =>
    listCourses(db, klass.id).map((course) => ({ ...course, className: klass.name }))
  );
  return { scope: "year", year, courses };
}

/**
 * The tests of the courses in scope (`coursesInScope`), one group per course
 * in class order: `{ scope, year, groups: [{ courseId, classId, className,
 * subject, language, tests }] }`.
 */
export function listTests(db, scope = {}) {
  const { scope: kind, year, klass, courses } = coursesInScope(db, scope);
  return {
    scope: kind,
    year: year ? { id: year.id, name: year.name } : null,
    class: klass ? { id: klass.id, name: klass.name } : null,
    groups: courses.map((course) => ({
      courseId: course.id,
      classId: course.classId,
      className: course.className,
      subject: course.subject,
      language: course.language,
      tests: courseTests(db, course.id),
    })),
  };
}

// ------------------------------------------------------------------ sittings

/** An instant given by the client, as the ISO string the database stores. */
function instant(value, key) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(parsed)) throw new InvalidInputError(key);
  return new Date(parsed).toISOString();
}

function sittingRow(db, id) {
  const row = db.prepare("SELECT * FROM sitting WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.tests.noSitting");
  return row;
}

/** A sitting with its test's course and its participants, as its pages show it. */
export function getSitting(db, id) {
  const row = sittingRow(db, id);
  const test = testRow(db, row.test_id);
  const sitting = testSittings(db, row.test_id).find((candidate) => candidate.id === id);
  return { ...sitting, testId: test.id, testName: test.name, courseId: test.course_id };
}

/**
 * The participants of a sitting: everyone on the course's class roster who has
 * not left, or the `selected` ones among them. Anybody else is refused.
 */
function participantsOf(db, test, selected) {
  const course = getCourse(db, test.course_id);
  const roster = rosterOf(db, course.classId)
    .filter((entry) => entry.leftAt === null)
    .map((entry) => entry.username);
  if (selected === null || selected === undefined) {
    if (roster.length === 0) throw new InvalidInputError("exam.errors.tests.emptyRoster");
    return roster;
  }
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new InvalidInputError("exam.errors.tests.chooseStudent");
  }
  const usernames = [...new Set(selected.map((username) => String(username).trim().toLowerCase()))];
  const strangers = usernames.filter((username) => !roster.includes(username));
  if (strangers.length > 0) throw new InvalidInputError("exam.errors.tests.notOnRoster", { count: strangers.length, names: strangers.join(", ") });
  return usernames;
}

/**
 * A sitting's window and duration, checked: the window has to end in the
 * future and after it opens, and an attempt's duration has to be shorter than
 * the window.
 */
function sittingTimes({ opensAt, closesAt, durationMinutes }, at = now()) {
  const opens = instant(opensAt, "exam.errors.tests.startFormat");
  const closes = instant(closesAt, "exam.errors.tests.endFormat");
  if (!(opens < closes)) throw new InvalidInputError("exam.errors.tests.opensBeforeCloses");
  if (closes <= at) throw new InvalidInputError("exam.errors.tests.closesInFuture");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    throw new InvalidInputError("exam.errors.tests.durationMinutes");
  }
  const durationS = durationMinutes * 60;
  if (durationS * 1000 >= Date.parse(closes) - Date.parse(opens)) {
    throw new InvalidInputError("exam.errors.tests.durationWindow");
  }
  return { opens, closes, durationS };
}

/** The first sitting of a test, the one its make-ups take their duration from, or null. */
function firstSitting(db, testId) {
  return db.prepare("SELECT * FROM sitting WHERE test_id = ? AND makeup = 0 ORDER BY opens_at, id LIMIT 1").get(testId) ?? null;
}

/**
 * Schedules a sitting of a test. The first one is written by the whole roster
 * of the course's class - or by the `participants` chosen; every later one is
 * a make-up for the `participants` chosen, with the first one's duration.
 */
export function createSitting(db, testId, { opensAt, closesAt, durationMinutes, participants = null } = {}) {
  const test = testRow(db, testId);
  const first = firstSitting(db, testId);
  const makeup = first !== null;
  if (makeup && (participants === null || participants === undefined)) {
    throw new InvalidInputError("exam.errors.tests.makeupParticipants");
  }
  const times = sittingTimes({ opensAt, closesAt, durationMinutes: makeup ? first.duration_s / 60 : durationMinutes });
  const usernames = participantsOf(db, test, participants);
  return inTransaction(db, () => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, makeup, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(testId, times.opens, times.closes, times.durationS, makeup ? 1 : 0, now());
    const id = Number(lastInsertRowid);
    const take = db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, ?)");
    for (const username of usernames) take.run(id, username);
    refreshUsageDate(db, testId);
    return getSitting(db, id);
  });
}

/** Refuses a change to a sitting that has opened already. */
function requireNotOpened(row, at = now()) {
  if (row.opens_at <= at) throw new ConflictError("exam.errors.tests.sittingOpened");
}

/**
 * Changes a sitting that has not opened yet: its window, its participants and
 * - for a first sitting without make-ups - its duration.
 */
export function updateSitting(db, id, input = {}) {
  const row = sittingRow(db, id);
  requireNotOpened(row);
  const test = testRow(db, row.test_id);
  const makeups = db.prepare("SELECT COUNT(*) AS n FROM sitting WHERE test_id = ? AND makeup = 1").get(row.test_id).n;
  const durationMinutes = input.durationMinutes ?? row.duration_s / 60;
  if (durationMinutes * 60 !== row.duration_s && (row.makeup === 1 || makeups > 0)) {
    throw new ConflictError("exam.errors.tests.makeupDuration");
  }
  const times = sittingTimes({ opensAt: input.opensAt ?? row.opens_at, closesAt: input.closesAt ?? row.closes_at, durationMinutes });
  if (row.makeup === 1 && input.participants === null) throw new InvalidInputError("exam.errors.tests.makeupParticipants");
  const usernames = input.participants === undefined ? null : participantsOf(db, test, input.participants);
  return inTransaction(db, () => {
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ?, duration_s = ? WHERE id = ?").run(times.opens, times.closes, times.durationS, id);
    if (usernames !== null) {
      db.prepare("DELETE FROM sitting_participant WHERE sitting_id = ?").run(id);
      const take = db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, ?)");
      for (const username of usernames) take.run(id, username);
    }
    refreshUsageDate(db, row.test_id);
    return getSitting(db, id);
  });
}

/** Refuses anything but a sitting that is open now. */
function requireOpen(row, at) {
  if (sittingState({ opensAt: row.opens_at, closesAt: row.closes_at }, at) !== "open") throw new ConflictError("exam.errors.tests.sittingNotOpen");
}

/**
 * Ends an open sitting now (exam-ui-consistency design D9): its window closes,
 * and every running attempt is submitted with its saved answers, exactly as
 * at its deadline. The rule that the duration is shorter than the window is
 * one of scheduling and does not apply.
 */
export function endSitting(db, id, at = now()) {
  const row = sittingRow(db, id);
  requireOpen(row, at);
  inTransaction(db, () => {
    db.prepare("UPDATE sitting SET closes_at = ? WHERE id = ?").run(at, id);
    // An attempt's deadline is stored, the earlier of its start plus the duration and the window's end.
    db.prepare("UPDATE attempt SET deadline = ? WHERE sitting_id = ? AND submitted_at IS NULL AND deadline > ?").run(at, id, at);
  });
  finalizeDue(db, at);
  return getSitting(db, id);
}

/**
 * Extends an open sitting's window by 5 to 120 minutes. A running attempt's
 * deadline is the earlier of its start plus the duration and the new end, so
 * one cut short by the window gains time and one that runs its full duration
 * does not. The duration stays.
 */
export function extendSitting(db, id, { minutes } = {}, at = now()) {
  const row = sittingRow(db, id);
  requireOpen(row, at);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) throw new InvalidInputError("exam.errors.tests.extendMinutes");
  const closes = new Date(Date.parse(row.closes_at) + minutes * 60000).toISOString();
  inTransaction(db, () => {
    db.prepare("UPDATE sitting SET closes_at = ? WHERE id = ?").run(closes, id);
    const running = db.prepare("SELECT id, started_at FROM attempt WHERE sitting_id = ? AND submitted_at IS NULL").all(id);
    const set = db.prepare("UPDATE attempt SET deadline = ? WHERE id = ?");
    for (const attempt of running) {
      const full = new Date(Date.parse(attempt.started_at) + row.duration_s * 1000).toISOString();
      set.run(full < closes ? full : closes, attempt.id);
    }
  });
  return getSitting(db, id);
}

/**
 * Sets a sitting that is over again, in the window `opensAt`-`closesAt`, with
 * its duration and its participants - less those who have left the roster
 * since. Every attempt of the sitting goes with its answers; only an `admin`
 * may delete any, and only as many as `attempts` confirms. Make-ups stay as
 * they are; the usage date and the gradebook column follow the earliest
 * sitting.
 */
export function rescheduleSitting(db, id, { opensAt, closesAt, attempts } = {}, { admin = false } = {}, at = now()) {
  const row = sittingRow(db, id);
  if (sittingState({ opensAt: row.opens_at, closesAt: row.closes_at }, at) !== "over") throw new ConflictError("exam.errors.tests.sittingNotOver");
  const written = db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE sitting_id = ?").get(id).n;
  if (written > 0 && !admin) throw new ForbiddenError("Forbidden");
  if (written !== (attempts ?? 0)) throw new ConflictError("exam.errors.tests.attemptsChanged");
  const times = sittingTimes({ opensAt, closesAt, durationMinutes: row.duration_s / 60 }, at);
  const course = getCourse(db, testRow(db, row.test_id).course_id);
  const roster = new Set(rosterOf(db, course.classId).filter((entry) => entry.leftAt === null).map((entry) => entry.username));
  const usernames = db
    .prepare("SELECT username FROM sitting_participant WHERE sitting_id = ? ORDER BY username")
    .all(id)
    .map((participant) => participant.username)
    .filter((username) => roster.has(username));
  if (usernames.length === 0) throw new InvalidInputError("exam.errors.tests.emptyRoster");
  return inTransaction(db, () => {
    const deleted = db.prepare("SELECT username FROM attempt WHERE sitting_id = ? ORDER BY username").all(id).map((attempt) => attempt.username);
    // An attempt's questions, tokens, answers and refused browsers go with it.
    db.prepare("DELETE FROM attempt WHERE sitting_id = ?").run(id);
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(times.opens, times.closes, id);
    db.prepare("DELETE FROM sitting_participant WHERE sitting_id = ?").run(id);
    const take = db.prepare("INSERT INTO sitting_participant (sitting_id, username) VALUES (?, ?)");
    for (const username of usernames) take.run(id, username);
    refreshUsageDate(db, row.test_id);
    return { ...getSitting(db, id), deleted };
  });
}

/** Deletes a sitting that has not opened yet. A first sitting goes only after its make-ups. */
export function deleteSitting(db, id) {
  const row = sittingRow(db, id);
  requireNotOpened(row);
  if (row.makeup === 0 && db.prepare("SELECT 1 FROM sitting WHERE test_id = ? AND makeup = 1").get(row.test_id)) {
    throw new ConflictError("exam.errors.tests.deleteMakeupsFirst");
  }
  inTransaction(db, () => {
    db.prepare("DELETE FROM sitting WHERE id = ?").run(id);
    refreshUsageDate(db, row.test_id);
  });
  return { deleted: id };
}
