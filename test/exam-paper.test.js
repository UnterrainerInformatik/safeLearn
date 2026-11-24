/**
 * Weights and tests on paper composed from the pool (pool-quickie:
 * `online-test`, `offline-test-questions`, `offline-test`, `gradebook-sheet`,
 * `exam-attempt-review`), unit by unit: an online test's weights and the
 * weighted score, the review and the sheet out of the total weight; a test on
 * paper composed from choice and free-text questions per group, its weights
 * and answer lines, its snapshot from the first started sitting, the start
 * refused without a question; the correction table, its grades and the
 * result as the weighted mean of band midpoints with the factor A:B on top;
 * the computed, read-only column; discarding, deleting and the leavers'
 * purge; and the print routes, a teacher's only, through a local express app.
 *
 * No browser, no login: every database lives in a temporary directory
 * removed after the check. The same behaviour in the running app is
 * `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import express from "express";

import { createClass, createCourse, createYear } from "../exam/classes.js";
import { openDatabase } from "../exam/db.js";
import { courseColumns, courseOverview, deleteResult, evaluateColumn, readScale, setResult, studentRecord, updateColumn, updateScale } from "../exam/gradebook.js";
import { importPool } from "../exam/pool-import.js";
import { getQuestion, listQuestions } from "../exam/pool.js";
import { createQuestion, deleteQuestion, saveQuestion } from "../exam/pool-edit.js";
import {
  createOfflineTest,
  createSitting,
  createTest,
  deleteTest,
  discardTest,
  endSitting,
  getTest,
  listTests,
  removeWrittenQuestion,
  setAttendance,
  setQuestionSettings,
  startSitting,
  updateTest,
} from "../exam/tests.js";
import { openTestsOf, reviewView, scoreAttempt, startAttempt, submitAttempt } from "../exam/attempts.js";
import { correctionTable, setQuestionGrade } from "../exam/paper-grades.js";
import { liveSnapshot } from "../exam/live.js";
import { init } from "../exam/index.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-paper-"));
  temporaryDirs.push(dir);
  return path.join(dir, "exam.sqlite");
}

/** A trimmed Moodle export: a multichoiceset, a multichoice, a true/false and one more multichoice. */
function poolXml(lang) {
  const de = lang === "de";
  const choice = (name, text, answers, type = "multichoice") => `
  <question type="${type}"><name><text>${name} ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>${text} ${lang}</p>]]></text></questiontext>
    ${answers.map(([fraction, answer]) => `<answer fraction="${fraction}" format="html"><text><![CDATA[<p>${answer}</p>]]></text></answer>`).join("")}
  </question>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/HTTP/${de ? "Grundlagen" : "Basics"}</text></category></question>
  ${choice("Methoden", `idempotent (2 ${de ? "richtige Antworten" : "correct answers"})`, [["50", "GET"], ["50", "PUT"], ["0", "POST"]], "multichoiceset")}
  ${choice("Status", `not found (1 ${de ? "richtige Antwort" : "correct answer"})`, [["100", "404"], ["0", "500"]])}
  ${choice("Cache", `cache (1 ${de ? "richtige Antwort" : "correct answer"})`, [["100", "max-age"], ["0", "nope"]])}
  <question type="truefalse"><name><text>Wahr ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>statement ${lang}</p>]]></text></questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>
</quiz>`;
}

/** A database with the pool, two free-text questions, the class 4ahif with three students and the course POS in German. */
function seeded({ language = "de" } = {}) {
  const { db } = openDatabase(temporaryPath());
  openDatabases.push(db);
  importPool(db, poolXml("de"), poolXml("en"));
  const byName = () => Object.fromEntries(listQuestions(db).map((q) => [q.nameDe, q.id]));
  const categoryId = getQuestion(db, byName()["Methoden de"]).categoryId;
  const freetext = (nameDe, nameEn) =>
    createQuestion(db, {
      categoryId,
      type: "freetext",
      nameDe,
      nameEn,
      textDe: `<p>${nameDe}?</p>`,
      textEn: `<p>${nameEn}?</p>`,
      solutionDe: `<p>Lösung ${nameDe}</p>`,
      solutionEn: `<p>Solution ${nameEn}</p>`,
      answers: [],
    }).question.id;
  freetext("PUT und PATCH", "PUT and PATCH");
  freetext("REST", "REST");
  const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
  const klass = createClass(db, year.id, { name: "4ahif", students: [{ username: "anna" }, { username: "ben" }, { username: "cara" }] });
  const course = createCourse(db, klass.id, { subject: "POS", language });
  return { db, year, klass, course, ids: byName() };
}

