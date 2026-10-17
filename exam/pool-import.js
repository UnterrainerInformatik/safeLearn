/**
 * The one-time import of the Moodle question pool (`question-pool`, design.md
 * D10): the German original and its English translation, two Moodle XML
 * exports, paired by position and verified before anything is written.
 *
 * Moodle gives the questions no shared id (`idnumber` is empty, and the names
 * differ between the languages), so position is the only key. Every pair has
 * to agree in type, number of answers and correct-answer pattern, and sit in
 * the same category; if any pair disagrees, nothing is imported and every
 * disagreeing position is reported. `essay` questions are dropped and counted.
 *
 * Text is sanitized with the renderer's sanitizer, without Moodle's inline
 * styles. Images Moodle embeds as `@@PLUGINFILE@@` with a base64 `<file>`
 * beside the text go into the `image` table and are referenced by the module's
 * image route instead, so no blob remains in any text.
 *
 * Nothing here reads a file or opens a database by itself: the command line is
 * `import-moodle-pool.mjs`, and the checks call these functions directly.
 */

import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";

import { sanitizeHtml } from "../sanitize.js";

/** The types the pool keeps. `essay` is dropped; anything else refuses the import. */
export const questionTypes = ["multichoiceset", "multichoice", "truefalse"];

/** Moodle's inline layout, which the instance's own styles replace. */
const forbiddenAttributes = ["style", "dir", "class", "role"];

/** What a true/false question's two answers read in each language. */
const trueFalseText = {
  de: { true: "Richtig", false: "Falsch" },
  en: { true: "True", false: "False" },
};

const imageTypes = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Where a stored image is served; the text references it by this path. */
export function imagePath(id) {
  return `/exam/api/images/${id}`;
}

/** The import refused: either the files disagree, or the pool was imported before. */
export class PoolImportError extends Error {
  constructor(message, mismatches = []) {
    super(message);
    this.mismatches = mismatches;
  }
}

function childElements(element, name) {
  return [...element.children].filter((child) => child.localName === name);
}

function childText(element, name) {
  const child = childElements(element, name)[0];
  if (!child) return "";
  const text = childElements(child, "text")[0];
  return text ? text.textContent : "";
}

/**
 * The files Moodle attaches to one text - a `questiontext` or an `answer` -
 * by name. A file belongs to the element it sits in, so an answer's image is
 * looked up among that answer's files only.
 */
function filesOf(element) {
  const files = new Map();
  for (const file of childElements(element, "file")) {
    if (file.getAttribute("encoding") !== "base64") continue;
    const name = `${file.getAttribute("path") ?? "/"}${file.getAttribute("name")}`.replace(/^\/+/, "");
    files.set(name, file.textContent.replace(/\s+/g, ""));
  }
  return files;
}

/** A text as Moodle stores it, with the files beside it. */
function textOf(element) {
  const text = childElements(element, "text")[0];
  return {
    format: element.getAttribute("format") ?? "html",
    html: text ? text.textContent : "",
    files: filesOf(element),
  };
}

/** `$course$/top/HTTP und REST/Caching` → `["HTTP und REST", "Caching"]`. */
function categorySegments(path) {
  const segments = path.split("/").map((segment) => segment.trim());
  const top = segments.indexOf("top");
  return segments.slice(top >= 0 ? top + 1 : 1).filter((segment) => segment.length > 0);
}

/**
 * One Moodle XML export, read in document order: every question with its
 * position (1-based, counting questions only, essays included), type, name,
 * text and answers, and the category it was filed under - the last
 * `category` entry before it. Throws on a file that is no quiz export.
 */
