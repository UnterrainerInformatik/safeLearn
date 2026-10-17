/**
 * The question pool (`question-pool`), unit by unit: the one-time Moodle
 * import - pairing by position, refusing a mismatch, dropping essays,
 * sanitizing, resolving images, refusing a second import - and the reads the
 * question browser is built on.
 *
 * No browser, no login, no server: the Moodle exports are trimmed fixtures
 * built here, and every database lives in a temporary directory removed after
 * the check. The real pool is read once, as a dry run, where its files are on
 * this machine; the same behaviour against a running instance is
 * `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";

import { openDatabase } from "../exam/db.js";
import { importPool, imagePath, planImport, PoolImportError, poolImported } from "../exam/pool-import.js";
import { categoryTree, getQuestion, listQuestions, readImage, studentMaySeeImage } from "../exam/pool.js";
import { createClass, createCourse, createYear } from "../exam/classes.js";

const temporaryDirs = [];
const openDatabases = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function freshDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-pool-"));
  temporaryDirs.push(dir);
  const { db } = openDatabase(path.join(dir, "exam.sqlite"));
  openDatabases.push(db);
  return db;
}

// A 1×1 PNG, and a second, different one.
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const otherPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

const cdata = (html) => `<![CDATA[${html}]]>`;
const file = (name, data) => `<file name="${name}" path="/" encoding="base64">${data}</file>`;

function category(pathText) {
  return `<question type="category"><category><text>$course$/top/${pathText}</text></category><info format="moodle_auto_format"><text></text></info></question>`;
}

/**
 * A question as Moodle exports it. `answers` are `[html, correct, files?]`;
 * `files` are `<file>` elements placed beside the question text.
 */
function question(type, name, html, answers = [], files = "") {
  const answerXml = answers
    .map(
      ([text, correct, answerFiles = ""]) =>
        `<answer fraction="${correct ? 100 : 0}" format="${type === "truefalse" ? "moodle_auto_format" : "html"}">` +
        `<text>${type === "truefalse" ? text : cdata(text)}</text>${answerFiles}<feedback format="html"><text></text></feedback></answer>`
    )
    .join("");
  return `<question type="${type}"><name><text>${name}</text></name><questiontext format="html"><text>${cdata(html)}</text>${files}</questiontext>${answerXml}</question>`;
}

const quiz = (...parts) => `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>${parts.join("\n")}</quiz>`;

const styled = (text) => `<p dir="ltr" style="text-align: left;">${text}<br></p>`;

/** A German pool and its English translation that agree everywhere. */
function matchingPools() {
  const de = quiz(
    category("HTTP und REST/HTTP-Grundlagen"),
    question("multichoiceset", "HTTP - GET", styled("Die HTTP Methode GET wird verwendet für<br>(1 richtige Antwort)"), [
      [styled("das Abfragen von Daten"), true],
      [styled("die Neuanlage von Daten"), false],
    ]),
    question("multichoiceset", "HTTP - Methoden", styled("Welche Methoden sind idempotent? (2 richtige Antworten)"), [
      [styled("GET"), true],
      [styled("PUT"), true],
      [styled("POST"), false],
    ]),
    category("HTTP und REST/Caching"),
    question("truefalse", "HTTP - HTTPS", styled("HTTPS verschlüsselt alle Daten."), [
      ["true", true],
      ["false", false],
    ]),
    question("essay", "HTTP - Erklären", styled("Erklären Sie Caching.")),
    category("Quarkus/CDI"),
    question("multichoice", "CDI - @Inject", styled("Was bedeutet @Inject? (1 richtige Antwort)"), [
      [styled("Der Server initialisiert das Feld"), true],
      [styled("Der Konstruktor initialisiert das Feld"), false],
    ])
  );
  const en = quiz(
    category("HTTP and REST/HTTP Basics"),
    question("multichoiceset", "HTTP - GET", styled("The HTTP method GET is used for<br>(1 correct answer)"), [
      [styled("querying data"), true],
      [styled("creating data"), false],
    ]),
    question("multichoiceset", "HTTP - Methods", styled("Which methods are idempotent? (2 correct answers)"), [
      [styled("GET"), true],
      [styled("PUT"), true],
      [styled("POST"), false],
    ]),
    category("HTTP and REST/Caching"),
    question("truefalse", "HTTP - HTTPS", styled("HTTPS encrypts all data."), [
      ["true", true],
      ["false", false],
    ]),
    question("essay", "HTTP - Explain", styled("Explain caching.")),
    category("Quarkus/CDI"),
    question("multichoice", "CDI - @Inject", styled("What does @Inject mean? (1 correct answer)"), [
      [styled("The server initializes the field"), true],
      [styled("The constructor initializes the field"), false],
    ])
  );
  return { de, en };
}