const inMinutes = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();
const keyOf = (fn) => {
  try {
    fn();
  } catch (error) {
    return error.key ?? error.message;
  }
  return null;
};
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ""} ${actual} ≠ ${expected}`);

/** The question copy of `test` for the pool question `questionId` in `group`. */
const copyOf = (test, questionId, group = "A") => test.questions.find((question) => question.questionId === questionId && question.group === group);

/** `Quickie REST`: two free-text questions and a multichoiceset in group A, a short test of 15 minutes. */
function quickie(db, course, ids) {
  return createOfflineTest(db, course.id, {
    name: "Quickie REST",
    durationMinutes: 15,
    gradebookKind: "shorttest",
    questionIds: [ids["PUT und PATCH"], ids["Methoden de"], ids.REST],
  });
}

/** `quickie` with a started sitting for the whole class, everybody present in group A. */
function writtenQuickie(db, course, ids) {
  const test = quickie(db, course, ids);
  const sitting = createSitting(db, test.id, { opensAt: inMinutes(30) });
  startSitting(db, sitting.id);
  return { test: getTest(db, test.id), sitting };
}

describe("the weights of an online test", () => {
  /** `HTTP caching`: four choice questions, the last weighing 3, and a sitting open now. */
  function weighted(db, course, ids) {
    const test = createTest(db, course.id, { name: "HTTP caching", questionIds: [ids["Status de"], ids["Cache de"], ids["Wahr de"], ids["Methoden de"]] });
    const answer = setQuestionSettings(db, test.id, copyOf(test, ids["Methoden de"]).id, { weight: 3 });
    createSitting(db, test.id, { opensAt: inMinutes(-1), closesAt: inMinutes(60), durationMinutes: 20 });
    return answer;
  }

  test("a weight is set on the test's page before the sitting, and the page shows the total weight", () => {
    const { db, course, ids } = seeded();
    const test = weighted(db, course, ids);
    assert.equal(test.totalWeight.A, 6, "Weighting before the sitting");
    assert.equal(copyOf(test, ids["Methoden de"]).weight, 3);
    assert.equal(copyOf(test, ids["Status de"]).weight, 1, "a new question weighs 1");
    for (const weight of [0, 11, 2.5, "3"]) {
      assert.equal(keyOf(() => setQuestionSettings(db, test.id, copyOf(test, ids["Status de"]).id, { weight })), "exam.errors.tests.weight", `${weight} is refused`);
    }
    assert.equal(getTest(db, test.id).totalWeight.A, 6, "and the weight stays");
    const swapped = updateTest(db, test.id, { questionIds: [ids["Methoden de"], ids["Status de"]] });
    assert.equal(copyOf(swapped, ids["Methoden de"]).weight, 3, "a question kept in a new choice keeps its weight");
    assert.equal(swapped.totalWeight.A, 4);
  });

  test("a weighted question: 3/6 and the result 0.5, in the sheet, the result view and the review, and locked after the first attempt", () => {
    const { db, course, ids } = seeded();
    const test = weighted(db, course, ids);
    const { attemptId } = startAttempt(db, "anna", test.id);
    assert.equal(keyOf(() => setQuestionSettings(db, test.id, copyOf(test, ids["Status de"]).id, { weight: 2 })), "exam.errors.tests.weightLocked", "After the first attempt");
    assert.equal(getTest(db, test.id).totalWeight.A, 6);
    assert.equal(db.prepare("SELECT question_count FROM attempt WHERE id = ?").get(attemptId).question_count, 6, "the attempt's total weight");
    // The three of weight 1 right, the one of weight 3 wrong.
    const tokens = db
      .prepare(
        `SELECT t.token, a.correct, q.weight FROM attempt_token t JOIN test_answer a ON a.id = t.test_answer_id JOIN test_question q ON q.id = a.test_question_id WHERE t.attempt_id = ?`
      )
      .all(attemptId);
    for (const token of tokens) {
      if ((token.weight === 1 && token.correct === 1) || (token.weight === 3 && token.correct === 0)) {
        db.prepare("INSERT INTO response (attempt_id, test_answer_id) SELECT attempt_id, test_answer_id FROM attempt_token WHERE token = ?").run(token.token);
      }
    }
    assert.equal(scoreAttempt(db, attemptId), 3);
    submitAttempt(db, db.prepare("SELECT * FROM attempt WHERE id = ?").get(attemptId));
    const row = db.prepare("SELECT * FROM attempt WHERE id = ?").get(attemptId);
    assert.deepEqual([row.score, row.question_count], [3, 6]);
    const review = reviewView(db, row);
    assert.deepEqual([review.score, review.questionCount, review.weighted], [3, 6, true], "Weighted questions (review)");
    assert.deepEqual(review.questions.map((question) => question.weight).sort(), [1, 1, 1, 3]);
    const sheet = courseOverview(db, course.id, "ws");
    const column = sheet.columns.find((candidate) => candidate.id === `test-${test.id}`);
    assert.equal(column.maxPoints, 6, "the column is out of the total weight");
    const field = sheet.students.find((student) => student.username === "anna").results[column.id];
    assert.deepEqual([field.points, field.value], [3, 0.5], "A weighted test (sheet)");
  });

  test("an old test keeps 3/4 with every weight at 1, and an admin's removal scores again with the weights", () => {
    const { db, course, ids } = seeded();
    const test = createTest(db, course.id, { name: "Old", questionIds: [ids["Status de"], ids["Cache de"], ids["Wahr de"], ids["Methoden de"]] });
    assert.ok(getTest(db, test.id).questions.every((question) => question.weight === 1), "An old test");
    createSitting(db, test.id, { opensAt: inMinutes(-1), closesAt: inMinutes(60), durationMinutes: 20 });
    const { attemptId } = startAttempt(db, "anna", test.id);
    const correct = db
      .prepare(
        `SELECT t.token, q.name_de FROM attempt_token t JOIN test_answer a ON a.id = t.test_answer_id JOIN test_question q ON q.id = a.test_question_id WHERE t.attempt_id = ? AND a.correct = 1`
      )
      .all(attemptId);
    for (const token of correct.filter((token) => token.name_de !== "Methoden de")) {
      db.prepare("INSERT INTO response (attempt_id, test_answer_id) SELECT attempt_id, test_answer_id FROM attempt_token WHERE token = ?").run(token.token);
    }
    submitAttempt(db, db.prepare("SELECT * FROM attempt WHERE id = ?").get(attemptId));
    const read = () => db.prepare("SELECT score, question_count FROM attempt WHERE id = ?").get(attemptId);
    assert.deepEqual({ ...read() }, { score: 3, question_count: 4 });
    // The admin's weight change is the database's; a removal counts the weights left.
    db.prepare("UPDATE test_question SET weight = 2 WHERE test_id = ? AND name_de = 'Status de'").run(test.id);
    const methods = copyOf(getTest(db, test.id), ids["Methoden de"]);
    removeWrittenQuestion(db, test.id, methods.id, scoreAttempt);
    assert.deepEqual({ ...read() }, { score: 4, question_count: 4 }, "2 + 1 + 1 out of 2 + 1 + 1");
  });
});

describe("a test on paper composed from the pool", () => {
  test("composing a short test: three questions in group A, listed as an offline test with its usage, without a handout", () => {
    const { db, course, ids } = seeded();
    const test = quickie(db, course, ids);
    assert.equal(test.kind, "offline");
    assert.equal(test.paper, true);
    assert.equal(test.gradebookKind, "shorttest");
    assert.deepEqual(test.handouts, []);
    assert.deepEqual(test.questions.map((question) => [question.nameDe, question.group, question.weight]), [
      ["PUT und PATCH", "A", 1],
      ["Methoden de", "A", 1],
      ["REST", "A", 1],
    ]);
    assert.equal(copyOf(test, ids.REST).answerLines, 6, "a free-text question leaves 6 lines");
    assert.equal(copyOf(test, ids.REST).solutionDe, "<p>Lösung REST</p>");
    const listed = listTests(db, { courseId: course.id }).groups[0].tests.find((candidate) => candidate.id === test.id);
    assert.deepEqual([listed.kind, listed.paper, listed.questions], ["offline", true, 3]);
    assert.equal(getQuestion(db, ids.REST).usage.length, 1, "the usage of POS 4AHIF");
    assert.equal(test.twoGroups, false);
  });

  test("a test on paper without a question, a handout on one, and questions on a test with a handout are refused", () => {
    const { db, course, ids } = seeded();
    assert.equal(keyOf(() => createOfflineTest(db, course.id, { name: "Empty", durationMinutes: 15, gradebookKind: "shorttest", questionIds: [] })), "exam.errors.tests.oneQuestion");
    const test = quickie(db, course, ids);
    assert.equal(keyOf(() => updateTest(db, test.id, { handoutA: "POS/LT1-A.md" })), "exam.errors.tests.handoutsOrQuestions", "A handout on a test with questions");
    assert.deepEqual(getTest(db, test.id).handouts, []);
    const plain = createOfflineTest(db, course.id, { name: "Plain", durationMinutes: 50, gradebookKind: "test" });
    assert.equal(keyOf(() => updateTest(db, plain.id, { questionIds: [ids.REST] })), "exam.errors.tests.offlineNoQuestions", "an offline test without questions stays one");
    assert.equal(keyOf(() => createTest(db, course.id, { name: "Online", questionIds: [ids.REST] })), "exam.errors.tests.freetextOnline", "an online test holds no free-text question");
  });

  test("group B has its own selection: two groups, a question in both, B emptied leaves one group, A emptied makes B's questions A's", () => {
    const { db, course, ids } = seeded();
    const test = quickie(db, course, ids);
    const two = updateTest(db, test.id, { group: "B", questionIds: [ids["Status de"], ids["Cache de"], ids["Wahr de"], ids.REST] });
    assert.equal(two.questions.filter((question) => question.group === "A").length, 3, "Two selections");
    assert.equal(two.questions.filter((question) => question.group === "B").length, 4);
    assert.equal(two.twoGroups, true);
    assert.deepEqual(two.totalWeight, { A: 3, B: 4 });
    const sitting = createSitting(db, test.id, { opensAt: inMinutes(30) });
    assert.deepEqual(setAttendance(db, sitting.id, "ben", { group: "B" }), { username: "ben", present: true, group: "B" }, "the attendance table offers group B");
    assert.equal(liveSnapshot(db, sitting.id).test.twoGroups, true);
    const one = updateTest(db, test.id, { group: "B", questionIds: [] });
    assert.equal(one.twoGroups, false, "Group B emptied");
    assert.equal(keyOf(() => setAttendance(db, sitting.id, "cara", { group: "B" })), "exam.errors.tests.noHandoutB");
    updateTest(db, test.id, { group: "B", questionIds: [ids["Status de"]] });
    const moved = updateTest(db, test.id, { group: "A", questionIds: [] });
    assert.deepEqual(moved.questions.map((question) => [question.nameDe, question.group]), [["Status de", "A"]], "group A emptied: B's questions are A's");
    assert.equal(moved.twoGroups, false);
    const reordered = updateTest(db, test.id, { questionIds: [ids.REST, ids["Status de"]] });
    assert.deepEqual(reordered.questions.map((question) => question.nameDe), ["REST", "Status de"]);
  });

  test("weights and answer lines per group and question, refused out of range, changeable after the start", () => {
    const { db, course, ids } = seeded();
    const { test } = writtenQuickie(db, course, ids);
    const second = copyOf(test, ids["Methoden de"]);
    const answer = setQuestionSettings(db, test.id, second.id, { weight: 3 });
    assert.equal(answer.totalWeight.A, 5, "Weighting a question: total weight 5 for three questions");
    for (const weight of [0, 11]) assert.equal(keyOf(() => setQuestionSettings(db, test.id, second.id, { weight })), "exam.errors.tests.weight", "A weight out of range");
    const rest = copyOf(test, ids.REST);
    assert.equal(setQuestionSettings(db, test.id, rest.id, { answerLines: 12 }).questions.find((question) => question.id === rest.id).answerLines, 12);
    for (const answerLines of [0, 41]) assert.equal(keyOf(() => setQuestionSettings(db, test.id, rest.id, { answerLines })), "exam.errors.tests.answerLines");
    assert.equal(keyOf(() => setQuestionSettings(db, test.id, second.id, { answerLines: 3 })), "exam.errors.tests.answerLinesFreetext", "a choice question has no answer space");
    assert.equal(getTest(db, test.id).totalWeight.A, 5);
  });

  test("the questions follow the pool until the first sitting is started, then the snapshot holds; the start is refused without a question", () => {
    const { db, course, ids } = seeded();
    const test = quickie(db, course, ids);
    const edit = (id, text) => {
      const question = getQuestion(db, id);
      saveQuestion(db, id, {
        categoryId: question.categoryId,
        type: question.type,
        nameDe: question.nameDe,
        nameEn: question.nameEn,
        textDe: text,
        textEn: question.textEn,
        solutionDe: question.solutionDe,
        solutionEn: question.solutionEn,
        answers: [],
        version: question.version,
      });
    };
    edit(ids.REST, "<p>REST, fixed typo?</p>");
    assert.equal(copyOf(getTest(db, test.id), ids.REST).textDe, "<p>REST, fixed typo?</p>", "A typo fixed before the test");
    const sitting = createSitting(db, test.id, { opensAt: inMinutes(-5) });
    assert.equal(getTest(db, test.id).begun, false, "a planned time past is no start");
    startSitting(db, sitting.id);
    assert.equal(getTest(db, test.id).begun, true);
    edit(ids.REST, "<p>REST, edited after the start?</p>");
    assert.equal(copyOf(getTest(db, test.id), ids.REST).textDe, "<p>REST, fixed typo?</p>", "Edited after the start");
    assert.equal(keyOf(() => updateTest(db, test.id, { questionIds: [ids.REST] })), "exam.errors.tests.paperQuestionsFixed");

    const only = createOfflineTest(db, course.id, { name: "Only", durationMinutes: 15, gradebookKind: "shorttest", questionIds: [ids["PUT und PATCH"]] });
    const planned = createSitting(db, only.id, { opensAt: inMinutes(30) });
    const usage = getQuestion(db, ids["PUT und PATCH"]).pendingTests.length;
    deleteQuestion(db, ids["PUT und PATCH"], { tests: usage });
    assert.equal(getTest(db, only.id).paper, true, "still a test on paper");
    assert.equal(keyOf(() => startSitting(db, planned.id)), "exam.errors.tests.noQuestionsToStart", "The only question deleted");
    assert.equal(getTest(db, only.id).sittings[0].startedAt, null);
  });

  test("nothing of a test on paper reaches a student: the Exams page shows its name and time only", () => {
    const { db, course, ids } = seeded();
    const { test } = writtenQuickie(db, course, ids);
    const open = openTestsOf(db, "anna");
    const entry = open.find((candidate) => candidate.testId === test.id);
    assert.ok(entry, "During the window");
    assert.equal(entry.handout, null);
    assert.doesNotMatch(JSON.stringify(open), /PUT und PATCH|Lösung|REST\?/, "no question text, name or model solution");
    assert.equal(keyOf(() => startAttempt(db, "anna", test.id)), "exam.errors.attempts.offlineTest");
  });
});

describe("the correction table and the result", () => {
  test("a row per present student, a grade from 1 to 5 per question of their group, the result once complete", () => {
    const { db, course, ids } = seeded();
    const { test, sitting } = writtenQuickie(db, course, ids);
    setAttendance(db, sitting.id, "cara", { present: false });
    const scale = readScale(db);
    const table = correctionTable(db, test.id, scale);
    assert.deepEqual(table.rows.map((row) => row.username).sort(), ["anna", "ben"], "An absent student has no row");
    assert.deepEqual(table.questions.A.map((question) => question.n), [1, 2, 3]);
    const [q1, q2, q3] = table.questions.A;
    setQuestionSettings(db, test.id, q2.id, { weight: 2 });
    setQuestionGrade(db, test.id, q1.id, "anna", 1, scale);
    const partial = setQuestionGrade(db, test.id, q2.id, "anna", 2, scale);
    assert.equal(partial.value, null, "Not yet complete");
    const full = setQuestionGrade(db, test.id, q3.id, "anna", 5, scale);
    near(full.value, (0.94 + 2 * 0.815 + 0.25) / 4, "A weighted result: 70.5 %");
    for (const grade of [0, 6, 2.5]) assert.equal(keyOf(() => setQuestionGrade(db, test.id, q1.id, "anna", grade, scale)), "exam.errors.paper.gradeRange", "A grade out of range");
    assert.equal(correctionTable(db, test.id, scale).rows.find((row) => row.username === "anna").grades[q1.id], 1, "the stored grade stays");
    assert.equal(keyOf(() => setQuestionGrade(db, test.id, q1.id, "cara", 2, scale)), "exam.errors.paper.notPresent");
    for (const question of table.questions.A) setQuestionGrade(db, test.id, question.id, "ben", 4, scale);
    near(correctionTable(db, test.id, scale).rows.find((row) => row.username === "ben").value, 0.565, "All fours");
    assert.equal(setQuestionGrade(db, test.id, q1.id, "ben", null, scale).value, null, "a grade removed");
  });

  test("the column is computed, read-only, follows the scale and the weights, counts in the category and shows in the evaluation", () => {
    const { db, course, ids } = seeded();
    const { test } = writtenQuickie(db, course, ids);
    const scale = readScale(db);
    const [q1, q2, q3] = correctionTable(db, test.id, scale).questions.A;
    setQuestionSettings(db, test.id, q2.id, { weight: 2 });
    setQuestionGrade(db, test.id, q1.id, "anna", 1, scale);
    setQuestionGrade(db, test.id, q2.id, "anna", 2, scale);
    setQuestionGrade(db, test.id, q3.id, "anna", 5, scale);
    setQuestionGrade(db, test.id, q1.id, "ben", 2, scale);
    const sheet = () => courseOverview(db, course.id, "ws");
    const column = sheet().columns.find((candidate) => candidate.id === test.assessmentId);
    assert.deepEqual([column.paper, column.readOnly, column.results], [true, true, 1], "A computed field");
    const field = () => sheet().students.find((student) => student.username === "anna").results[column.id];
    near(field().value, 0.705);
    assert.equal(sheet().students.find((student) => student.username === "ben").results[column.id], undefined, "an incomplete row has no result");
    assert.equal(studentRecord(db, course.id, "anna").semesters.ws.categories.shortTests.grade, 3, "the scale grades 70.5 % a 3");
    assert.equal(keyOf(() => setResult(db, column.id, "anna", { percent: 50 })), "exam.errors.gradebook.columnComputed");
    assert.equal(keyOf(() => deleteResult(db, column.id, "anna")), "exam.errors.gradebook.columnComputed");
    assert.equal(keyOf(() => updateColumn(db, column.id, { maxPoints: 20 })), "exam.errors.gradebook.columnComputed");
    assert.equal(updateColumn(db, column.id, { name: "Quickie REST (B)" }).name, "Quickie REST (B)", "its name still changes");
    const evaluation = evaluateColumn(db, course.id, String(column.id));
    assert.deepEqual([evaluation.results, evaluation.distribution[3]], [1, 1], "the evaluation shows the same values");
    updateScale(db, { 1: 88, 2: 77, 3: 63, 4: 50 });
    near(field().value, (0.94 + 2 * 0.825 + 0.25) / 4, "The scale moves: grade 2 counts 82.5 %");
    setQuestionSettings(db, test.id, q2.id, { weight: 1 });
    near(field().value, (0.94 + 0.825 + 0.25) / 3, "a weight changes every result at once");
    assert.equal(keyOf(() => deleteTest(db, test.id)), "exam.errors.tests.offlineHasResults", "deleting is refused while a grade exists");
  });

  test("two groups: the factor A:B raises the result, a moved student keeps their grades, the correction table shows both", () => {
    const { db, course, ids } = seeded();
    const test = quickie(db, course, ids);
    updateTest(db, test.id, { group: "B", questionIds: [ids["Status de"], ids.REST] });
    const sitting = createSitting(db, test.id, { opensAt: inMinutes(30) });
    setAttendance(db, sitting.id, "ben", { group: "B" });
    startSitting(db, sitting.id);
    const scale = readScale(db);
    const table = correctionTable(db, test.id, scale);
    assert.equal(table.twoGroups, true);
    assert.deepEqual(table.rows.map((row) => [row.username, row.group]).sort(), [["anna", "A"], ["ben", "B"], ["cara", "A"]]);
    // ben: 1, 5 → (0.94 + 0.25) / 2 = 59.5 %, raised by 1.20 to 71.4 %.
    const [b1, b2] = table.questions.B;
    setQuestionGrade(db, test.id, b1.id, "ben", 1, scale);
    setQuestionGrade(db, test.id, b2.id, "ben", 5, scale);
    assert.equal(keyOf(() => setQuestionGrade(db, test.id, table.questions.A[0].id, "ben", 2, scale)), "exam.errors.paper.otherGroup");
    const column = courseColumns(db, course.id).find((candidate) => candidate.id === test.assessmentId);
    assert.equal(column.twoHandouts, true, "the dialog offers the factor");
    updateColumn(db, column.id, { groupFactor: { a: 1, b: 1.2 } });
    const row = correctionTable(db, test.id, scale).rows.find((candidate) => candidate.username === "ben");
    near(row.value, 0.595);
    near(row.counted, 0.714, "Two question groups: the correction table shows both");
    const field = courseOverview(db, course.id, "ws").students.find((student) => student.username === "ben").results[column.id];
    near(field.value, 0.714);
    near(field.enteredValue, 0.595);
    // Moved to group A: their B grades are kept and their A fields are empty.
    for (const question of table.questions.A) setQuestionGrade(db, test.id, question.id, "anna", 3, scale);
    setAttendance(db, sitting.id, "ben", { group: "A" });
    const moved = correctionTable(db, test.id, scale).rows.find((candidate) => candidate.username === "ben");
    assert.deepEqual([moved.group, moved.grades, moved.value], ["A", {}, null], "Moved to the other group");
    setAttendance(db, sitting.id, "ben", { group: "B" });
    near(correctionTable(db, test.id, scale).rows.find((candidate) => candidate.username === "ben").value, 0.595, "back in B, the grades count again");
  });

  test("a retake writes over the earlier grades; discarding deletes the grades it counted; the purge removes a leaver's", () => {
    const { db, course, ids } = seeded();
    const { test, sitting } = writtenQuickie(db, course, ids);
    const scale = readScale(db);
    const [q1, q2, q3] = correctionTable(db, test.id, scale).questions.A;
    for (const question of [q1, q2, q3]) setQuestionGrade(db, test.id, question.id, "anna", 4, scale);
    endSitting(db, sitting.id);
    const makeup = createSitting(db, test.id, { opensAt: inMinutes(60), retakes: ["anna"] });
    startSitting(db, makeup.id);
    setQuestionGrade(db, test.id, q1.id, "anna", 1, scale);
    setQuestionGrade(db, test.id, q2.id, "anna", 2, scale);
    const row = correctionTable(db, test.id, scale).rows.find((candidate) => candidate.username === "anna");
    assert.deepEqual(row.grades, { [q1.id]: 1, [q2.id]: 2, [q3.id]: 4 }, "A retake of a test with questions");
    near(row.value, (0.94 + 0.815 + 0.565) / 3);
    endSitting(db, makeup.id);
    const shown = getTest(db, test.id);
    assert.deepEqual(shown.discard, { allowed: true, results: 1 }, "the discard count is the students graded");
    assert.equal(keyOf(() => discardTest(db, test.id, { attempts: 0 })), "exam.errors.tests.attemptsChanged");
    discardTest(db, test.id, { attempts: 1 });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question_grade").get().n, 0, "the grades went");
    assert.equal(getTest(db, test.id).questions.length, 3, "the test keeps its questions");
  });
});

describe("the printed sheet and the routes", () => {
  test("a teacher prints a group's sheet and solution in the course's language; a student is refused every route", async () => {
    const dbPath = temporaryPath();
    const saved = { path: process.env.EXAM_DB_PATH, periods: process.env.SCHOOL_PERIODS, fetch: global.fetch };
    process.env.EXAM_DB_PATH = dbPath;
    delete process.env.SCHOOL_PERIODS;
    const started = await init({ startPage: () => "/index.html", renderHandout: async () => "" });
    const { db } = openDatabase(dbPath);
    openDatabases.push(db);
    importPool(db, poolXml("de"), poolXml("en"));
    const byName = Object.fromEntries(listQuestions(db).map((q) => [q.nameDe, q.id]));
    const categoryId = getQuestion(db, byName["Methoden de"]).categoryId;
    const free = createQuestion(db, {
      categoryId,
      type: "freetext",
      nameDe: "PUT und PATCH",
      nameEn: "PUT and PATCH",
      textDe: "<p>Erkläre PUT und PATCH.</p>",
      textEn: "<p>Explain PUT and PATCH.</p>",
      solutionDe: "<p>MUSTERLÖSUNG</p>",
      solutionEn: "<p>MODEL</p>",
      answers: [],
    }).question.id;
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const klass = createClass(db, year.id, { name: "4ahif", students: [{ username: "anna" }, { username: "ben" }] });
    const course = createCourse(db, klass.id, { subject: "POS", language: "de" });
    const test = createOfflineTest(db, course.id, { name: "Quickie REST", durationMinutes: 15, gradebookKind: "shorttest", questionIds: [free, byName["Methoden de"], byName["Wahr de"]] });
    setQuestionSettings(db, test.id, copyOf(getTest(db, test.id), byName["Methoden de"]).id, { weight: 2 });
    updateTest(db, test.id, { group: "B", questionIds: [byName["Status de"]] });
    createSitting(db, test.id, { opensAt: "2026-11-25T08:00:00.000Z" });
    global.fetch = async () => ({ ok: true, json: async () => ({ attributes: { config: [JSON.stringify({ vt: 1 })] } }) });
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const username = req.get("X-As");
      req.user = {
        name: username,
        preferred_username: username,
        accessToken: "access-token",
        accessTokenDecoded: { preferred_username: username },
        keycloakConfig: { "auth-server-url": "https://identity.example/", realm: "demo", resource: "safelearn" },
        rolesCalculated: JSON.stringify({ [req.get("X-Role")]: true }),
      };
      next();
    });
    app.use("/exam", started.router);
    app.use((req, res) => res.status(404).send("UNMATCHED"));
    const server = app.listen(0);
    try {
      const base = `http://127.0.0.1:${server.address().port}/exam`;
      const ask = async (url, as = "tdent", role = "teacher", init = {}) => {
        const answer = await saved.fetch(`${base}${url}`, { ...init, headers: { "X-As": as, "X-Role": role, "Content-Type": "application/json", ...(init.headers ?? {}) } });
        return { status: answer.status, text: await answer.text() };
      };
      const sheet = await ask(`/tests/${test.id}/sheets/A/print`);
      assert.equal(sheet.status, 200, "Printing group A");
      for (const part of ["Quickie REST", "4AHIF", "25.11.2026", "Gruppe A", "Name:", "Frage 1", "Gewicht 2", "Erkläre PUT und PATCH.", "☐"]) assert.ok(sheet.text.includes(part), `the sheet holds ${part}`);
      assert.equal((sheet.text.match(/class="sl-paper-line"/g) ?? []).length, 6, "six empty lines under the free-text question");
      assert.ok(!sheet.text.includes("MUSTERLÖSUNG") && !sheet.text.includes("☒"), "no solution on the sheet");
      assert.ok(!sheet.text.includes("sl-exam-bar"), "no element of the module around it");
      const solution = await ask(`/tests/${test.id}/sheets/A/solution/print`);
      assert.equal(solution.status, 200, "Printing the solution");
      assert.ok(solution.text.includes("MUSTERLÖSUNG") && solution.text.includes("☒"), "ticked boxes and the model solution");
      assert.ok(!solution.text.includes('class="sl-paper-line"'), "no empty lines in the solution");
      assert.equal((await ask(`/tests/${test.id}/sheets/B/print`)).status, 200, "group B of a two-group test");
      assert.equal((await ask(`/tests/${test.id}/sheets/C/print`)).status, 404);
      const sittingId = getTest(db, test.id).sittings[0].id;
      assert.equal((await ask(`/sittings/${sittingId}/sheets/A/print`)).status, 200, "from the sitting's page");
      for (const url of [`/tests/${test.id}/sheets/A/print`, `/tests/${test.id}/sheets/A/solution/print`, `/sittings/${sittingId}/sheets/B/print`]) {
        const refused = await ask(url, "anna", "student");
        assert.notEqual(refused.status, 200, `A student asks for ${url}`);
        assert.ok(!refused.text.includes("PUT und PATCH") && !refused.text.includes("MUSTERLÖSUNG"), "nothing of the questions is revealed");
      }
      assert.equal((await ask(`/api/tests/${test.id}/grades`, "anna", "student")).status, 403, "the correction table is a teacher's");
      const weight = copyOf(getTest(db, test.id), free).id;
      assert.equal((await ask(`/api/tests/${test.id}/questions/${weight}`, "anna", "student", { method: "PUT", body: JSON.stringify({ weight: 3 }) })).status, 403);
      const set = await ask(`/api/tests/${test.id}/questions/${weight}`, "tdent", "teacher", { method: "PUT", body: JSON.stringify({ weight: 3, answerLines: 4 }) });
      assert.equal(set.status, 200);
      assert.deepEqual([copyOf(JSON.parse(set.text), free).weight, copyOf(JSON.parse(set.text), free).answerLines], [3, 4]);
      assert.equal((await ask(`/api/tests/${test.id}/grades`)).status, 200);
      startSitting(db, sittingId);
      const grade = await ask(`/api/tests/${test.id}/grades/${weight}/anna`, "tdent", "teacher", { method: "PUT", body: JSON.stringify({ grade: 2 }) });
      assert.equal(grade.status, 200);
      assert.equal(JSON.parse(grade.text).grades[weight], 2);
      assert.equal((await ask(`/api/tests/${test.id}/grades/${weight}/anna`, "anna", "student", { method: "PUT", body: JSON.stringify({ grade: 1 }) })).status, 403, "a student is refused");
      assert.equal((await ask(`/api/tests/${test.id}/grades/${weight}/anna`, "tdent", "teacher", { method: "PUT", body: JSON.stringify({ grade: 6 }) })).status, 400);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      global.fetch = saved.fetch;
      if (saved.path === undefined) delete process.env.EXAM_DB_PATH;
      else process.env.EXAM_DB_PATH = saved.path;
      if (saved.periods !== undefined) process.env.SCHOOL_PERIODS = saved.periods;
    }
  });
});