export function parseMoodleXml(xml) {
  const { document } = new JSDOM(xml, { contentType: "text/xml" }).window;
  if (document.querySelector("parsererror") || document.documentElement.localName !== "quiz") {
    throw new PoolImportError("This is not a Moodle quiz export (no <quiz> element).");
  }
  const categories = [];
  const questions = [];
  let category = null;
  for (const element of childElements(document.documentElement, "question")) {
    const type = element.getAttribute("type");
    if (type === "category") {
      category = categories.length;
      categories.push(categorySegments(childText(element, "category")));
      continue;
    }
    const questiontext = childElements(element, "questiontext")[0];
    questions.push({
      position: questions.length + 1,
      type,
      category,
      name: childText(element, "name").trim(),
      text: questiontext ? textOf(questiontext) : { format: "html", html: "", files: new Map() },
      answers: childElements(element, "answer").map((answer) => ({
        ...textOf(answer),
        correct: Number(answer.getAttribute("fraction")) > 0,
      })),
    });
  }
  return { categories, questions };
}

function correctPattern(question) {
  return question.answers.map((answer) => (answer.correct ? "x" : "-")).join("");
}

/** Why `question` cannot be kept even on its own, or null. */
function typeProblem(question) {
  const correct = question.answers.filter((answer) => answer.correct).length;
  if (!questionTypes.includes(question.type)) return `type ${question.type} is not one the pool keeps`;
  if (question.answers.length < 2) return "it has fewer than two answers";
  if (question.type === "multichoice" && correct !== 1) return `a multichoice question has exactly one correct answer, not ${correct}`;
  if (question.type === "truefalse" && question.answers.length !== 2) return "a true/false question has two answers";
  if (correct === 0) return "no answer is correct";
  return null;
}

/**
 * Pairs the German and the English export by position and verifies them. On
 * any disagreement it throws a `PoolImportError` listing every position that
 * disagrees, and why; otherwise it returns the pairs to keep, the category
 * pairs, and the essays it dropped.
 */
export function pairPools(de, en) {
  const mismatches = [];
  if (de.questions.length !== en.questions.length) {
    throw new PoolImportError(
      `The German file holds ${de.questions.length} questions and the English one ${en.questions.length}; they cannot be paired by position.`
    );
  }
  if (de.categories.length !== en.categories.length) {
    throw new PoolImportError(
      `The German file holds ${de.categories.length} categories and the English one ${en.categories.length}; they cannot be paired by position.`
    );
  }
  de.categories.forEach((segments, index) => {
    if (segments.length !== en.categories[index].length) {
      mismatches.push({ category: index + 1, reason: `category ${index + 1} is ${segments.length} levels deep in German and ${en.categories[index].length} in English` });
    }
  });

  const pairs = [];
  let essays = 0;
  de.questions.forEach((german, index) => {
    const english = en.questions[index];
    const reasons = [];
    if (german.type !== english.type) reasons.push(`type ${german.type} in German, ${english.type} in English`);
    if (german.category !== english.category) reasons.push("filed under different categories");
    if (german.category === null) reasons.push("filed under no category");
    if (german.type === "essay" && english.type === "essay") {
      if (reasons.length === 0) essays += 1;
    } else {
      if (german.answers.length !== english.answers.length) {
        reasons.push(`${german.answers.length} answers in German, ${english.answers.length} in English`);
      } else if (correctPattern(german) !== correctPattern(english)) {
        reasons.push(`correct answers ${correctPattern(german)} in German, ${correctPattern(english)} in English`);
      }
      const problem = german.type === english.type ? typeProblem(german) : null;
      if (problem) reasons.push(problem);
    }
    if (reasons.length > 0) {
      mismatches.push({ position: german.position, reason: reasons.join("; ") });
    } else if (german.type !== "essay") {
      pairs.push({ de: german, en: english });
    }
  });

  if (mismatches.length > 0) {
    const listed = mismatches.map((m) => (m.position ? `position ${m.position}: ${m.reason}` : m.reason)).join("\n  ");
    throw new PoolImportError(`The two files disagree; nothing was imported.\n  ${listed}`, mismatches);
  }
  return { pairs, categories: de.categories.map((segments, index) => ({ de: segments, en: en.categories[index] })), essays };
}

