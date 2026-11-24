/**
 * The correction table of a test on paper (`offline-test-questions`,
 * pool-quickie design D4, D5, D8): a teacher's grade from 1 to 5 per question
 * and student, and the result computed from those grades on every read.
 *
 * A row belongs to every student marked present in a started sitting of the
 * test. The group that counts for them is the one `countingGroups` answers -
 * group A for everybody while the test has one group - and their fields are
 * that group's questions. A grade belongs to its
 * question, not to the group: a change of group keeps it, and it counts again
 * once the student is back in that group. A retake writes over the same row.
 *
 * The result is `Σ weight · bandMidpoint(grade) / Σ weight` over the group's
 * questions, only once each has a grade; the factor A:B is applied by the
 * gradebook on top, as for every result of a two-group offline test. Nothing
 * of it is stored, so a change of a grade, a weight or the scale moves it at
 * once.
 *
 * Plain SQL, synchronous; who may ask is the router's business.
 */

import { ConflictError, getCourse, InvalidInputError, NotFoundError, now } from "./classes.js";
import { bandMidpoint } from "./grading.js";
import { countingGroups, hasTwoGroups, isPaper } from "./tests.js";

function paperTest(db, testId) {
  const test = db.prepare("SELECT * FROM test WHERE id = ?").get(testId);
  if (!test) throw new NotFoundError("exam.errors.tests.noTest");
  if (!isPaper(test)) throw new ConflictError("exam.errors.paper.notPaper");
  return test;
}

/** The group that counts for `username` in test row `test`: their counting group with two groups, A otherwise. */
function countingGroupOf(groups, test, twoGroups, username) {
  return twoGroups ? (groups.get(`${test.id}/${username}`) ?? "A") : "A";
}

/** The questions of a test on paper by group, each in its order: `{ A: [...], B: [...] }`. */
function questionsByGroup(db, testId) {
  const groups = { A: [], B: [] };
  for (const row of db.prepare("SELECT * FROM test_question WHERE test_id = ? ORDER BY handout_group, position").all(testId)) {
    groups[row.handout_group].push(row);
  }
  return groups;
}

/** The students marked present in a started sitting of the test: the rows of its correction table. */
function presentStudents(db, testId) {
  return db
    .prepare(
      `SELECT DISTINCT p.username FROM sitting_participant p JOIN sitting s ON s.id = p.sitting_id
       WHERE s.test_id = ? AND s.started_at IS NOT NULL AND p.present = 1`
    )
    .all(testId)
    .map((row) => row.username);
}

/** Every grade of the test, by `username` to a map from question id to grade. */
function gradesOf(db, testId) {
  const grades = new Map();
  const rows = db
    .prepare(
      `SELECT g.test_question_id, g.username, g.grade FROM question_grade g JOIN test_question q ON q.id = g.test_question_id
       WHERE q.test_id = ?`
    )
    .all(testId);
  for (const row of rows) {
    if (!grades.has(row.username)) grades.set(row.username, new Map());
    grades.get(row.username).set(row.test_question_id, row.grade);
  }
  return grades;
}

/**
 * The fraction a student's `grades` give over `questions` on `scale`: the
 * weighted mean of each grade's band midpoint, or null until every question
 * has a grade, and for a group without a question.
 */
export function weightedResult(questions, grades, scale) {
  if (questions.length === 0) return null;
  let total = 0;
  let sum = 0;
  for (const question of questions) {
    const grade = grades.get(question.id);
    if (grade === undefined) return null;
    total += question.weight;
    sum += question.weight * bandMidpoint(grade, scale);
  }
  return sum / total;
}

/**
 * The results of every test on paper of a course, as the gradebook reads
 * them: `Map(testId → { test, rows: Map(username → { group, value }) })`,
 * `value` the fraction before the factor A:B, null while incomplete. Only
 * students with a row in the correction table appear.
 */
export function paperResults(db, courseId, scale) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('test') WHERE name = 'paper'").get()) return new Map();
  const tests = db.prepare("SELECT * FROM test WHERE course_id = ? AND paper = 1").all(courseId);
  if (tests.length === 0) return new Map();
  const groups = countingGroups(db, courseId);
  return new Map(
    tests.map((test) => {
      const questions = questionsByGroup(db, test.id);
      const grades = gradesOf(db, test.id);
      const twoGroups = hasTwoGroups(db, test);
      const rows = new Map(
        presentStudents(db, test.id).map((username) => {
          const group = countingGroupOf(groups, test, twoGroups, username);
          return [username, { group, value: weightedResult(questions[group], grades.get(username) ?? new Map(), scale) }];
        })
      );
      return [test.id, { test, rows }];
    })
  );
}

