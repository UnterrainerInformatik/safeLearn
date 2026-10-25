/**
 * Online tests as teachers manage them (`online-test`): a test assembled from
 * the pool for a course, the snapshot of its questions, the sittings it is
 * written in, and the lists of a course's or a school year's tests.
 *
 * Offline tests (`offline-test`, exam-offline-sittings design D1) are tests of
 * the same table with `kind = 'offline'`: no questions, a duration, up to two
 * handouts and a column of their own in the gradebook. Their sittings open
 * only when a teacher starts them (design D2), and every guard about
 * questions asks for `kind = 'online'`.
 *
 * A test holds a copy of its questions with both languages, answers and
 * correct flags, and everything that shows or grades it reads only that copy.
 * Until the test begins - its first sitting opens or its first attempt starts
 * - the copy follows the pool: every pool write that changes a question
 * refreshes it (exam-questions-follow-pool design D1). From then on the copy
 * is the snapshot, and editing, retiring or deleting a pool question never
 * changes the test or a grade derived from it. Images are referenced, not
 * copied; `test_image` keeps the database from dropping one a test shows, and
 * an image whose question is gone is removed once no test shows it.
 *
 * Plain SQL over the module's database, synchronous like `DatabaseSync`; who
 * may ask for what is the router's business.
 */

import {
  categoriesInUse,
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
import { entryCategory } from "./grading.js";
import { handoutGroups, handoutPath, handoutResolves, handoutsOf } from "./handout.js";

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

/**
 * Whether a test has begun at `at`: an attempt exists, or one of its sittings
 * has opened. From then on its copy is the snapshot (design D2).
 */
export function testBegun(db, testId, at = now()) {
  return (
    testStarted(db, testId) ||
    db.prepare(`SELECT 1 FROM sitting WHERE test_id = ? AND opens_at <= ? AND ${startedCondition("sitting")} LIMIT 1`).get(testId, at) !== undefined
  );
}

/**
 * The tests not yet begun at `at` that hold the pool question `questionId`,
 * with course and class: the ones a save of the question changes and its
 * deletion takes it out of.
 */
export function pendingTestsWith(db, questionId, at = now()) {
  return db
    .prepare(
      `SELECT t.id, t.name, co.id AS courseId, co.subject, cl.name AS className
       FROM test t
       JOIN course co ON co.id = t.course_id
       JOIN class cl ON cl.id = co.class_id
       WHERE EXISTS (SELECT 1 FROM test_question tq WHERE tq.test_id = t.id AND tq.question_id = ?)
         AND NOT EXISTS (SELECT 1 FROM attempt a WHERE a.test_id = t.id)
         AND NOT EXISTS (SELECT 1 FROM sitting s WHERE s.test_id = t.id AND s.opens_at <= ?)
       ORDER BY t.created_at, t.id`
    )
    .all(questionId, at);
}

/**
 * The condition every query asking "has this sitting opened" adds (design
 * D2): an online sitting opens by the clock, an offline one only once a
 * teacher started it. `alias` is the sitting's table name in the query.
 */
export function startedCondition(alias) {
  return `(${alias}.started_at IS NOT NULL OR (SELECT kind FROM test WHERE test.id = ${alias}.test_id) = 'online')`;
}

function testRow(db, id) {
  const row = db.prepare("SELECT * FROM test WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.tests.noTest");
  return row;
}

/**
 * The pool questions with `questionIds`, in that order: every one known, not
 * retired - unless it is in `keep`, the ones the test already holds - and none
 * twice. A test without a question is refused.
 */
function chosenQuestions(db, questionIds, { keep = [] } = {}) {
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
    if (question.retired === 1 && !keep.includes(id)) throw new InvalidInputError("exam.errors.tests.questionRetired", { name: question.name_de });
    return question;
  });
}

/** The ids of the images the stored `texts` show, by their route. */
function imageRefs(texts) {
  return new Set([...texts.join(" ").matchAll(/\/exam\/api\/images\/(\d+)/g)].map((match) => Number(match[1])));
}