function escapeText(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * A text as the pool stores it: sanitized HTML without Moodle's styles, every
 * `@@PLUGINFILE@@` image replaced through `placeImage(file)`, which stores the
 * file and returns its path. A reference to a file the text does not carry
 * refuses the import, and so does an image left pointing anywhere but the
 * module - no blob and no foreign address remains in a stored text.
 */
function storedHtml(text, placeImage, where) {
  if (text.format !== "html") return `<p>${escapeText(text.html.trim())}</p>`;
  const clean = sanitizeHtml(text.html, { FORBID_ATTR: forbiddenAttributes });
  const fragment = JSDOM.fragment(`<div>${clean}</div>`).firstChild;
  for (const img of fragment.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    // Moodle's editor also leaves pasted images inline, as a data URI.
    const inline = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);
    if (inline) {
      img.setAttribute("src", placeImage({ mime: inline[1].toLowerCase(), name: "inline image", data: inline[2] }));
      continue;
    }
    if (!src.startsWith("@@PLUGINFILE@@/")) {
      throw new PoolImportError(`${where} embeds an image from ${src.slice(0, 40)}, which the pool cannot keep.`);
    }
    const name = decodeURIComponent(src.slice("@@PLUGINFILE@@/".length).split(/[?#]/)[0]);
    const data = text.files.get(name);
    if (data === undefined) {
      throw new PoolImportError(`${where} references the file ${name}, which is not part of it.`);
    }
    img.setAttribute("src", placeImage({ mime: imageType(name), name, data }));
  }
  return fragment.innerHTML;
}

function trueFalseAnswer(answer, language) {
  const word = answer.html.trim().toLowerCase();
  return `<p>${trueFalseText[language][word] ?? escapeText(answer.html.trim())}</p>`;
}

function imageType(name) {
  return imageTypes[name.split(".").at(-1).toLowerCase()] ?? null;
}

/** How many files the kept questions carry that none of their texts references. */
function unreferencedFiles(pairs) {
  let count = 0;
  for (const pair of pairs) {
    for (const question of [pair.de, pair.en]) {
      for (const text of [question.text, ...question.answers]) {
        for (const name of text.files.keys()) {
          const encoded = encodeURI(name).replaceAll("(", "%28").replaceAll(")", "%29");
          if (!text.html.includes(`@@PLUGINFILE@@/${encoded}`) && !text.html.includes(`@@PLUGINFILE@@/${name}`)) count += 1;
        }
      }
    }
  }
  return count;
}

/**
 * What an import of these two exports would bring in, without writing
 * anything: the counts the report states. Throws like `pairPools`.
 */
export function planImport(deXml, enXml) {
  const de = parseMoodleXml(deXml);
  const en = parseMoodleXml(enXml);
  const { pairs, categories, essays } = pairPools(de, en);
  const byType = Object.fromEntries(questionTypes.map((type) => [type, pairs.filter((pair) => pair.de.type === type).length]));
  return {
    de,
    en,
    pairs,
    categories,
    report: {
      questions: pairs.length,
      categories: categories.length,
      essaysDropped: essays,
      byType,
      questionsWithImages: pairs.filter((pair) =>
        [pair.de, pair.en].some((q) => [q.text, ...q.answers].some((text) => /@@PLUGINFILE@@|src="data:image\//.test(text.html)))
      ).length,
      unreferencedFilesDropped: unreferencedFiles(pairs),
    },
  };
}

/** Whether the pool in `db` was imported already. */
export function poolImported(db) {
  return db.prepare("SELECT COUNT(*) AS count FROM pool_import").get().count > 0;
}

/**
 * Imports the pool into `db` in one transaction and returns the report. Refuses
 * - changing nothing - when the pool was imported before, or when the files
 * disagree. `sources` names the two files for the record.
 */
export function importPool(db, deXml, enXml, { sources = { de: "", en: "" }, now = new Date() } = {}) {
  if (poolImported(db)) {
    throw new PoolImportError("The question pool was imported already; the database is its source now, and a second import changes nothing.");
  }
  const plan = planImport(deXml, enXml);
  const stamp = now.toISOString();

  const insertCategory = db.prepare(
    "INSERT INTO question_category (parent_id, name_de, name_en, position) VALUES (?, ?, ?, ?) RETURNING id"
  );
  const insertQuestion = db.prepare(
    `INSERT INTO question (category_id, type, name_de, name_en, text_de, text_en, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', '', ?, ?, ?) RETURNING id`
  );
  const updateTexts = db.prepare("UPDATE question SET text_de = ?, text_en = ? WHERE id = ?");
  const insertAnswer = db.prepare(
    "INSERT INTO answer (question_id, position, text_de, text_en, correct) VALUES (?, ?, ?, ?, ?)"
  );
  const insertImage = db.prepare(
    `INSERT INTO image (question_id, mime, sha256, data) VALUES (?, ?, ?, ?)
     ON CONFLICT (question_id, sha256) DO UPDATE SET sha256 = excluded.sha256 RETURNING id`
  );

  let images = 0;
  db.exec("BEGIN");
  try {
    // The tree, node by node: a node is known by its German path, and its
    // English name comes from the same position in the English file.
    const nodes = new Map();
    const siblings = new Map();
    const leafOf = new Map();
    // Every category is kept, also one that held only essays: the editor
    // fills it later.
    plan.categories.forEach((category, index) => {
      let parent = null;
      category.de.forEach((name, depth) => {
        const key = JSON.stringify(category.de.slice(0, depth + 1));
        let node = nodes.get(key);
        if (!node) {
          const position = (siblings.get(parent) ?? 0) + 1;
          siblings.set(parent, position);
          node = { id: insertCategory.get(parent, name, category.en[depth], position).id, en: category.en[depth] };
          nodes.set(key, node);
        } else if (node.en !== category.en[depth]) {
          throw new PoolImportError(
            `The German category ${category.de.slice(0, depth + 1).join(" / ")} is called both "${node.en}" and "${category.en[depth]}" in English.`
          );
        }
        parent = node.id;
      });
      leafOf.set(index, parent);
    });

    const positions = new Map();
    for (const { de, en } of plan.pairs) {
      const categoryId = leafOf.get(de.category);
      const position = (positions.get(categoryId) ?? 0) + 1;
      positions.set(categoryId, position);
      const questionId = insertQuestion.get(categoryId, de.type, de.name || en.name, en.name || de.name, position, stamp, stamp).id;
      const where = `Question ${de.position} (${de.name})`;
      const placeImage = ({ mime, name, data }) => {
        if (!Object.values(imageTypes).includes(mime)) throw new PoolImportError(`${where} embeds ${name}, which is not an image type the pool keeps.`);
        const bytes = Buffer.from(data, "base64");
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const { id } = insertImage.get(questionId, mime, sha256, bytes);
        return imagePath(id);
      };
      updateTexts.run(storedHtml(de.text, placeImage, where), storedHtml(en.text, placeImage, where), questionId);
      de.answers.forEach((answer, index) => {
        const english = en.answers[index];
        const textDe = de.type === "truefalse" ? trueFalseAnswer(answer, "de") : storedHtml(answer, placeImage, `${where}, answer ${index + 1}`);
        const textEn = de.type === "truefalse" ? trueFalseAnswer(english, "en") : storedHtml(english, placeImage, `${where}, answer ${index + 1}`);
        insertAnswer.run(questionId, index + 1, textDe, textEn, answer.correct ? 1 : 0);
      });
    }
    images = db.prepare("SELECT COUNT(*) AS count FROM image").get().count;
    const report = { ...plan.report, images };
    db.prepare("INSERT INTO pool_import (imported_at, source_de, source_en, report) VALUES (?, ?, ?, ?)").run(
      stamp,
      sources.de,
      sources.en,
      JSON.stringify(report)
    );
    db.exec("COMMIT");
    return report;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
