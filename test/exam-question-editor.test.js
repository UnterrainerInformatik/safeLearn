/**
 * The question editor (`question-editor`), unit by unit: the migration that
 * adds it, the validation of a question, saving one without touching any
 * test's snapshot, staged uploads, retiring and deleting, and the category
 * tree.
 *
 * No browser, no login, no server: every database lives in a temporary
 * directory removed after the check. The same behaviour against a running
 * instance is `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, test } from "node:test";

import { createClass, createCourse, createYear } from "../exam/classes.js";
import { migrate, openDatabase, readMigrations } from "../exam/db.js";
import { importPool } from "../exam/pool-import.js";
import { getQuestion, listQuestions } from "../exam/pool.js";
import { createTest, testQuestions, updateTest } from "../exam/tests.js";
import {
  createCategory,
  createQuestion,
  deleteCategory,
  deleteQuestion,
  imageTypeOf,
  purgeUploads,
  QuestionProblemsError,
  questionProblems,
  readUpload,
  retireQuestion,
  reviveQuestion,
  saveQuestion,
  stageUpload,
  updateCategory,
} from "../exam/pool-edit.js";
import { categoryTree } from "../exam/pool.js";
import { ConflictError, InvalidInputError } from "../exam/classes.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-editor-"));
  temporaryDirs.push(dir);
  return path.join(dir, "exam.sqlite");
}

function freshDatabase() {
  const { db } = openDatabase(temporaryPath());
  openDatabases.push(db);
  return db;
}

// A 1×1 PNG.
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** A trimmed Moodle export: two categories, a question with an image, a multichoiceset and a true/false. */
function poolXml(lang) {
  const de = lang === "de";
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/HTTP/${de ? "Grundlagen" : "Basics"}</text></category></question>
  <question type="multichoice"><name><text>Bild ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p><img src="@@PLUGINFILE@@/image.png" alt="">${lang} picture</p>]]></text>
      <file name="image.png" path="/" encoding="base64">${pixel}</file></questiontext>
    <answer fraction="100" format="html"><text><![CDATA[<p>yes ${lang}</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>no ${lang}</p>]]></text></answer>
  </question>
  <question type="multichoiceset"><name><text>Methoden ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>${lang} idempotent</p>]]></text></questiontext>
    <answer fraction="50" format="html"><text><![CDATA[<p>GET</p>]]></text></answer>
    <answer fraction="50" format="html"><text><![CDATA[<p>PUT</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>POST</p>]]></text></answer>
  </question>
  <question type="category"><category><text>$course$/top/HTTP/Caching</text></category></question>
  <question type="truefalse"><name><text>Wahr ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>${lang} statement</p>]]></text></questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>
