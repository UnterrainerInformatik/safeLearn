/**
 * Importing questions from a Markdown file (`question-import`), unit by unit:
 * the migration that adds it, the "not reviewed" mark, reading a file in the
 * format safelearn-questions/1, every rule the check applies, the preview,
 * the all-or-nothing import, and taking an import back.
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

import { ConflictError, createClass, createCourse, createYear } from "../exam/classes.js";
import { migrate, openDatabase, readMigrations } from "../exam/db.js";
import { importPool } from "../exam/pool-import.js";
import { categoryTree, getQuestion, listQuestions } from "../exam/pool.js";
import { createTest } from "../exam/tests.js";
import { createCategory, createQuestion, markReviewed, QuestionProblemsError, retireQuestion, saveQuestion } from "../exam/pool-edit.js";
import {
  checkQuestionFile,
  formatDescription,
  formatDescriptionPath,
  formatVersion,
  importQuestionFile,
  listImports,
  parseQuestionFile,
  questionLimit,
  takeBackImport,
} from "../exam/question-import.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-import-"));
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

/** A trimmed Moodle export: the category HTTP / Grundlagen with a question with an image and a multichoiceset. */
function poolXml(lang) {
  const de = lang === "de";
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/HTTP und REST/${de ? "Grundlagen" : "Basics"}</text></category></question>
  <question type="multichoice"><name><text>Bild ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p><img src="@@PLUGINFILE@@/image.png" alt="">${lang} picture</p>]]></text>
      <file name="image.png" path="/" encoding="base64">${pixel}</file></questiontext>
    <answer fraction="100" format="html"><text><![CDATA[<p>yes ${lang}</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>no ${lang}</p>]]></text></answer>
  </question>
  <question type="multichoiceset"><name><text>Methoden ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>Welche Methoden sind idempotent?</p>]]></text></questiontext>
    <answer fraction="50" format="html"><text><![CDATA[<p>GET</p>]]></text></answer>
    <answer fraction="50" format="html"><text><![CDATA[<p>PUT</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>POST</p>]]></text></answer>
  </question>
</quiz>`;
}

/** A school year, the class 4bhif with two students and the course WMC. */
function course(db) {
  const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
  const klass = createClass(db, year.id, { name: "4bhif", students: [{ username: "anna" }, { username: "ben" }] });
  return createCourse(db, klass.id, { subject: "WMC", language: "en" });
}

/** A database with the Moodle pool and a course. */
function seeded() {
  const db = freshDatabase();
  importPool(db, poolXml("de"), poolXml("en"));
  return { db, course: course(db) };
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
  const all = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row }));
  return Object.fromEntries(
    ["question_category", "answer", "image", "test", "test_question", "test_answer", "test_image", "question_usage", "attempt"].map((table) => [
      table,
      all(table),
    ])
  );
}

/** The example of the format description, as a file. */
function descriptionExample() {
  const description = fs.readFileSync(formatDescriptionPath, "utf8");
  return `${/~~~~markdown\n([\s\S]*?)\n~~~~/.exec(description)[1]}\n`;
}

const front = `---\nformat: ${formatVersion}\n---\n`;

/** A `multichoiceset` question; `de`/`en` override the marks of each language. */
function question({
  title = "Idempotente Methoden",
  titleEn = "Idempotent methods",
  type = "multichoiceset",
  hintDe = "(2 richtige Antworten)",
  hintEn = "(2 correct answers)",
  de = ["x", "x", "-", "-"],
  en = de,
  textDe = "Welche HTTP-Methoden sind idempotent?",
  textEn = "Which HTTP methods are idempotent?",
} = {}) {
  const words = ["`GET`", "`PUT`", "`POST`", "`PATCH`", "`CONNECT`", "`TRACE`"];
  const answers = (marks) => marks.map((mark, index) => `- [${mark === "x" ? "x" : " "}] ${words[index]}`).join("\n");
  return `## ${title}
en: ${titleEn}
type: ${type}

### de

${textDe}${hintDe ? ` ${hintDe}` : ""}

${answers(de)}

### en

${textEn}${hintEn ? ` ${hintEn}` : ""}

${answers(en)}
`;
}

function category(de = "HTTP und REST", en = "HTTP and REST") {
  return `# ${de}\nen: ${en}\n`;
}