/** Every text of a test's copy, or of one row of it (`testQuestionId`). */
function copyTexts(db, testId, testQuestionId = null) {
  const rows = db
    .prepare("SELECT id, text_de, text_en FROM test_question WHERE test_id = ? AND (? IS NULL OR id = ?)")
    .all(testId, testQuestionId, testQuestionId);
  const answers = db.prepare("SELECT text_de, text_en FROM test_answer WHERE test_question_id = ?");
  return rows.flatMap((row) => [row.text_de, row.text_en, ...answers.all(row.id).flatMap((answer) => [answer.text_de, answer.text_en])]);
}

/** Links exactly the images a test's copy shows. Only for a test not yet begun. Inside a transaction. */
function linkImages(db, testId) {
  db.prepare("DELETE FROM test_image WHERE test_id = ?").run(testId);
  const link = db.prepare("INSERT INTO test_image (test_id, image_id) SELECT ?, id FROM image WHERE id = ?");
  for (const imageId of imageRefs(copyTexts(db, testId))) link.run(testId, imageId);
}

/** Removes the images whose question is gone and which no test shows any more. */
export function sweepOrphanImages(db) {
  db.prepare("DELETE FROM image WHERE question_id IS NULL AND NOT EXISTS (SELECT 1 FROM test_image t WHERE t.image_id = image.id)").run();
}

/** Writes the pool's `question` answers into the copy row `testQuestionId`. Inside a transaction. */
function copyAnswers(db, testQuestionId, questionId) {
  const insertAnswer = db.prepare(
    "INSERT INTO test_answer (test_question_id, position, text_de, text_en, correct) VALUES (?, ?, ?, ?, ?)"
  );
  for (const answer of db.prepare("SELECT * FROM answer WHERE question_id = ? ORDER BY position").all(questionId)) {
    insertAnswer.run(testQuestionId, answer.position, answer.text_de, answer.text_en, answer.correct);
  }
}

/**
 * Brings the copy of the pool `question` in a test not yet begun up to the
 * pool, in place: the row keeps its id and position, its answers are
 * replaced, and the test's images are linked again (design D3). Nothing
 * references the copy yet, since the test has no attempt. Inside a
 * transaction.
 */
export function refreshCopy(db, testId, question) {
  const row = db.prepare("SELECT id FROM test_question WHERE test_id = ? AND question_id = ?").get(testId, question.id);
  db.prepare("UPDATE test_question SET type = ?, name_de = ?, name_en = ?, text_de = ?, text_en = ? WHERE id = ?").run(
    question.type,
    question.name_de,
    question.name_en,
    question.text_de,
    question.text_en,
    row.id
  );
  db.prepare("DELETE FROM test_answer WHERE test_question_id = ?").run(row.id);
  copyAnswers(db, row.id, question.id);
  linkImages(db, testId);
  sweepOrphanImages(db);
}

/**
 * Takes the pool question `questionId` out of a test not yet begun, with its
 * usage record. The positions after it keep a gap. Inside a transaction.
 */
export function dropFromTest(db, testId, questionId) {
  db.prepare("DELETE FROM test_question WHERE test_id = ? AND question_id = ?").run(testId, questionId);
  db.prepare("DELETE FROM question_usage WHERE test_id = ? AND question_id = ?").run(testId, questionId);
  linkImages(db, testId);
}

/**
 * Lets a test that is no longer begun - its sittings were set again or
 * deleted - follow the pool again (design D4): every question it holds takes
 * the pool's current version, and a copy whose question has been deleted
 * meanwhile goes. Inside a transaction.
 */
export function followPoolIfNotBegun(db, testId, at = now()) {
  if (testRow(db, testId).kind !== "online" || testBegun(db, testId, at)) return;
  const read = db.prepare("SELECT * FROM question WHERE id = ?");
  for (const row of db.prepare("SELECT id, question_id FROM test_question WHERE test_id = ?").all(testId)) {
    if (row.question_id === null) db.prepare("DELETE FROM test_question WHERE id = ?").run(row.id);
    else refreshCopy(db, testId, read.get(row.question_id));
  }
  linkImages(db, testId);
  sweepOrphanImages(db);
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
    copyAnswers(db, Number(lastInsertRowid), question.id);
    recordUsage.run(question.id, test.id, test.course_id, usedOn);
  });
  linkImages(db, test.id);
}

/**
 * Removes a test's copy, its image links and its usage records, and the
 * images only it still showed. Inside a transaction.
 */