function counts(db) {
  return {
    questions: db.prepare("SELECT COUNT(*) AS n FROM question").get().n,
    categories: db.prepare("SELECT COUNT(*) AS n FROM question_category").get().n,
    images: db.prepare("SELECT COUNT(*) AS n FROM image").get().n,
    imports: db.prepare("SELECT COUNT(*) AS n FROM pool_import").get().n,
  };
}

describe("the import of the Moodle pool", () => {
  test("pairs the two files by position and keeps both languages", () => {
    const db = freshDatabase();
    const { de, en } = matchingPools();
    const report = importPool(db, de, en, { sources: { de: "de.xml", en: "en.xml" } });

    assert.equal(report.questions, 4);
    assert.equal(report.categories, 3);
    assert.equal(report.essaysDropped, 1);
    assert.deepEqual(report.byType, { multichoiceset: 2, multichoice: 1, truefalse: 1 });
    assert.ok(poolImported(db));

    const [get] = listQuestions(db, { query: "GET wird" });
    const shown = getQuestion(db, get.id);
    assert.equal(shown.nameDe, "HTTP - GET");
    assert.equal(shown.type, "multichoiceset");
    assert.deepEqual(shown.category, { de: ["HTTP und REST", "HTTP-Grundlagen"], en: ["HTTP and REST", "HTTP Basics"] });
    assert.match(shown.textEn, /The HTTP method GET/);
    assert.deepEqual(
      shown.answers.map((answer) => [answer.position, answer.correct]),
      [
        [1, true],
        [2, false],
      ]
    );
    assert.match(shown.answers[0].textEn, /querying data/);
  });

  test("builds the category tree once per name, with both names", () => {
    const db = freshDatabase();
    const { de, en } = matchingPools();
    importPool(db, de, en);
    const tree = categoryTree(db);
    assert.deepEqual(
      tree.map((node) => [node.nameDe, node.nameEn, node.total, node.children.map((child) => [child.nameDe, child.nameEn, child.questions])]),
      [
        ["HTTP und REST", "HTTP and REST", 3, [["HTTP-Grundlagen", "HTTP Basics", 2], ["Caching", "Caching", 1]]],
        ["Quarkus", "Quarkus", 1, [["CDI", "CDI", 1]]],
      ]
    );
  });

  test("sanitizes the text, drops Moodle's styles and keeps the answer-count hint", () => {
    const db = freshDatabase();
    const { de, en } = matchingPools();
    importPool(db, de, en);
    for (const row of db.prepare("SELECT text_de AS de, text_en AS en FROM question UNION ALL SELECT text_de, text_en FROM answer").all()) {
      for (const text of [row.de, row.en]) {
        assert.doesNotMatch(text, /style=|dir=|CDATA/, `no Moodle layout remains in ${text}`);
      }
    }
    const [methods] = listQuestions(db, { query: "idempotent" });
    assert.match(getQuestion(db, methods.id).textDe, /\(2 richtige Antworten\)/);
    assert.match(getQuestion(db, methods.id).textEn, /\(2 correct answers\)/);
  });

  test("removes script and event handlers the way the renderer does", () => {
    const db = freshDatabase();
    const evil = (lang) =>
      quiz(
        category("A/B"),
        question("multichoice", "Q", `<p onclick="steal()">${lang}</p><script>steal()</script>`, [
          ["<p>ok</p><img src=x onerror=steal()>", true],
          ["<p>no</p>", false],
        ])
      );
    assert.throws(() => importPool(db, evil("de"), evil("en")), PoolImportError, "an image from anywhere but Moodle's files refuses the import");
    assert.deepEqual(counts(db), { questions: 0, categories: 0, images: 0, imports: 0 });

    const harmless = (lang) =>
      quiz(category("A/B"), question("multichoice", "Q", `<p onclick="steal()">${lang}</p><script>steal()</script>`, [["<p>ok</p>", true], ["<p>no</p>", false]]));
    importPool(db, harmless("de"), harmless("en"));
    const text = db.prepare("SELECT text_de AS text FROM question").get().text;
    assert.doesNotMatch(text, /onclick|script/);
    assert.match(text, /de/);
  });

  test("writes true/false answers in each language", () => {
    const db = freshDatabase();
    const { de, en } = matchingPools();
    importPool(db, de, en);
    const [https] = listQuestions(db, { query: "HTTPS" });
    assert.deepEqual(
      getQuestion(db, https.id).answers.map((answer) => [answer.textDe, answer.textEn, answer.correct]),
      [
        ["<p>Richtig</p>", "<p>True</p>", true],
        ["<p>Falsch</p>", "<p>False</p>", false],
      ]
    );
  });

  test("refuses everything on a mismatch and names every position that disagrees", () => {
    const db = freshDatabase();
    const { de } = matchingPools();
    const { en } = matchingPools();
    // Position 2 has two correct answers in German and one in English;
    // position 5 is a multichoice in German and a multichoiceset in English.
    const broken = en
      .replace('<answer fraction="100" format="html"><text><![CDATA[<p dir="ltr" style="text-align: left;">PUT', '<answer fraction="0" format="html"><text><![CDATA[<p dir="ltr" style="text-align: left;">PUT')
      .replace('<question type="multichoice">', '<question type="multichoiceset">');
    assert.notEqual(broken, en);
    let refusal;
    assert.throws(
      () => importPool(db, de, broken),
      (error) => {
        refusal = error;
        return error instanceof PoolImportError;
      }
    );
    assert.deepEqual(
      refusal.mismatches.map((mismatch) => mismatch.position),
      [2, 5]
    );
    assert.match(refusal.message, /position 2: correct answers xx- in German, x-- in English/);
    assert.match(refusal.message, /position 5: type multichoice in German, multichoiceset in English/);
    assert.deepEqual(counts(db), { questions: 0, categories: 0, images: 0, imports: 0 }, "nothing was imported");
  });

  test("refuses a multichoice question with two correct answers", () => {
    const pool = quiz(category("A/B"), question("multichoice", "Q", "<p>?</p>", [["<p>a</p>", true], ["<p>b</p>", true]]));
    assert.throws(() => planImport(pool, pool), /position 1: a multichoice question has exactly one correct answer, not 2/);
  });

  test("refuses files that cannot be paired at all", () => {
    const { de } = matchingPools();
    const shorter = quiz(category("A/B"), question("multichoice", "Q", "<p>?</p>", [["<p>a</p>", true], ["<p>b</p>", false]]));
    assert.throws(() => planImport(de, shorter), /holds 5 questions and the English one 1/);
    assert.throws(() => planImport("<html></html>", shorter), /not a Moodle quiz export/);
  });

  test("moves embedded images into the database and leaves no blob in the text", () => {
    const db = freshDatabase();
    const pool = (lang) =>
      quiz(
        category("Quarkus/CDI"),
        question(
          "multichoice",
          `Bild ${lang}`,
          `<p><img class="img-fluid" src="@@PLUGINFILE@@/image%20%281%29.png" alt="Code" width="600"></p><p>${lang} (1 richtige Antwort)</p>`,
          [
            [`<p><img src="@@PLUGINFILE@@/image.png" alt=""></p>`, true, file("image.png", otherPixel)],
            [`<p><img src="data:image/png;base64,${pixel}"></p>`, false],
          ],
          file("image (1).png", pixel) + file("unused.png", otherPixel)
        )
      );
    const report = importPool(db, pool("de"), pool("en"));
    // Both languages carry the same two pictures: stored once per question.
    assert.equal(report.images, 2);
    assert.equal(report.questionsWithImages, 1);
    assert.equal(report.unreferencedFilesDropped, 2, "the unused file in each language is dropped");

    const stored = getQuestion(db, listQuestions(db)[0].id);
    for (const text of [stored.textDe, stored.textEn, ...stored.answers.flatMap((answer) => [answer.textDe, answer.textEn])]) {
      assert.doesNotMatch(text, /base64|@@PLUGINFILE@@|data:/);
    }
    const ids = [...`${stored.textDe}${stored.answers.map((answer) => answer.textDe).join("")}`.matchAll(/\/exam\/api\/images\/(\d+)/g)].map((match) => Number(match[1]));
    assert.equal(ids.length, 3);
    assert.equal(ids[0], ids[2], "the inline copy of the first picture is the same stored image");
    assert.match(stored.textDe, new RegExp(`src="${imagePath(ids[0])}" alt="Code" width="600"`));

    const image = readImage(db, ids[0]);
    assert.equal(image.mime, "image/png");
    assert.equal(image.questionId, stored.id);
    assert.deepEqual(Buffer.from(image.data), Buffer.from(pixel, "base64"));
    assert.equal(readImage(db, 999), null);
  });

  test("refuses a text referencing a file it does not carry", () => {
    const db = freshDatabase();
    const pool = quiz(category("A/B"), question("multichoice", "Q", `<p><img src="@@PLUGINFILE@@/missing.png"></p>`, [["<p>a</p>", true], ["<p>b</p>", false]]));
    assert.throws(() => importPool(db, pool, pool), /references the file missing\.png/);
    assert.deepEqual(counts(db), { questions: 0, categories: 0, images: 0, imports: 0 });
  });

  test("refuses a second import and changes nothing", () => {
    const db = freshDatabase();
    const { de, en } = matchingPools();
    importPool(db, de, en);
    const before = counts(db);
    assert.throws(() => importPool(db, de, en), /imported already/);
    assert.deepEqual(counts(db), before);
  });

  const realDir = "/mnt/data/nextcloud/htl-claude/moodle-quiz-questions";
  const realDe = path.join(realDir, "WMC - Fragenpool - thematisch.xml");
  const realEn = path.join(realDir, "WMC - Question Pool - by topic (EN).xml");
  test(
    "a dry run against the real pool reports 94 questions in 22 categories and 9 essays dropped",
    { skip: !(fs.existsSync(realDe) && fs.existsSync(realEn)) && "the real Moodle export is not on this machine" },
    () => {
      const { report } = planImport(fs.readFileSync(realDe, "utf8"), fs.readFileSync(realEn, "utf8"));
      assert.equal(report.questions, 94);
      assert.equal(report.categories, 22);
      assert.equal(report.essaysDropped, 9);
    }
  );
});