/** A file of the given blocks, behind the front matter. */
function file(...blocks) {
  return `${front}\n${blocks.join("\n")}`;
}

/** The line a text starts on in `content`, 1-based. */
function lineOf(content, needle, from = 0) {
  const index = content.indexOf(needle, from);
  assert.notEqual(index, -1, `"${needle}" is in the file`);
  return content.slice(0, index).split("\n").length;
}

/** The problems of a file, as `[line, message]`. */
function problemsOf(db, content) {
  return checkQuestionFile(db, content, "q.md").problems.map((p) => [p.line, p.message]);
}

describe("the migration to the question import", () => {
  test("a database at schema 7 with a filled pool and a written test migrates with every question, snapshot and image unchanged", () => {
    const dbPath = temporaryPath();
    const db = new DatabaseSync(dbPath);
    openDatabases.push(db);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dbPath, readMigrations().slice(0, 7));
    importPool(db, poolXml("de"), poolXml("en"));
    const wmc = course(db);
    const ids = db.prepare("SELECT id FROM question ORDER BY id").all().map((row) => row.id);
    const written = createTest(db, wmc.id, { name: "1st test", questionIds: ids });
    fakeAttempt(db, written.id, "anna");
    const questions = db.prepare("SELECT * FROM question ORDER BY id").all().map((row) => ({ ...row }));
    const before = poolAndSnapshots(db);
    assert.ok(before.test_image.length > 0, "the test shows an image");

    assert.deepEqual(migrate(db, dbPath, readMigrations().slice(0, 8)), { from: 7, to: 8 });
    assert.deepEqual(poolAndSnapshots(db), before);
    assert.deepEqual(
      db.prepare("SELECT * FROM question ORDER BY id").all().map((row) => ({ ...row })),
      questions.map((row) => ({ ...row, import_id: null, unreviewed: 0 })),
      "every question is as it was, reviewed and from no import"
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question_import").get().n, 0);
    for (const id of ids) assert.equal(getQuestion(db, id).unreviewed, false);
  });
});

describe("the not-reviewed mark", () => {
  function imported() {
    const { db, course: wmc } = seeded();
    importQuestionFile(db, file(category(), question()), { fileName: "methods.md", username: "teacher" });
    const id = listQuestions(db, { onlyUnreviewed: true })[0].id;
    return { db, course: wmc, id };
  }

  test("an imported question reads as not reviewed, with when, by whom and from which file", () => {
    const { db, id } = imported();
    const read = getQuestion(db, id);
    assert.equal(read.unreviewed, true);
    assert.equal(read.importedBy, "teacher");
    assert.equal(read.importFileName, "methods.md");
    assert.match(read.importedAt, /^\d{4}-\d{2}-\d{2}T/);
    const moodle = listQuestions(db).find((q) => q.id !== id);
    assert.equal(moodle.unreviewed, false);
    assert.equal(moodle.importedAt, null);
  });

  test("the list shows only unreviewed questions when asked to", () => {
    const { db, id } = imported();
    assert.equal(listQuestions(db).length, 3);
    assert.deepEqual(listQuestions(db, { onlyUnreviewed: true }).map((q) => q.id), [id]);
  });

  test("marking as reviewed clears the mark and changes nothing else, not even the version", () => {
    const { db, id } = imported();
    const before = getQuestion(db, id);
    const after = markReviewed(db, id);
    assert.deepEqual(after, { ...before, unreviewed: false });
    assert.deepEqual(listQuestions(db, { onlyUnreviewed: true }), []);
  });

  test("a save in the editor clears the mark; retiring and reviving leave it", () => {
    const { db, id } = imported();
    retireQuestion(db, id);
    assert.equal(getQuestion(db, id).unreviewed, true);
    const q = getQuestion(db, id);
    const saved = saveQuestion(db, id, {
      version: q.version,
      categoryId: q.categoryId,
      type: q.type,
      nameDe: `${q.nameDe}!`,
      nameEn: q.nameEn,
      textDe: q.textDe,
      textEn: q.textEn,
      answers: q.answers.map(({ textDe, textEn, correct }) => ({ textDe, textEn, correct })),
    });
    assert.equal(saved.question.unreviewed, false);
    assert.equal(saved.question.nameDe, "Idempotente Methoden!");
  });

  test("a question created in the editor is reviewed", () => {
    const { db } = seeded();
    const categoryId = categoryTree(db)[0].children[0].id;
    const created = createQuestion(db, {
      type: "multichoice",
      categoryId,
      nameDe: "Neu",
      nameEn: "New",
      textDe: "<p>Frage</p>",
      textEn: "<p>Question</p>",
      answers: [
        { textDe: "<p>a</p>", textEn: "<p>a</p>", correct: true },
        { textDe: "<p>b</p>", textEn: "<p>b</p>", correct: false },
      ],
    });
    assert.equal(created.question.unreviewed, false);
  });
});