</quiz>`;
}

/** A school year, the class 4bhif with two students and the course WMC. */
function course(db) {
  const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
  const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
  return createCourse(db, klass.id, { subject: "WMC", language: "en" });
}

/** A database with the pool and a course; `ids` by the questions' German names. */
function seeded() {
  const db = freshDatabase();
  importPool(db, poolXml("de"), poolXml("en"));
  const wmc = course(db);
  const ids = Object.fromEntries(listQuestions(db).map((q) => [q.nameDe, q.id]));
  return { db, course: wmc, ids };
}

/** Starts an attempt of the test the way `attempts.js` would, as far as these checks need one. */
function fakeAttempt(db, testId, username) {
  const at = new Date().toISOString();
  const sitting = db
    .prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, created_at) VALUES (?, ?, ?, 600, ?)")
    .run(testId, at, new Date(Date.now() + 3600000).toISOString(), at);
  db.prepare(
    "INSERT INTO attempt (test_id, sitting_id, username, started_at, deadline, question_count) VALUES (?, ?, ?, ?, ?, 1)"
  ).run(testId, Number(sitting.lastInsertRowid), username, at, at);
}

/** Every row of the tables the pool and the tests keep, for comparing before and after. */
function poolAndSnapshots(db) {
  const all = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  return Object.fromEntries(
    ["question_category", "answer", "image", "test", "test_question", "test_answer", "test_image", "question_usage", "attempt"].map((table) => [
      table,
      all(table),
    ])
  );
}

describe("the migration to the question editor", () => {
  test("a database at schema 6 with a filled pool and a written test migrates with every question, snapshot and image unchanged", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 6));
    importPool(db, poolXml("de"), poolXml("en"));
    const wmc = course(db);
    const ids = db.prepare("SELECT q.id FROM question q JOIN question_category c ON c.id = q.category_id ORDER BY c.position, c.id, q.position, q.id").all().map((q) => q.id);
    const test = createTest(db, wmc.id, { name: "1st test", questionIds: ids });
    fakeAttempt(db, test.id, "anna");
    const questions = db.prepare("SELECT * FROM question ORDER BY id").all();
    const before = poolAndSnapshots(db);
    assert.ok(before.test_image.length > 0, "the test shows an image");

    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 7)), { from: 6, to: 7 });
    assert.deepEqual(poolAndSnapshots(db), before);
    assert.deepEqual(
      db.prepare("SELECT * FROM question ORDER BY id").all().map((row) => ({ ...row })),
      questions.map((question) => ({ ...question, version: 1 })),
      "every question is as it was, at version 1"
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM image_upload").get().n, 0);
    assert.equal(db.prepare("SELECT version FROM question WHERE id = ?").get(ids[0]).version, 1);
  });
});

/** What the editor sends back for a stored question, unchanged: the starting point of every edit below. */
function editable(db, id) {
  const q = getQuestion(db, id);
  return {
    version: q.version,
    categoryId: q.categoryId,
    type: q.type,
    nameDe: q.nameDe,
    nameEn: q.nameEn,
    textDe: q.textDe,
    textEn: q.textEn,
    answers: q.answers.map(({ textDe, textEn, correct }) => ({ textDe, textEn, correct })),
  };
}

/** The problems a save is refused with, as `[field, answer, message]`. */
function refusal(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof QuestionProblemsError, `refused with problems, not ${error}`);
    return error.problems.map((p) => [p.field, p.answer, p.message]);
  }
  assert.fail("the save was not refused");
}

const png = Buffer.from(pixel, "base64");
// A different 1×1 PNG.
const otherPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

describe("validating a question", () => {
  test("a complete question in both languages has no problem", () => {
    const { db, ids } = seeded();
    for (const id of Object.values(ids)) assert.deepEqual(questionProblems(db, editable(db, id), id), []);
  });

  test("each text missing in either language is named, an answer's with its number", () => {
    const { db, ids } = seeded();
    const input = editable(db, ids["Methoden de"]);
    input.nameEn = "  ";
    input.textDe = "<p> </p>";
    input.answers[2].textEn = "";
    assert.deepEqual(refusal(() => saveQuestion(db, ids["Methoden de"], input)), [
      ["nameEn", null, "The English title is missing."],
      ["textDe", null, "The German question text is missing."],
      ["textEn", 3, "Answer 3 has no English text."],
    ]);
    assert.deepEqual(editable(db, ids["Methoden de"]).nameEn, "Methoden en", "nothing was stored");
  });

  test("a text holding only an image counts as present", () => {
    const { db, ids } = seeded();
    const input = editable(db, ids["Bild de"]);
    input.textDe = input.textDe.replace("de picture", "");
    assert.deepEqual(questionProblems(db, input, ids["Bild de"]), []);
  });

  test("the correct flags have to fit the type", () => {
    const { db, ids } = seeded();
    const single = editable(db, ids["Bild de"]);
    single.answers[1].correct = true;
    assert.deepEqual(refusal(() => saveQuestion(db, ids["Bild de"], single)), [
      ["answers", null, "Exactly one answer may be correct in a single-choice question."],
    ]);
    const several = editable(db, ids["Methoden de"]);
    for (const answer of several.answers) answer.correct = false;
    assert.deepEqual(refusal(() => saveQuestion(db, ids["Methoden de"], several)), [["answers", null, "At least one answer has to be correct."]]);
    const lonely = editable(db, ids["Methoden de"]);
    lonely.answers = lonely.answers.slice(0, 1);
    assert.deepEqual(refusal(() => saveQuestion(db, ids["Methoden de"], lonely)), [["answers", null, "A question needs at least two answers."]]);
    const statement = editable(db, ids["Wahr de"]);
    statement.answers[1].correct = true;
    assert.deepEqual(refusal(() => saveQuestion(db, ids["Wahr de"], statement)), [["answers", null, "Mark whether the statement is true or false."]]);
    statement.answers.push({ textDe: "<p>x</p>", textEn: "<p>x</p>", correct: false });
    assert.deepEqual(refusal(() => saveQuestion(db, ids["Wahr de"], statement)), [
      ["answers", null, "A true/false question has exactly the two answers true and false."],
    ]);
  });

  test("an unknown type and a category there is none of are refused", () => {
    const { db, ids } = seeded();
    const input = { ...editable(db, ids["Bild de"]), type: "essay", categoryId: 999 };
    assert.deepEqual(
      refusal(() => saveQuestion(db, ids["Bild de"], input)).map(([field]) => field),
      ["type", "categoryId"]
    );
  });

  test("several problems are reported at once", () => {
    const { db, ids } = seeded();
    const input = editable(db, ids["Bild de"]);
    input.nameDe = "";
    input.answers[0].textEn = "";
    input.answers[0].correct = false;
    assert.equal(refusal(() => saveQuestion(db, ids["Bild de"], input)).length, 3);
  });

  test("an image of another question, an inline image and a foreign one are refused", () => {
    const { db, ids } = seeded();
    const imageId = db.prepare("SELECT id FROM image WHERE question_id = ?").get(ids["Bild de"]).id;
    const input = editable(db, ids["Methoden de"]);
    input.textDe = `<p><img src="/exam/api/images/${imageId}"></p>`;
    input.textEn = `<p><img src="data:image/png;base64,${pixel}"></p>`;
    input.answers[0].textDe = '<p><img src="https://example.com/x.png"></p>';
    assert.deepEqual(refusal(() => saveQuestion(db, ids["Methoden de"], input)), [
      ["textDe", null, "The question text embeds an image of another question."],
      ["textEn", null, "The question text embeds an image that was not uploaded."],
      ["textDe", 1, "Answer 1 embeds an image from outside the module."],
    ]);
  });
});

describe("saving a question", () => {
  test("a different correct answer is stored as the only correct one, in both languages", () => {
    const { db, ids } = seeded();
    const input = editable(db, ids["Bild de"]);
    input.answers[0].correct = false;
    input.answers[1].correct = true;
    const { question } = saveQuestion(db, ids["Bild de"], input);
    assert.deepEqual(question.answers.map((a) => [a.textDe, a.textEn, a.correct]), [
      ["<p>yes de</p>", "<p>yes en</p>", false],
      ["<p>no de</p>", "<p>no en</p>", true],
    ]);
    assert.equal(question.version, 2);
  });

  test("an added answer is stored in both languages, in the order the editor showed", () => {
    const { db, ids } = seeded();
    const input = editable(db, ids["Methoden de"]);
    input.answers.splice(1, 0, { textDe: "<p>DELETE</p>", textEn: "<p>DELETE</p>", correct: true });
    input.answers.push({ textDe: "<p>PATCH de</p>", textEn: "<p>PATCH en</p>", correct: false });
    const { question } = saveQuestion(db, ids["Methoden de"], input);
    assert.deepEqual(question.answers.map((a) => [a.position, a.textEn]), [
      [1, "<p>GET</p>"],
      [2, "<p>DELETE</p>"],
      [3, "<p>PUT</p>"],
      [4, "<p>POST</p>"],
      [5, "<p>PATCH en</p>"],
    ]);
  });

  test("styles, scripts and handlers are not stored", () => {
    const { db, ids } = seeded();
    const input = editable(db, ids["Methoden de"]);
    input.textDe = '<p style="color: red" class="x" onclick="alert(1)">Welche <b>Methoden</b>?<script>alert(1)</script></p>';
    const { question } = saveQuestion(db, ids["Methoden de"], input);
    assert.equal(question.textDe, "<p>Welche <b>Methoden</b>?</p>");
  });

  test("a true/false question gets the fixed words, the statement's truth as its flag", () => {
    const { db, ids } = seeded();
    const input = editable(db, ids["Wahr de"]);
    input.answers = [
      { textDe: "<p>egal</p>", textEn: "", correct: false },
      { correct: true },
    ];
    const { question } = saveQuestion(db, ids["Wahr de"], input);
    assert.deepEqual(question.answers.map((a) => [a.textDe, a.textEn, a.correct]), [
      ["<p>Richtig</p>", "<p>True</p>", false],
      ["<p>Falsch</p>", "<p>False</p>", true],
    ]);
  });

  test("a question changed in between is refused, and the first save is kept", () => {
    const { db, ids } = seeded();
    const first = editable(db, ids["Methoden de"]);
    const second = editable(db, ids["Methoden de"]);
    first.nameDe = "Erste";
    second.nameDe = "Zweite";
    saveQuestion(db, ids["Methoden de"], first);
    assert.throws(() => saveQuestion(db, ids["Methoden de"], second), (error) => error instanceof ConflictError && /changed in the meantime/.test(error.message));
    assert.equal(getQuestion(db, ids["Methoden de"]).nameDe, "Erste");
  });

  test("a written test's snapshot is unchanged after an edit, and a new test gets the new text", () => {
    const { db, course: wmc, ids } = seeded();
    const written = createTest(db, wmc.id, { name: "1st test", questionIds: [ids["Methoden de"]] });
    fakeAttempt(db, written.id, "anna");
    const before = poolAndSnapshots(db);
    const input = editable(db, ids["Methoden de"]);
    input.textDe = "<p>Neu: welche Methoden?</p>";
    input.answers[2].correct = true;
    saveQuestion(db, ids["Methoden de"], input);
    const after = poolAndSnapshots(db);
    for (const table of ["test", "test_question", "test_answer", "test_image", "question_usage", "attempt"]) {
      assert.deepEqual(after[table], before[table], `${table} is unchanged`);
    }
    const fresh = createTest(db, wmc.id, { name: "2nd test", questionIds: [ids["Methoden de"]] });
    assert.equal(testQuestions(db, fresh.id)[0].textDe, "<p>Neu: welche Methoden?</p>");
  });

  test("an image a snapshot shows survives its removal from the text; one no test shows is removed", () => {
    const { db, course: wmc, ids } = seeded();
    const id = ids["Bild de"];
    const imageId = db.prepare("SELECT id FROM image WHERE question_id = ?").get(id).id;
    createTest(db, wmc.id, { name: "1st test", questionIds: [id] });

    const replaced = editable(db, id);
    const { src } = stageUpload(db, otherPng, "teacher");
    replaced.textDe = `<p><img src="${src}">de picture</p>`;
    replaced.textEn = `<p><img src="${src}">en picture</p>`;
    const { question } = saveQuestion(db, id, replaced);
    const images = db.prepare("SELECT id FROM image WHERE question_id = ? ORDER BY id").all(id).map((row) => row.id);
    assert.equal(images.length, 2, "the old image stays for the test, the new one is the question's");
    assert.ok(images.includes(imageId));
    const newId = images.find((other) => other !== imageId);
    assert.equal(question.textDe, `<p><img src="/exam/api/images/${newId}">de picture</p>`, "the upload became the question's image");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM image_upload").get().n, 0, "the upload is gone from the staging table");

    const plain = editable(db, id);
    plain.textDe = "<p>de without picture</p>";
    plain.textEn = "<p>en without picture</p>";
    saveQuestion(db, id, plain);
    assert.deepEqual(
      db.prepare("SELECT id FROM image WHERE question_id = ?").all(id).map((row) => row.id),
      [imageId],
      "the image no test shows is removed, the one a test shows stays"
    );
  });

  test("the same uploaded picture twice becomes one image of the question", () => {
    const { db, ids } = seeded();
    const id = ids["Methoden de"];
    const input = editable(db, id);
    input.textDe = `<p><img src="${stageUpload(db, otherPng, "teacher").src}"></p>`;
    input.textEn = `<p><img src="${stageUpload(db, otherPng, "teacher").src}"></p>`;
    const { question } = saveQuestion(db, id, input);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM image WHERE question_id = ?").get(id).n, 1);
    assert.equal(question.textDe, question.textEn);
  });

  test("moving a question to another category puts it at the end there, its usage unchanged", () => {
    const { db, course: wmc, ids } = seeded();
    createTest(db, wmc.id, { name: "1st test", questionIds: [ids["Bild de"]] });
    const caching = getQuestion(db, ids["Wahr de"]).categoryId;
    const input = { ...editable(db, ids["Bild de"]), categoryId: caching };
    saveQuestion(db, ids["Bild de"], input);
    assert.deepEqual(listQuestions(db, { categoryId: caching }).map((q) => [q.nameDe, q.uses]), [["Wahr de", 0], ["Bild de", 1]]);
  });

  test("the save lists the unwritten tests holding the question, and only those", () => {
    const { db, course: wmc, ids } = seeded();
    const unwritten = createTest(db, wmc.id, { name: "Next week", questionIds: [ids["Methoden de"], ids["Wahr de"]] });
    const written = createTest(db, wmc.id, { name: "Last week", questionIds: [ids["Methoden de"]] });
    fakeAttempt(db, written.id, "anna");
    createTest(db, wmc.id, { name: "Other", questionIds: [ids["Wahr de"]] });
    const { unwrittenTests } = saveQuestion(db, ids["Methoden de"], editable(db, ids["Methoden de"]));
    assert.deepEqual(unwrittenTests.map((t) => t.name), ["Next week"]);
    assert.equal(unwrittenTests[0].id, unwritten.id);
  });

  test("an unwritten test takes up an edit only when updated, keeping its questions and their order", () => {
    const { db, course: wmc, ids } = seeded();
    const order = [ids["Wahr de"], ids["Methoden de"], ids["Bild de"]];
    const test = createTest(db, wmc.id, { name: "Next week", questionIds: order });
    const input = editable(db, ids["Methoden de"]);
    input.textEn = "<p>fixed typo</p>";
    saveQuestion(db, ids["Methoden de"], input);
    assert.equal(testQuestions(db, test.id)[1].textEn, "<p>en idempotent</p>", "not asked: the old text");
    updateTest(db, test.id, { questionIds: testQuestions(db, test.id).map((q) => q.questionId) });
    const after = testQuestions(db, test.id);
    assert.deepEqual(after.map((q) => q.questionId), order);
    assert.equal(after[1].textEn, "<p>fixed typo</p>");
  });
});

describe("creating a question", () => {
  test("a new question goes to the end of its category, with its images", () => {
    const { db, ids } = seeded();
    const categoryId = getQuestion(db, ids["Bild de"]).categoryId;
    const { src } = stageUpload(db, otherPng, "teacher");
    const { question } = createQuestion(db, {
      categoryId,
      type: "multichoice",
      nameDe: " Neu ",
      nameEn: "New",
      textDe: `<p>Bild: <img src="${src}"></p>`,
      textEn: "<p>Picture</p>",
      answers: [
        { textDe: "<p>a</p>", textEn: "<p>a</p>", correct: true },
        { textDe: "<p>b</p>", textEn: "<p>b</p>", correct: false },
      ],
    });
    assert.equal(question.nameDe, "Neu");
    assert.equal(question.version, 1);
    assert.match(question.textDe, /^<p>Bild: <img src="\/exam\/api\/images\/\d+"><\/p>$/);
    assert.deepEqual(listQuestions(db, { categoryId }).map((q) => q.nameDe), ["Bild de", "Methoden de", "Neu"]);
    const test = createTest(db, (db.prepare("SELECT id FROM course").get()).id, { name: "t", questionIds: [question.id] });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM test_image WHERE test_id = ?").get(test.id).n, 1, "a test assembled from it shows the image");
  });

  test("an incomplete new question is refused and nothing is stored", () => {
    const { db } = seeded();
    const count = db.prepare("SELECT COUNT(*) AS n FROM question").get().n;
    assert.ok(refusal(() => createQuestion(db, { type: "multichoice", answers: [] })).length > 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question").get().n, count);
  });
});

describe("uploads", () => {
  test("the type is judged by the content, never by a name", () => {
    assert.equal(imageTypeOf(png), "image/png");
    assert.equal(imageTypeOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
    assert.equal(imageTypeOf(Buffer.from("GIF89a....")), "image/gif");
    assert.equal(imageTypeOf(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")])), "image/webp");
    assert.equal(imageTypeOf(Buffer.from("%PDF-1.7\n")), null);
    assert.equal(imageTypeOf(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  });

  test("a PDF and an image over 2 MB are refused, a PNG is staged", () => {
    const db = freshDatabase();
    assert.throws(() => stageUpload(db, Buffer.from("%PDF-1.7\n"), "teacher"), (error) => error instanceof InvalidInputError && /not an image/.test(error.message));
    const huge = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]);
    assert.throws(() => stageUpload(db, huge, "teacher"), (error) => error instanceof InvalidInputError && /2 MB/.test(error.message));
    const { src } = stageUpload(db, png, "teacher");
    const token = src.split("/").at(-1);
    assert.match(token, /^[0-9a-f]{32}$/);
    assert.equal(readUpload(db, token).mime, "image/png");
    assert.equal(readUpload(db, "../../etc"), null);
  });

  test("uploads older than a day are purged, newer ones kept", () => {
    const db = freshDatabase();
    const old = stageUpload(db, png, "teacher", new Date(Date.now() - 25 * 3600 * 1000).toISOString()).src.split("/").at(-1);
    const fresh = stageUpload(db, png, "teacher").src.split("/").at(-1);
    assert.equal(purgeUploads(db), 1);
    assert.equal(readUpload(db, old), null);
    assert.notEqual(readUpload(db, fresh), null);
  });

  test("a purged upload cannot be saved into a question", () => {
    const { db, ids } = seeded();
    const { src } = stageUpload(db, png, "teacher", new Date(Date.now() - 25 * 3600 * 1000).toISOString());
    purgeUploads(db);
    const input = editable(db, ids["Methoden de"]);
    input.textDe = `<p><img src="${src}"></p>`;
    assert.deepEqual(refusal(() => saveQuestion(db, ids["Methoden de"], input)), [
      ["textDe", null, "The question text embeds an upload that is no longer there; upload the image again."],
    ]);
  });
});

describe("retiring, reviving and deleting", () => {
  test("a used question cannot be deleted; retired, its tests and usage stay, and it is refused in assembly until revived", () => {
    const { db, course: wmc, ids } = seeded();
    const id = ids["Methoden de"];
    createTest(db, wmc.id, { name: "1st", questionIds: [id] });
    createTest(db, wmc.id, { name: "2nd", questionIds: [id, ids["Wahr de"]] });
    assert.throws(() => deleteQuestion(db, id), (error) => error instanceof ConflictError && /Retire it instead/.test(error.message));
    const before = poolAndSnapshots(db);
    const retired = retireQuestion(db, id);
    assert.equal(retired.retired, true);
    assert.equal(retired.uses, 2);
    for (const table of ["test", "test_question", "test_answer", "question_usage"]) assert.deepEqual(poolAndSnapshots(db)[table], before[table]);
    assert.ok(!listQuestions(db).some((q) => q.id === id), "hidden from the browser");
    assert.ok(listQuestions(db, { includeRetired: true }).some((q) => q.id === id), "shown when asked for");
    assert.throws(() => createTest(db, wmc.id, { name: "3rd", questionIds: [id] }), /is retired/);
    assert.equal(reviveQuestion(db, id).retired, false);
    createTest(db, wmc.id, { name: "3rd", questionIds: [id] });
  });

  test("retiring and reviving count as changes for a concurrent editor", () => {
    const { db, ids } = seeded();
    const input = editable(db, ids["Wahr de"]);
    retireQuestion(db, ids["Wahr de"]);
    assert.throws(() => saveQuestion(db, ids["Wahr de"], input), ConflictError);
  });

  test("a fresh question is deleted with its answers and images", () => {
    const { db, ids } = seeded();
    const { question } = createQuestion(db, {
      ...editable(db, ids["Methoden de"]),
      textDe: `<p><img src="${stageUpload(db, otherPng, "teacher").src}"></p>`,
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM image WHERE question_id = ?").get(question.id).n, 1);
    deleteQuestion(db, question.id);
    for (const table of ["question", "answer", "image"]) {
      const column = table === "question" ? "id" : "question_id";
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`).get(question.id).n, 0, `no ${table} left`);
    }
  });

  test("a question whose only test was deleted unwritten can be deleted", async () => {
    const { db, course: wmc, ids } = seeded();
    const test = createTest(db, wmc.id, { name: "1st", questionIds: [ids["Methoden de"]] });
    const { deleteTest } = await import("../exam/tests.js");
    deleteTest(db, test.id);
    deleteQuestion(db, ids["Methoden de"]);
  });
});