describe("the question browser's reads", () => {
  test("searches name, text and answers in both languages, ignoring case and markup", () => {
    const db = freshDatabase();
    const { de, en } = matchingPools();
    importPool(db, de, en);
    assert.deepEqual(listQuestions(db, { query: "idempotent" }).map((q) => q.nameDe), ["HTTP - Methoden"]);
    assert.deepEqual(listQuestions(db, { query: "QUERYING DATA" }).map((q) => q.nameDe), ["HTTP - GET"], "an English answer");
    assert.deepEqual(listQuestions(db, { query: "Konstruktor" }).map((q) => q.nameDe), ["CDI - @Inject"], "a German answer");
    assert.deepEqual(listQuestions(db, { query: "style" }), [], "not the markup");
    assert.equal(listQuestions(db).length, 4);
  });

  test("a category lists its own questions and those below it", () => {
    const db = freshDatabase();
    const { de, en } = matchingPools();
    importPool(db, de, en);
    const [http] = categoryTree(db);
    assert.deepEqual(listQuestions(db, { categoryId: http.id }).map((q) => q.nameDe), ["HTTP - GET", "HTTP - Methoden", "HTTP - HTTPS"]);
    assert.deepEqual(listQuestions(db, { categoryId: http.children[1].id }).map((q) => q.nameDe), ["HTTP - HTTPS"]);
  });

  test("a question shows each test it was used in, with course and date", () => {
    const db = freshDatabase();
    const { de, en } = matchingPools();
    importPool(db, de, en);
    const year = createYear(db, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
    const courseOf = (name) => createCourse(db, createClass(db, year.id, { name }).id, { subject: "WMC" }).id;
    const [first, second] = [courseOf("4ahif"), courseOf("4bhif")];
    // The tests arrive with P3; a stand-in for the table until then.
    db.exec("CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO test (id) VALUES (1), (2)");
    const [get] = listQuestions(db, { query: "GET wird" });
    const use = db.prepare("INSERT INTO question_usage (question_id, test_id, course_id, used_on) VALUES (?, ?, ?, ?)");
    use.run(get.id, 2, second, "2026-11-12");
    use.run(get.id, 1, first, "2026-11-10");

    const shown = getQuestion(db, get.id);
    assert.equal(shown.uses, 2);
    assert.deepEqual(
      shown.usage.map((u) => [u.className, u.subject, u.yearName, u.usedOn]),
      [
        ["4ahif", "WMC", "2026/27", "2026-11-10"],
        ["4bhif", "WMC", "2026/27", "2026-11-12"],
      ]
    );
    const [listed] = listQuestions(db, { query: "GET wird" });
    assert.equal(listed.uses, 2);
    assert.equal(listed.lastUsedOn, "2026-11-12");
  });

  test("retired questions are hidden unless asked for", () => {
    const db = freshDatabase();
    const { de, en } = matchingPools();
    importPool(db, de, en);
    db.exec("UPDATE question SET retired = 1 WHERE name_de = 'HTTP - GET'");
    assert.equal(listQuestions(db).length, 3);
    assert.equal(listQuestions(db, { includeRetired: true }).length, 4);
    assert.equal(categoryTree(db)[0].total, 2);
  });

  test("no student sees an image while there are no attempts", () => {
    const db = freshDatabase();
    assert.equal(studentMaySeeImage(db, "student", { questionId: 1 }), false);
  });
});