function dropSnapshot(db, testId) {
  db.prepare("DELETE FROM question_usage WHERE test_id = ?").run(testId);
  db.prepare("DELETE FROM test_image WHERE test_id = ?").run(testId);
  db.prepare("DELETE FROM test_question WHERE test_id = ?").run(testId);
  sweepOrphanImages(db);
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
 * questions with a fresh copy of `questionIds`. A retired question the test
 * already holds may stay.
 */
export function updateTest(db, id, input = {}) {
  const test = testRow(db, id);
  if (test.kind === "offline") return updateOfflineTest(db, test, input);
  const { name, questionIds } = input;
  const trimmed = name === undefined ? test.name : normalizeName(name);
  const held = db.prepare("SELECT question_id FROM test_question WHERE test_id = ? AND question_id IS NOT NULL").all(id);
  const keep = held.map((row) => row.question_id);
  const questions = questionIds === undefined ? null : chosenQuestions(db, questionIds, { keep });
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
  const test = testRow(db, id);
  inTransaction(db, () => {
    if (testStarted(db, id) && !admin) throw new ConflictError("exam.errors.tests.writtenCannotDelete");
    // An offline test's column goes with it, but never with a result in it (design D9).
    if (test.assessment_id !== null) {
      if (db.prepare("SELECT 1 FROM manual_entry WHERE assessment_id = ? LIMIT 1").get(test.assessment_id)) {
        throw new ConflictError("exam.errors.tests.offlineHasResults");
      }
      db.prepare("UPDATE test SET assessment_id = NULL WHERE id = ?").run(id);
      db.prepare("DELETE FROM assessment WHERE id = ?").run(test.assessment_id);
    }
    // An attempt's questions, tokens, answers and refused browsers go with it.
    db.prepare("DELETE FROM attempt WHERE test_id = ?").run(id);
    dropSnapshot(db, id);
    db.prepare("DELETE FROM sitting WHERE test_id = ?").run(id);
    db.prepare("DELETE FROM test WHERE id = ?").run(id);
  });
  return { deleted: id };
}

/**
 * An admin's correction of a written test: takes the snapshot row
 * `testQuestionId` out of the test and out of every attempt - their answers to
 * it included - closes the gap it leaves in each attempt's order, and scores
 * every submitted attempt again over the questions left, so the gradebook and
 * the students' results follow. The row's pool question may have been deleted
 * meanwhile. The last question cannot go; delete the test.
 */
export function removeWrittenQuestion(db, testId, testQuestionId, rescore) {
  testRow(db, testId);
  return inTransaction(db, () => {
    const question = db.prepare("SELECT id, question_id FROM test_question WHERE test_id = ? AND id = ?").get(testId, testQuestionId);
    if (!question) throw new NotFoundError("exam.errors.tests.questionNotInTest");
    const shown = imageRefs(copyTexts(db, testId, question.id));
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
    db.prepare("DELETE FROM question_usage WHERE test_id = ? AND question_id = ?").run(testId, question.question_id);
    // The images only the removed row showed; another row's stay linked.
    const stillShown = imageRefs(copyTexts(db, testId));
    const unlink = db.prepare("DELETE FROM test_image WHERE test_id = ? AND image_id = ?");
    for (const imageId of shown) if (!stillShown.has(imageId)) unlink.run(testId, imageId);
    sweepOrphanImages(db);
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

/**
 * The state of a sitting at `at`: scheduled, open or over. An offline sitting
 * (`offline: true`) stays scheduled until it is started, whatever its planned
 * time.
 */
export function sittingState(sitting, at = now()) {
  if (sitting.offline && !sitting.startedAt) return "scheduled";
  if (at < sitting.opensAt) return "scheduled";
  if (at < sitting.closesAt) return "open";
  return "over";
}

/** A test's sittings in the order they open, each with its participants and the number of its attempts. */
export function testSittings(db, testId, at = now()) {
  const offline = testRow(db, testId).kind === "offline";
  // Whole rows, so the checks of earlier migrations can still read a sitting
  // through this before the attendance columns exist.
  const participants = db.prepare("SELECT * FROM sitting_participant WHERE sitting_id = ? ORDER BY username");
  const attempts = db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE sitting_id = ?");
  return db
    .prepare("SELECT * FROM sitting WHERE test_id = ? ORDER BY opens_at, id")
    .all(testId)
    .map((sitting) => {
      const rows = participants.all(sitting.id);
      const window = { opensAt: sitting.opens_at, closesAt: sitting.closes_at };
      return {
        id: sitting.id,
        ...window,
        durationS: sitting.duration_s,
        makeup: sitting.makeup === 1,
        startedAt: sitting.started_at ?? null,
        state: sittingState({ ...window, offline, startedAt: sitting.started_at }, at),
        participants: rows.map((row) => row.username),
        // Who was marked absent, for an offline sitting's make-up.
        absent: offline ? rows.filter((row) => row.present === 0).map((row) => row.username) : [],
        attempts: attempts.get(sitting.id).n,
      };
    });
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
    kind: row.kind,
    ...offlineFields(db, row),
    createdAt: row.created_at,
    course: {
      id: course.id,
      classId: course.classId,
      className: course.className,
      subject: course.subject,
      language: course.language,
      yearName: course.year.name,
      yearClosed: course.year.closed,
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
      `SELECT t.id, t.name, t.kind, t.handout_a, t.handout_b, (SELECT COUNT(*) FROM test_question q WHERE q.test_id = t.id) AS questions
       FROM test t WHERE t.course_id = ?
       ORDER BY (SELECT MIN(opens_at) FROM sitting s WHERE s.test_id = t.id) IS NULL,
         (SELECT MIN(opens_at) FROM sitting s WHERE s.test_id = t.id), t.created_at, t.id`
    )
    .all(courseId)
    .map(({ handout_a, handout_b, ...test }) => ({
      ...test,
      handouts: handoutsOf({ handout_a, handout_b }).map(({ group, path, resolves }) => ({ group, path, resolves })),
      sittings: testSittings(db, test.id).map(({ participants, absent, ...sitting }) => ({ ...sitting, participants: participants.length })),
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
 * subject, language, offlineKinds, tests }] }`. `offlineKinds` are the
 * gradebook kinds a new offline test of the course can count as: those of
 * the categories it uses.
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
      offlineKinds: offlineColumnKinds.filter((gradebookKind) => categoriesInUse(course).includes(entryCategory[gradebookKind])),
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
  return { ...sitting, testId: test.id, testName: test.name, courseId: test.course_id, kind: test.kind ?? "online", handouts: offlineFields(db, test).handouts };
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
export function createSitting(db, testId, input = {}) {
  const test = testRow(db, testId);
  if (test.kind === "offline") return createOfflineSitting(db, test, input);
  const { opensAt, closesAt, durationMinutes, participants = null } = input;
  if (db.prepare("SELECT 1 FROM test_question WHERE test_id = ? LIMIT 1").get(testId) === undefined) {
    throw new ConflictError("exam.errors.tests.noQuestions");
  }
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
  const test = testRow(db, row.test_id);
  if (test.kind === "offline") return updateOfflineSitting(db, row, test, input);
  requireNotOpened(row);
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

/** The state of the sitting `row` at `at`, its test's kind taken into account. */
function rowState(db, row, at) {
  const offline = testRow(db, row.test_id).kind === "offline";
  return sittingState({ opensAt: row.opens_at, closesAt: row.closes_at, offline, startedAt: row.started_at }, at);
}

/** Refuses anything but a sitting that is open now; an offline one before its start included. */
function requireOpen(db, row, at) {
  if (rowState(db, row, at) !== "open") throw new ConflictError("exam.errors.tests.sittingNotOpen");
}

/**
 * Ends an open sitting now (exam-ui-consistency design D9): its window closes,
 * and every running attempt is submitted with its saved answers, exactly as
 * at its deadline. The rule that the duration is shorter than the window is
 * one of scheduling and does not apply.
 */
export function endSitting(db, id, at = now()) {
  const row = sittingRow(db, id);
  requireOpen(db, row, at);
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
  requireOpen(db, row, at);
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
 * sitting. A test left with no attempt and no opened sitting follows the
 * pool again (`followPoolIfNotBegun`).
 */
export function rescheduleSitting(db, id, { opensAt, closesAt, attempts } = {}, { admin = false } = {}, at = now()) {
  const row = sittingRow(db, id);
  // An offline sitting that is over is followed by a make-up, not set again.
  if (testRow(db, row.test_id).kind === "offline") throw new ConflictError("exam.errors.tests.offlineNoReschedule");
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
    followPoolIfNotBegun(db, row.test_id, at);
    return { ...getSitting(db, id), deleted };
  });
}

/**
 * Deletes a sitting that has not opened yet - an offline one also once it is
 * over, never while its window is open. A first sitting goes only after
 * its make-ups. A test left with no attempt and no opened sitting follows the
 * pool again.
 */
export function deleteSitting(db, id) {
  const row = sittingRow(db, id);
  // An offline sitting can go in an emergency also once it is over; never while it runs.
  if (testRow(db, row.test_id).kind === "offline") {
    if (rowState(db, row, now()) === "open") throw new ConflictError("exam.errors.tests.sittingRunning");
  } else requireNotOpened(row);
  if (row.makeup === 0 && db.prepare("SELECT 1 FROM sitting WHERE test_id = ? AND makeup = 1").get(row.test_id)) {
    throw new ConflictError("exam.errors.tests.deleteMakeupsFirst");
  }
  inTransaction(db, () => {
    db.prepare("DELETE FROM sitting WHERE id = ?").run(id);
    refreshUsageDate(db, row.test_id);
    refreshColumnDate(db, row.test_id);
    followPoolIfNotBegun(db, row.test_id);
  });
  return { deleted: id };
}

// ------------------------------------------------------------ offline tests

/** The gradebook categories an offline test can count in (design D9). */
const offlineColumnKinds = Object.freeze(["test", "shorttest"]);

/** An offline test's duration in minutes, checked, as seconds. */
function offlineDuration(durationMinutes) {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    throw new InvalidInputError("exam.errors.tests.durationMinutes");
  }
  return durationMinutes * 60;
}

/** A handout chosen by the teacher: a Markdown file of the corpus that is there now. */
function chosenHandout(value) {
  const corpusPath = handoutPath(value);
  if (!handoutResolves(corpusPath)) throw new InvalidInputError("exam.errors.handouts.notFound", { path: corpusPath });
  return corpusPath;
}

/**
 * The handouts after a change: `handoutA`/`handoutB` as given - undefined
 * keeps one, null removes it. Removing A while B is set makes B the only one;
 * a B without an A is refused.
 */
function nextHandouts(current, { handoutA, handoutB }) {
  let a = handoutA === undefined ? current.a : handoutA === null ? null : chosenHandout(handoutA);
  let b = handoutB === undefined ? current.b : handoutB === null ? null : chosenHandout(handoutB);
  if (a === null && b !== null) {
    if (handoutB !== undefined && handoutB !== null) throw new InvalidInputError("exam.errors.handouts.bWithoutA");
    [a, b] = [b, null];
  }
  return { a, b };
}

/** The date in Vienna of `iso`, kept inside the school year a column has to lie in. */
function dateInYear(iso, year) {
  const date = viennaDate(iso);
  return date < year.startsOn ? year.startsOn : date > year.endsOn ? year.endsOn : date;
}

/** What a test answers beyond the online fields: an offline test's duration, column and handouts. */
function offlineFields(db, row) {
  if (row.kind !== "offline") return { handouts: [] };
  const column = row.assessment_id === null ? null : db.prepare("SELECT kind FROM assessment WHERE id = ?").get(row.assessment_id);
  return {
    durationS: row.duration_s,
    gradebookKind: column?.kind ?? null,
    assessmentId: row.assessment_id,
    handouts: handoutsOf(row),
  };
}

/**
 * Creates the offline test `name` for a course (design D1, D9): a duration in
 * minutes, the gradebook category it counts in - `test` or `shorttest`, of
 * those the course uses - and optionally its handouts. Its column is created with it, named by the test
 * and dated today until a sitting is planned.
 */
export function createOfflineTest(db, courseId, { name, durationMinutes, gradebookKind, handoutA = null, handoutB = null } = {}) {
  const course = getCourse(db, courseId);
  const trimmed = normalizeName(name);
  const durationS = offlineDuration(durationMinutes);
  if (!offlineColumnKinds.includes(gradebookKind)) throw new InvalidInputError("exam.errors.tests.gradebookKind");
  // Only a category the course uses (gradebook-presentations-projects design D4).
  if (!course.categoriesInUse.includes(entryCategory[gradebookKind])) {
    throw new InvalidInputError("exam.errors.gradebook.categoryNotInUse", { category: entryCategory[gradebookKind] });
  }
  const handouts = nextHandouts({ a: null, b: null }, { handoutA, handoutB });
  return inTransaction(db, () => {
    const at = now();
    const column = db
      .prepare("INSERT INTO assessment (course_id, kind, name, held_on, max_points, created_at) VALUES (?, ?, ?, ?, NULL, ?)")
      .run(courseId, gradebookKind, trimmed, dateInYear(at, course.year), at);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO test (course_id, name, kind, duration_s, handout_a, handout_b, assessment_id, created_at, updated_at)
         VALUES (?, ?, 'offline', ?, ?, ?, ?, ?, ?)`
      )
      .run(courseId, trimmed, durationS, handouts.a, handouts.b, Number(column.lastInsertRowid), at, at);
    return getTest(db, Number(lastInsertRowid));
  });
}

/**
 * Changes an offline test: its name, which renames its column; its duration,
 * only while none of its sittings has started, which the planned ones take
 * on; and its handouts.
 */
function updateOfflineTest(db, test, { name, durationMinutes, handoutA, handoutB, questionIds } = {}) {
  if (questionIds !== undefined) throw new ConflictError("exam.errors.tests.offlineNoQuestions");
  const trimmed = name === undefined ? test.name : normalizeName(name);
  const durationS = durationMinutes === undefined ? test.duration_s : offlineDuration(durationMinutes);
  if (durationS !== test.duration_s && db.prepare("SELECT 1 FROM sitting WHERE test_id = ? AND started_at IS NOT NULL").get(test.id)) {
    throw new ConflictError("exam.errors.tests.offlineDurationFixed");
  }
  const handouts = nextHandouts({ a: test.handout_a, b: test.handout_b }, { handoutA, handoutB });
  return inTransaction(db, () => {
    db.prepare("UPDATE test SET name = ?, duration_s = ?, handout_a = ?, handout_b = ?, updated_at = ? WHERE id = ?").run(
      trimmed,
      durationS,
      handouts.a,
      handouts.b,
      now(),
      test.id
    );
    if (test.assessment_id !== null && trimmed !== test.name) {
      db.prepare("UPDATE assessment SET name = ? WHERE id = ?").run(trimmed, test.assessment_id);
    }
    if (durationS !== test.duration_s) {
      for (const sitting of db.prepare("SELECT id, opens_at FROM sitting WHERE test_id = ?").all(test.id)) {
        db.prepare("UPDATE sitting SET duration_s = ?, closes_at = ? WHERE id = ?").run(durationS, plannedClose(sitting.opens_at, durationS), sitting.id);
      }
    }
    return getTest(db, test.id);
  });
}

/** Where a planned window opening at `opens` and running `durationS` ends. */
function plannedClose(opens, durationS) {
  return new Date(Date.parse(opens) + durationS * 1000).toISOString();
}

/** A planned offline window: it opens at `opensAt` for the test's duration, and has to end in the future. */
function plannedTimes(opensAt, durationS, at = now()) {
  const opens = instant(opensAt, "exam.errors.tests.startFormat");
  const closes = plannedClose(opens, durationS);
  if (closes <= at) throw new InvalidInputError("exam.errors.tests.closesInFuture");
  return { opens, closes };
}

/**
 * Moves an offline test's column to the date of its first sitting: the day it
 * was started, or the day it is planned for while it has not (design D2, D9).
 * Inside a transaction.
 */
function refreshColumnDate(db, testId) {
  const test = testRow(db, testId);
  if (test.assessment_id === null) return;
  const first = firstSitting(db, testId);
  if (first === null) return;
  const date = dateInYear(first.started_at ?? first.opens_at, getCourse(db, test.course_id).year);
  db.prepare("UPDATE assessment SET held_on = ? WHERE id = ?").run(date, test.assessment_id);
}

/** Writes a sitting's participants, keeping the attendance of those who stay. Inside a transaction. */
function writeParticipants(db, sittingId, usernames) {
  const placeholders = usernames.map(() => "?").join(", ");
  db.prepare(`DELETE FROM sitting_participant WHERE sitting_id = ? AND username NOT IN (${placeholders})`).run(sittingId, ...usernames);
  const take = db.prepare("INSERT OR IGNORE INTO sitting_participant (sitting_id, username) VALUES (?, ?)");
  for (const username of usernames) take.run(sittingId, username);
}

/**
 * Plans a sitting of an offline test (design D2): its planned start and its
 * participants - the whole roster, or those chosen; every later one is a
 * make-up for the participants chosen. Its window is planned from the start
 * for the test's duration, and opens only when a teacher starts it.
 */
function createOfflineSitting(db, test, { opensAt, participants = null } = {}) {
  const makeup = firstSitting(db, test.id) !== null;
  if (makeup && (participants === null || participants === undefined)) {
    throw new InvalidInputError("exam.errors.tests.makeupParticipants");
  }
  const times = plannedTimes(opensAt, test.duration_s);
  const usernames = participantsOf(db, test, participants);
  return inTransaction(db, () => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, makeup, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(test.id, times.opens, times.closes, test.duration_s, makeup ? 1 : 0, now());
    const id = Number(lastInsertRowid);
    writeParticipants(db, id, usernames);
    refreshColumnDate(db, test.id);
    return getSitting(db, id);
  });
}