describe("the category tree", () => {
  const names = (nodes) => nodes.map((node) => [node.nameDe, names(node.children)]);

  test("created at the top or under a parent, after the siblings; a duplicate German name is a conflict", () => {
    const { db } = seeded();
    const quarkus = createCategory(db, { nameDe: "Quarkus", nameEn: "Quarkus" });
    createCategory(db, { parentId: quarkus.id, nameDe: "CDI", nameEn: "CDI" });
    assert.deepEqual(names(categoryTree(db)), [["HTTP", [["Grundlagen", []], ["Caching", []]]], ["Quarkus", [["CDI", []]]]]);
    assert.throws(() => createCategory(db, { parentId: quarkus.id, nameDe: "CDI", nameEn: "Other" }), (error) => error instanceof ConflictError && /"CDI"/.test(error.message));
    assert.throws(() => createCategory(db, { nameDe: "Ohne", nameEn: " " }), InvalidInputError);
  });

  test("renamed in both languages, moved up and down and under another parent", () => {
    const { db } = seeded();
    const [http] = categoryTree(db);
    const [basics, caching] = http.children;
    updateCategory(db, caching.id, { move: "up" });
    assert.deepEqual(names(categoryTree(db)), [["HTTP", [["Caching", []], ["Grundlagen", []]]]]);
    updateCategory(db, caching.id, { move: "up" });
    assert.deepEqual(names(categoryTree(db)), [["HTTP", [["Caching", []], ["Grundlagen", []]]]], "the first stays first");
    updateCategory(db, basics.id, { nameDe: "Basis", nameEn: "Base" });
    updateCategory(db, caching.id, { parentId: basics.id });
    assert.deepEqual(names(categoryTree(db)), [["HTTP", [["Basis", [["Caching", []]]]]]]);
    updateCategory(db, caching.id, { parentId: null });
    assert.deepEqual(names(categoryTree(db)), [["HTTP", [["Basis", []]]], ["Caching", []]]);
    assert.equal(categoryTree(db)[0].children[0].nameEn, "Base");
  });

  test("a category cannot move under itself or its own subtree, and the tree is unchanged", () => {
    const { db } = seeded();
    const [http] = categoryTree(db);
    const before = names(categoryTree(db));
    assert.throws(() => updateCategory(db, http.id, { parentId: http.children[1].id }), InvalidInputError);
    assert.throws(() => updateCategory(db, http.id, { parentId: http.id }), InvalidInputError);
    assert.deepEqual(names(categoryTree(db)), before);
  });

  test("only an empty category is deleted; retired questions and subcategories count", () => {
    const { db, ids } = seeded();
    const [http] = categoryTree(db);
    const caching = http.children[1];
    assert.throws(() => deleteCategory(db, http.id), /2 subcategories/);
    retireQuestion(db, ids["Wahr de"]);
    assert.throws(() => deleteCategory(db, caching.id), /1 question/);
    const empty = createCategory(db, { parentId: caching.id, nameDe: "Leer", nameEn: "Empty" });
    deleteCategory(db, empty.id);
    assert.deepEqual(names(categoryTree(db)), [["HTTP", [["Grundlagen", []], ["Caching", []]]]]);
  });
});