describe("reading a question file", () => {
  test("the format description's example parses and checks with zero problems", () => {
    const db = freshDatabase();
    const parsed = parseQuestionFile(descriptionExample());
    assert.deepEqual(parsed.problems, []);
    assert.deepEqual(
      parsed.questions.map((q) => [q.type, q.nameDe, q.nameEn]),
      [
        ["multichoiceset", "Statuscode nach POST", "Status code after POST"],
        ["multichoice", "Idempotenz", "Idempotency"],
        ["truefalse", "Feld-Injection", "Field injection"],
      ]
    );
    assert.equal(parsed.questions[2].solution, false);
    assert.deepEqual(checkQuestionFile(db, descriptionExample()).problems, []);
  });

  test("the description names the format, and every refusal it lists is checked here", () => {
    const description = fs.readFileSync(formatDescriptionPath, "utf8");
    assert.ok(description.includes(`format: ${formatVersion}`));
    const refusals = /## What the import refuses\n\n[^\n]*\n\n((?:- [^\n]*\n)+)/.exec(description)[1].trim().split("\n");
    // One test below per line of that list, in its order.
    assert.equal(refusals.length, 9, "the description lists nine refusals; each has a test in 'what the check refuses'");
  });

  test("answers keep their marks, lines and inline code; the hint stays in the text", () => {
    const content = file(category(), question());
    const [q] = parseQuestionFile(content).questions;
    assert.deepEqual(
      q.de.answers.map((a) => [a.line, a.correct, a.html]),
      [
        [lineOf(content, "- [x] `GET`"), true, "<p><code>GET</code></p>"],
        [lineOf(content, "- [x] `PUT`"), true, "<p><code>PUT</code></p>"],
        [lineOf(content, "- [ ] `POST`"), false, "<p><code>POST</code></p>"],
        [lineOf(content, "- [ ] `PATCH`"), false, "<p><code>PATCH</code></p>"],
      ]
    );
    assert.equal(q.de.html, "<p>Welche HTTP-Methoden sind idempotent? (2 richtige Antworten)</p>");
    assert.equal(q.line, lineOf(content, "## Idempotente"));
  });

  test("an answer with code is stored as inline code in that language", () => {
    const db = freshDatabase();
    const content = file(category(), question({ de: ["x", "-"], hintDe: "(1 richtige Antwort)", hintEn: "(1 correct answer)" })).replace("- [x] `GET`", "- [x] `PUT /users/7`");
    importQuestionFile(db, content, { fileName: "q.md", username: "teacher" });
    const stored = db.prepare("SELECT text_de AS de, text_en AS en FROM answer ORDER BY position").all();
    assert.equal(stored[0].de, "<p><code>PUT /users/7</code></p>");
    assert.equal(stored[0].en, "<p><code>GET</code></p>");
  });

  test("a # inside a code block is code, not a heading", () => {
    const content = file(category(), question({ textDe: "Was gibt das aus?\n\n```bash\n# ein Kommentar\n## noch einer\necho hi\n```\n\nAntwort wählen." }));
    const parsed = parseQuestionFile(content);
    assert.deepEqual(parsed.problems, []);
    assert.equal(parsed.categories.length, 1);
    assert.match(parsed.questions[0].de.html, /<pre><code class="language-bash"># ein Kommentar\n## noch einer/);
  });

  test("a slash without spaces is part of a name", () => {
    const parsed = parseQuestionFile(file(category("DevOps / CI/CD", "DevOps / CI/CD"), question()));
    assert.deepEqual(parsed.categories[0].de, ["DevOps", "CI/CD"]);
    assert.deepEqual(parsed.categories[0].en, ["DevOps", "CI/CD"]);
  });

  test("CRLF line endings and a BOM read like LF", () => {
    const db = freshDatabase();
    const content = file(category(), question());
    const windows = `﻿${content.replace(/\n/g, "\r\n")}`;
    assert.deepEqual(problemsOf(db, windows), []);
    assert.deepEqual(parseQuestionFile(windows).questions[0].de.answers.map((a) => a.line), parseQuestionFile(content).questions[0].de.answers.map((a) => a.line));
  });

  test("a file without the format declaration, or with another one, is not a question file", () => {
    const db = freshDatabase();
    assert.match(problemsOf(db, `# HTTP\nen: HTTP\n`)[0][1], /not a question file in the format safelearn-questions\/1/);
    assert.match(problemsOf(db, `---\ntitle: x\n---\n`)[0][1], /not a question file/);
    assert.deepEqual(problemsOf(db, `---\nformat: safelearn-questions/2\n---\n`), [[2, 'The file names the format "safelearn-questions/2"; this import reads safelearn-questions/1 only.']]);
  });
});

describe("what the check refuses", () => {
  // The list "What the import refuses" in the format description, in its order.

  test("1. the front matter missing (see 'reading a question file') or an empty file", () => {
    const db = freshDatabase();
    assert.deepEqual(problemsOf(db, ""), [[1, "The file is empty."]]);
    assert.deepEqual(problemsOf(db, front), [[1, "The file holds no question."]]);
  });

  test("2. a question before any category, a missing en: line, a misplaced type: line, a missing solution:", () => {
    const db = freshDatabase();
    const orphan = file(question());
    assert.deepEqual(problemsOf(db, orphan), [[lineOf(orphan, "## "), "This question has no category above it. Put a category heading `# <German path>` before the first question."]]);

    const noCategoryEn = file("# HTTP und REST\n", question());
    assert.match(problemsOf(db, noCategoryEn)[0][1], /`en: ` with the English path is missing/);

    const noEn = file(category(), question().replace("en: Idempotent methods\n", ""));
    assert.deepEqual(problemsOf(db, noEn), [[lineOf(noEn, "type: "), "The line `en: ` is missing or misplaced: it belongs directly below the heading."]]);

    const gap = file(category(), question().replace("type: multichoiceset", "\ntype: multichoiceset"));
    assert.match(problemsOf(db, gap)[0][1], /The line `type: ` is missing or misplaced/);

    const noSolution = file(category(), "## Wahr\nen: True\ntype: truefalse\n\n### de\n\nDer Himmel ist blau.\n\n### en\n\nThe sky is blue.\n");
    assert.match(problemsOf(db, noSolution)[0][1], /The line `solution: ` is missing/);

    const unknown = file(category(), question({ type: "essay" }));
    assert.deepEqual(problemsOf(db, unknown), [[lineOf(unknown, "type: "), 'The type "essay" is unknown. Use multichoiceset, multichoice or truefalse.']]);

    const noEnglish = file(category(), question().replace(/### en[\s\S]*$/, ""));
    assert.match(problemsOf(db, noEnglish)[0][1], /The section `### en` is missing/);
  });

  test("3. a title, a text or an answer missing in one language, with the editor's words", () => {
    const db = freshDatabase();
    const content = file(category(), question({ titleEn: "" }).replace("Which HTTP methods are idempotent? (2 correct answers)", "").replace(/- \[ \] `PATCH`\n$/, "- [ ] \n"));
    const problems = problemsOf(db, content);
    assert.deepEqual(
      problems.map(([, message]) => message).filter((m) => !/hint|does not end/.test(m)),
      ["The English title is missing.", "The English question text is missing.", "Answer 4 has no English text."]
    );
    assert.equal(problems[0][0], lineOf(content, "en: \n") );
  });

  test("4. fewer than two answers, a multichoice with two correct, a multichoiceset with none", () => {
    const db = freshDatabase();
    const content = file(
      category(),
      question({ title: "Eine", de: ["x"], hintDe: "(1 richtige Antwort)", hintEn: "(1 correct answer)" }),
      question({ title: "Single", type: "multichoice", de: ["x", "x", "-"], hintDe: "", hintEn: "" }),
      question({ title: "Keine", de: ["-", "-", "-"], hintDe: "(0 richtige Antworten)", hintEn: "(0 correct answers)" })
    );
    const problems = checkQuestionFile(db, content).problems.map((p) => [p.question, p.message]);
    assert.deepEqual(problems, [
      ["Eine", "A question needs at least two answers."],
      ["Single", "Exactly one answer may be correct in a single-choice question."],
      ["Keine", "At least one answer has to be correct."],
    ]);
  });

  test("5. the languages differ in the number of answers or their marks, both patterns named", () => {
    const db = freshDatabase();
    const marks = file(category(), question({ de: ["x", "-", "x", "-"], en: ["x", "x", "-", "-"] }));
    assert.deepEqual(problemsOf(db, marks), [
      [lineOf(marks, "### en"), "The German answers are marked `x - x -`, the English ones `x x - -`. Both need the same answers in the same order with the same marks."],
    ]);
    const count = file(category(), question({ de: ["x", "x", "-", "-"], en: ["x", "x", "-", "-", "-"] }));
    assert.deepEqual(problemsOf(db, count), [
      [lineOf(count, "### en"), "The German section has 4 answers (x x - -), the English one 5 (x x - - -). Both need the same answers in the same order."],
    ]);
  });

  test("6. the hint: missing in English only, a wrong count, a multichoice hint that says 2", () => {
    const db = freshDatabase();
    const noEnglish = file(category(), question({ hintEn: "" }));
    assert.deepEqual(checkQuestionFile(db, noEnglish).problems, [
      {
        line: lineOf(noEnglish, "### en"),
        question: "Idempotente Methoden",
        message: 'The English question text does not end with the number of correct answers. End it with "(2 correct answers)".',
      },
    ]);

    const filler = Array.from({ length: 30 }, () => "").join("\n");
    const wrong = file(category(), filler, question({ title: "Statuscode nach POST", de: ["x", "x", "x", "-"], en: ["x", "x", "x", "-"], hintEn: "(3 correct answers)" }));
    assert.deepEqual(checkQuestionFile(db, wrong).problems, [
      { line: lineOf(wrong, "### de"), question: "Statuscode nach POST", message: "The German hint says 2, but 3 answers are marked correct." },
    ]);

    const single = file(category(), question({ type: "multichoice", de: ["x", "-", "-"], hintDe: "(2 richtige Antworten)", hintEn: "" }));
    assert.deepEqual(problemsOf(db, single), [
      [lineOf(single, "### de"), 'The German hint says 2, but a multichoice question has exactly 1 correct answer. End it with "(1 richtige Antwort)".'],
    ]);
    // Without a hint, or with one that says 1, a multichoice question is fine; singular and plural are not judged.
    assert.deepEqual(problemsOf(db, file(category(), question({ type: "multichoice", de: ["x", "-", "-"], hintDe: "", hintEn: "(1 correct answers)" }))), []);
    assert.deepEqual(problemsOf(db, file(category(), question({ de: ["x", "-", "-"], hintDe: "(1 richtige Antworten)", hintEn: "(1 correct answer)" }))), []);
  });

  test("6b. a hint after a code block counts, in its own paragraph", () => {
    const db = freshDatabase();
    const content = file(category(), question({ textDe: "Was stimmt?\n\n```java\nint x = 1;\n```\n\n", textEn: "What is true?\n\n```java\nint x = 1;\n```\n\n" }));
    assert.deepEqual(problemsOf(db, content), []);
  });

  test("7. an image or raw HTML anywhere in a text", () => {
    const db = freshDatabase();
    const content = file(category(), question({ textDe: "Was zeigt ![Bild](bild.png) hier?" }).replace("- [ ] `POST`", "- [ ] <b>POST</b>"));
    assert.deepEqual(
      problemsOf(db, content).map(([, message]) => message),
      [
        "The German section embeds an image. Images cannot be imported; leave them out, the teacher adds them in the editor.",
        "The German section contains HTML. Write the text in Markdown only.",
      ]
    );
  });

  test("8. more than 200 questions, or more than 1 MB", () => {
    const db = freshDatabase();
    const many = file(category(), ...Array.from({ length: questionLimit + 1 }, (_, i) => question({ title: `Frage ${i}` })));
    assert.deepEqual(problemsOf(db, many), [[lineOf(many, `## Frage ${questionLimit}\n`), "The file holds 201 questions; one import takes at most 200. Split it into several files."]]);
    const huge = file(category(), question({ textDe: "x".repeat(1024 * 1024) }));
    assert.deepEqual(problemsOf(db, huge), [[1, "The file is larger than 1 MB. Split it into several files."]]);
  });

  test("9. exactly this file again, naming the earlier import's date and teacher", () => {
    const db = freshDatabase();
    const content = file(category(), question());
    importQuestionFile(db, content, { fileName: "first.md", username: "g.unterrainer" });
    const [[line, message]] = problemsOf(db, content);
    assert.equal(line, 1);
    assert.match(message, /^Exactly this file was imported on \d{2}\.\d{2}\.\d{4} by g\.unterrainer \(as "first\.md"\)\. Take that import back first/);
    assert.deepEqual(problemsOf(db, `${content}\n`), [], "one byte more is another file");
  });

  test("category paths: the same depth in both languages, one English path per German one", () => {
    const db = freshDatabase();
    const depth = file(category("HTTP und REST / Statuscodes", "HTTP and REST"), question());
    assert.deepEqual(problemsOf(db, depth), [[lineOf(depth, "en: HTTP and REST"), 'The German path has 2 segments, the English one 1. Both name the same categories, separated by " / ".']]);
    const twice = file(category(), question(), category("HTTP und REST", "HTTP & REST"), question({ title: "Zweite" }));
    assert.deepEqual(problemsOf(db, twice), [
      [lineOf(twice, "en: HTTP & REST"), 'The category "HTTP und REST" is named "HTTP and REST" in English on line 6, and "HTTP & REST" here. Use one English path for it.'],
    ]);
  });

  test("several problems at once, each with its line and question, sorted by line, and nothing stored", () => {
    const { db } = seeded();
    const before = poolAndSnapshots(db);
    const content = file(
      category(),
      question({ title: "Ohne Englisch", titleEn: "" }),
      question({ title: "Zwei richtige", type: "multichoice", de: ["x", "x", "-"], hintDe: "", hintEn: "" })
    );
    const { problems, plan } = checkQuestionFile(db, content);
    assert.equal(plan, null);
    assert.deepEqual(problems, [
      { line: lineOf(content, "en: \n"), question: "Ohne Englisch", message: "The English title is missing." },
      { line: lineOf(content, "## Zwei richtige"), question: "Zwei richtige", message: "Exactly one answer may be correct in a single-choice question." },
    ]);
    assert.throws(
      () => importQuestionFile(db, content, { fileName: "q.md", username: "teacher" }),
      (error) => error instanceof QuestionProblemsError && error.problems.length === 2
    );
    assert.deepEqual(poolAndSnapshots(db), before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question_import").get().n, 0);
  });

  test("200 questions are checked within two seconds and imported within five", (t) => {
    const db = freshDatabase();
    const content = file(category(), ...Array.from({ length: questionLimit }, (_, i) => question({ title: `Frage ${i}`, textDe: `Frage Nummer ${i}?` })));
    let started = performance.now();
    assert.deepEqual(checkQuestionFile(db, content).problems, []);
    const checked = performance.now() - started;
    started = performance.now();
    importQuestionFile(db, content, { fileName: "many.md", username: "teacher" });
    const imported = performance.now() - started;
    assert.ok(checked < 2000, `the check took ${Math.round(checked)} ms`);
    // Storing cleans every text through the sanitizer, about a millisecond
    // each: some 2,000 texts take about two seconds on a developer machine.
    assert.ok(imported < 5000, `the import took ${Math.round(imported)} ms`);
    assert.equal(listQuestions(db).length, questionLimit);
    t.diagnostic(`check ${Math.round(checked)} ms, import ${Math.round(imported)} ms`);
  });
});

describe("the preview", () => {
  test("a new subcategory under an existing category, with its questions per type", () => {
    const db = freshDatabase();
    createCategory(db, { nameDe: "HTTP und REST", nameEn: "HTTP and REST" });
    const content = file(category("HTTP und REST / Statuscodes", "HTTP and REST / Status codes"), question(), question({ title: "Zweite", type: "multichoice", de: ["x", "-", "-"], hintDe: "", hintEn: "" }));
    const { plan } = checkQuestionFile(db, content);
    assert.deepEqual(plan.newCategories, [{ pathDe: "HTTP und REST / Statuscodes", pathEn: "HTTP and REST / Status codes", parentDe: "HTTP und REST" }]);
    assert.deepEqual(plan.categories, [
      { pathDe: "HTTP und REST / Statuscodes", pathEn: "HTTP and REST / Status codes", existingId: null, counts: { multichoice: 1, multichoiceset: 1, truefalse: 0 }, questions: 2 },
    ]);
    assert.equal(plan.questions, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question_category").get().n, 1, "the preview stores nothing");
  });

  test("a question whose German text equals one in the pool is named, and the file is still clean", () => {
    const { db } = seeded();
    const existing = listQuestions(db).find((q) => q.nameDe === "Methoden de");
    const content = file(category(), question({ textDe: "Welche  Methoden sind\nidempotent?", hintDe: "" }).replace(/\n\n- \[x\] `GET`/, " (2 richtige Antworten)\n\n- [x] `GET`"));
    const { problems, plan } = checkQuestionFile(db, content);
    assert.deepEqual(problems, []);
    // The pool's text has no hint; compared are the words alone.
    assert.deepEqual(plan.nearDuplicates, []);

    const same = file(category(), question({ textDe: "Welche  Methoden sind\nidempotent?", hintDe: "", type: "multichoice", de: ["x", "-"], hintEn: "" }));
    const preview = checkQuestionFile(db, same);
    assert.deepEqual(preview.problems, []);
    assert.deepEqual(preview.plan.nearDuplicates, [{ line: lineOf(same, "## "), question: "Idempotente Methoden", existing: { id: existing.id, nameDe: "Methoden de", retired: false } }]);
  });
});

describe("importing", () => {
  test("into an existing category: appended at its end, the questions there and every test unchanged", () => {
    const { db, course: wmc } = seeded();
    const ids = listQuestions(db).map((q) => q.id);
    const written = createTest(db, wmc.id, { name: "1st test", questionIds: ids });
    fakeAttempt(db, written.id, "anna");
    const before = poolAndSnapshots(db);
    const existing = db.prepare("SELECT * FROM question ORDER BY id").all().map((row) => ({ ...row }));

    const content = file(category("HTTP und REST / Grundlagen", "HTTP and REST / Basics"), question({ title: "Eins" }), question({ title: "Zwei" }), question({ title: "Drei" }));
    const result = importQuestionFile(db, content, { fileName: "three.md", username: "teacher" });
    assert.deepEqual(result, { id: 1, questions: 3, newCategories: 0 });

    const basics = categoryTree(db)[0].children[0];
    assert.equal(basics.questions, 5);
    assert.deepEqual(listQuestions(db, { categoryId: basics.id }).map((q) => q.nameDe), ["Bild de", "Methoden de", "Eins", "Zwei", "Drei"]);
    assert.deepEqual(db.prepare("SELECT * FROM question WHERE import_id IS NULL ORDER BY id").all().map((row) => ({ ...row })), existing);
    const after = poolAndSnapshots(db);
    for (const table of ["test", "test_question", "test_answer", "test_image", "question_usage", "attempt", "image"]) assert.deepEqual(after[table], before[table], table);
    assert.deepEqual(after.question_category, before.question_category);

    const [record] = listImports(db);
    assert.deepEqual({ ...record, importedAt: undefined }, { id: 1, importedAt: undefined, importedBy: "teacher", fileName: "three.md", questions: 3, unreviewed: 3, inUse: false });
    const report = JSON.parse(db.prepare("SELECT report FROM question_import").get().report);
    assert.equal(report.questions, 3);
    assert.deepEqual(report.createdCategoryIds, []);
  });

  test("a new category with a subcategory is created along the German path, both names, after its siblings", () => {
    const { db } = seeded();
    importQuestionFile(db, file(category("Java / CDI", "Java / CDI"), question()), { fileName: "java.md", username: "teacher" });
    const tree = categoryTree(db);
    assert.deepEqual(tree.map((node) => node.nameDe), ["HTTP und REST", "Java"]);
    assert.deepEqual(tree[1].children.map((node) => [node.nameDe, node.nameEn, node.questions]), [["CDI", "CDI", 1]]);
  });

  test("the stored texts are cleaned like an editor save: no language class on code", () => {
    const db = freshDatabase();
    importQuestionFile(db, descriptionExample(), { fileName: "example.md", username: "teacher" });
    const truefalse = db.prepare("SELECT id, text_de AS de FROM question WHERE type = 'truefalse'").get();
    assert.equal(truefalse.de, "<p>Das folgende Feld wird von CDI auch ohne Annotation befüllt:</p>\n<pre><code>private UserRepository repository;\n</code></pre>");
    assert.deepEqual(getQuestion(db, truefalse.id).answers.map((a) => [a.textDe, a.textEn, a.correct]), [
      ["<p>Richtig</p>", "<p>True</p>", false],
      ["<p>Falsch</p>", "<p>False</p>", true],
    ]);
  });

  test("a question failing nothing but the editor's rules keeps the whole file out", () => {
    const { db } = seeded();
    const before = poolAndSnapshots(db);
    const content = file(category("Neu", "New"), question(), question({ title: "Kaputt", de: ["-", "-"], hintDe: "(0 richtige Antworten)", hintEn: "(0 correct answers)" }));
    assert.throws(() => importQuestionFile(db, content, { fileName: "q.md", username: "teacher" }), QuestionProblemsError);
    assert.deepEqual(poolAndSnapshots(db), before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question").get().n, 2);
  });
});

describe("taking an import back", () => {
  test("deletes its questions, retired ones too, and the categories it created that are empty, then accepts the file again", () => {
    const { db } = seeded();
    const before = poolAndSnapshots(db);
    const content = file(category("Java / CDI", "Java / CDI"), question(), category("HTTP und REST / Grundlagen", "HTTP and REST / Basics"), question({ title: "Zweite" }));
    const { id } = importQuestionFile(db, content, { fileName: "q.md", username: "teacher" });
    retireQuestion(db, listQuestions(db, { onlyUnreviewed: true })[0].id);
    assert.deepEqual(takeBackImport(db, id), { deleted: id, questions: 2, categories: 2 });
    assert.deepEqual(poolAndSnapshots(db), before);
    assert.deepEqual(listImports(db), []);
    assert.deepEqual(checkQuestionFile(db, content).problems, [], "the same file is accepted again");
  });

  test("a category it created and a teacher filled since stays", () => {
    const { db } = seeded();
    const { id } = importQuestionFile(db, file(category("Java / CDI", "Java / CDI"), question()), { fileName: "q.md", username: "teacher" });
    const java = categoryTree(db).find((node) => node.nameDe === "Java");
    createCategory(db, { parentId: java.id, nameDe: "Quarkus", nameEn: "Quarkus" });
    assert.deepEqual(takeBackImport(db, id), { deleted: id, questions: 1, categories: 1 });
    assert.deepEqual(categoryTree(db).find((node) => node.nameDe === "Java").children.map((node) => node.nameDe), ["Quarkus"]);
  });

  test("is refused, naming the question, while one of its questions is in a test, and nothing is deleted", () => {
    const { db, course: wmc } = seeded();
    const { id } = importQuestionFile(db, file(category(), question(), question({ title: "Zweite" })), { fileName: "q.md", username: "teacher" });
    const used = listQuestions(db, { onlyUnreviewed: true }).find((q) => q.nameDe === "Zweite");
    createTest(db, wmc.id, { name: "Test", questionIds: [used.id] });
    const before = poolAndSnapshots(db);
    assert.throws(
      () => takeBackImport(db, id),
      (error) => error instanceof ConflictError && error.message === 'This import cannot be taken back: its question "Zweite" is in a test.'
    );
    assert.deepEqual(poolAndSnapshots(db), before);
    assert.equal(listImports(db)[0].inUse, true);
  });
});

describe("the format description as downloaded", () => {
  test("lists the pool's categories with their English paths", () => {
    const db = freshDatabase();
    const http = createCategory(db, { nameDe: "HTTP und REST", nameEn: "HTTP and REST" });
    createCategory(db, { parentId: http.id, nameDe: "Caching", nameEn: "Caching" });
    const description = formatDescription(db);
    assert.ok(description.includes("- HTTP und REST — HTTP and REST\n- HTTP und REST / Caching — HTTP and REST / Caching"));
    assert.ok(!description.includes("<!-- categories -->"));
    assert.match(description, /\(2 richtige Antworten\)/);
  });
});