/** Refuses a change to an offline sitting that has been started. */
function requireNotStarted(row) {
  if (row.started_at !== null) throw new ConflictError("exam.errors.tests.sittingStarted");
}

/** Changes the planned start and the participants of an offline sitting not yet started. */
function updateOfflineSitting(db, row, test, input = {}) {
  requireNotStarted(row);
  const times = plannedTimes(input.opensAt ?? row.opens_at, row.duration_s);
  if (row.makeup === 1 && input.participants === null) throw new InvalidInputError("exam.errors.tests.makeupParticipants");
  const usernames = input.participants === undefined ? null : participantsOf(db, test, input.participants);
  return inTransaction(db, () => {
    db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(times.opens, times.closes, row.id);
    if (usernames !== null) writeParticipants(db, row.id, usernames);
    refreshColumnDate(db, row.test_id);
    return getSitting(db, row.id);
  });
}

/**
 * Starts an offline sitting now (design D2): its window runs from `at` for
 * the test's duration, and its column is dated by the day. Refused for an
 * online sitting, for one already started, and while a handout of the test
 * does not resolve - the refusal names the handout to choose again.
 */
export function startSitting(db, id, at = now()) {
  const row = sittingRow(db, id);
  const test = testRow(db, row.test_id);
  if (test.kind !== "offline") throw new ConflictError("exam.errors.tests.onlineNoStart");
  requireNotStarted(row);
  const broken = handoutsOf(test).find((handout) => !handout.resolves);
  if (broken) throw new ConflictError("exam.errors.tests.handoutUnresolved", { group: broken.group, path: broken.path });
  inTransaction(db, () => {
    db.prepare("UPDATE sitting SET started_at = ?, opens_at = ?, closes_at = ? WHERE id = ?").run(at, at, plannedClose(at, row.duration_s), id);
    refreshColumnDate(db, row.test_id);
  });
  return getSitting(db, id);
}