/** The display name of a student, as the attendance table shows it. */
function studentNames(db, usernames) {
  const read = db.prepare("SELECT given_name, family_name FROM student WHERE username = ?");
  return new Map(
    usernames.map((username) => {
      const row = read.get(username);
      return [username, { givenName: row?.given_name ?? null, familyName: row?.family_name ?? null }];
    })
  );
}

/**
 * The correction table of a test on paper (design D8): the questions of each
 * group in their order with weight and the name in the course's language,
 * and one row per student present in a started sitting, ordered by name,
 * with the group that counts for them, their grades by question id, and
 * their result once complete - `value` before, `counted` after the factor
 * A:B, capped at 1. `scale` is the grading scale as it is now.
 */
export function correctionTable(db, testId, scale) {
  const test = paperTest(db, testId);
  const course = getCourse(db, test.course_id);
  const nameColumn = course.language === "en" ? "name_en" : "name_de";
  const questions = questionsByGroup(db, testId);
  const grades = gradesOf(db, testId);
  const groups = countingGroups(db, test.course_id);
  const usernames = presentStudents(db, testId);
  const names = studentNames(db, usernames);
  const twoGroups = hasTwoGroups(db, test);
  const factor = { a: test.group_factor_a ?? 1, b: test.group_factor_b ?? 1 };
  const rows = usernames
    .map((username) => {
      const group = countingGroupOf(groups, test, twoGroups, username);
      const own = grades.get(username) ?? new Map();
      const value = weightedResult(questions[group], own, scale);
      const times = twoGroups ? (group === "A" ? factor.a : factor.b) : 1;
      return {
        username,
        ...names.get(username),
        group,
        grades: Object.fromEntries(questions[group].filter((question) => own.has(question.id)).map((question) => [question.id, own.get(question.id)])),
        value,
        counted: value === null ? null : Math.min(1, value * times),
      };
    })
    .sort((a, b) => (a.familyName ?? "").localeCompare(b.familyName ?? "") || (a.givenName ?? "").localeCompare(b.givenName ?? "") || a.username.localeCompare(b.username));
  const view = (rowsOfGroup) =>
    rowsOfGroup.map((question, index) => ({ id: question.id, n: index + 1, name: question[nameColumn], type: question.type, weight: question.weight }));
  return {
    testId,
    name: test.name,
    twoGroups,
    factor: twoGroups ? factor : { a: 1, b: 1 },
    questions: { A: view(questions.A), B: twoGroups ? view(questions.B) : [] },
    rows,
  };
}

/**
 * Sets the grade of `username` for the question `testQuestionId` of a test
 * on paper, or removes it with `grade` null (design D4, D8): a whole number
 * from 1 to 5, only for a student present in a started sitting of the test
 * and a question of the group that counts for them. Answers that student's
 * row of the correction table.
 */
export function setQuestionGrade(db, testId, testQuestionId, username, grade, scale) {
  const test = paperTest(db, testId);
  const name = String(username ?? "").trim().toLowerCase();
  if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 5)) throw new InvalidInputError("exam.errors.paper.gradeRange");
  const question = db.prepare("SELECT * FROM test_question WHERE test_id = ? AND id = ?").get(testId, testQuestionId);
  if (!question) throw new NotFoundError("exam.errors.tests.questionNotInTest");
  if (!presentStudents(db, testId).includes(name)) throw new NotFoundError("exam.errors.paper.notPresent");
  const group = countingGroupOf(countingGroups(db, test.course_id), test, hasTwoGroups(db, test), name);
  if (question.handout_group !== group) throw new ConflictError("exam.errors.paper.otherGroup", { group });
  if (grade === null) {
    db.prepare("DELETE FROM question_grade WHERE test_question_id = ? AND username = ?").run(question.id, name);
  } else {
    db.prepare(
      `INSERT INTO question_grade (test_question_id, username, grade, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (test_question_id, username) DO UPDATE SET grade = excluded.grade, updated_at = excluded.updated_at`
    ).run(question.id, name, grade, now());
  }
  return correctionTable(db, testId, scale).rows.find((row) => row.username === name);
}