/**
 * Marks `username` present or absent in an offline sitting and puts them in
 * handout group A or B (design D3): `present` and `group` as given, either
 * one alone. Allowed before, during and after the window. Refused for
 * somebody who is not a participant, and group B for a test without a second
 * handout.
 */
export function setAttendance(db, sittingId, username, { present, group } = {}) {
  const row = sittingRow(db, sittingId);
  const test = testRow(db, row.test_id);
  if (test.kind !== "offline") throw new ConflictError("exam.errors.tests.onlineNoAttendance");
  const name = String(username ?? "").trim().toLowerCase();
  const participant = db.prepare("SELECT * FROM sitting_participant WHERE sitting_id = ? AND username = ?").get(sittingId, name);
  if (!participant) throw new NotFoundError("exam.errors.tests.notParticipant");
  if (present !== undefined && typeof present !== "boolean") throw new InvalidInputError("exam.errors.tests.presentFlag");
  if (group !== undefined && !handoutGroups.includes(group)) throw new InvalidInputError("exam.errors.tests.handoutGroup");
  if (group === "B" && test.handout_b === null) throw new InvalidInputError("exam.errors.tests.noHandoutB");
  const nextPresent = present === undefined ? participant.present : present ? 1 : 0;
  const nextGroup = group ?? participant.handout_group;
  db.prepare("UPDATE sitting_participant SET present = ?, handout_group = ? WHERE sitting_id = ? AND username = ?").run(nextPresent, nextGroup, sittingId, name);
  return { username: name, present: nextPresent === 1, group: nextGroup };
}
