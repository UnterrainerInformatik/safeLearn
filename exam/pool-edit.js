/**
 * Changing the question pool online (`question-editor`): validating and saving
 * a question in both languages, images uploaded for it, retiring, reviving and
 * deleting it, and the category tree.
 *
 * Saving changes the pool only. A test keeps the snapshot it was assembled
 * with (exam-online-tests design D2), and an image a snapshot shows is never
 * changed or deleted here; a test not yet written takes up an edit only when
 * a teacher asks for it through `updateTest` (exam-question-editor design D8).
 *
 * Plain SQL over the module's database, synchronous like `DatabaseSync`; who
 * may ask for what is the router's business.
 */

import { createHash, randomBytes } from "node:crypto";

import { ConflictError, englishText, inTransaction, InvalidInputError, NotFoundError, now, problemAt } from "./classes.js";
import { categoryAndBelow, getQuestion, plainText } from "./pool.js";
import { imagePath, questionTypes } from "./pool-import.js";
import { cleanStoredHtml, trueFalseText } from "./stored-html.js";

/** The largest image an upload accepts, and how long an unsaved one is kept. */
export const uploadLimitBytes = 2 * 1024 * 1024;
export const uploadMaxAgeMs = 24 * 60 * 60 * 1000;

const nameLimit = 200;

/**
 * A question the editor sent that cannot be saved as it is. Answered with 422
 * and every problem found, each with the field it concerns and, for an
 * answer's text, the answer's number (1-based).
 */
export class QuestionProblemsError extends Error {
  constructor(problems) {
    const key = problems.length === 1 ? problems[0].key : "exam.errors.pool.cannotSave";
    const params = problems.length === 1 ? problems[0].params : { count: problems.length };
    super(problems.length === 1 ? problems[0].message : englishText(key, params));
    // For the handler, which answers in the reader's language (`readableMessage`).
    this.key = key;
    this.params = params;
    this.problems = problems;
  }
}

/** Where a staged upload is served until a save makes it a question's image. */
export function uploadPath(token) {
  return `/exam/api/pool/uploads/${token}`;
}

const imageRoute = /^\/exam\/api\/images\/([1-9]\d{0,9})$/;
const uploadRoute = /^\/exam\/api\/pool\/uploads\/([0-9a-f]{32})$/;

/** Whether a stored text says anything: words, or at least an image. */
function present(html) {
  return typeof html === "string" && (plainText(html).length > 0 || /<img\b/i.test(html));
}

function trimmedName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function questionRow(db, id) {
  const row = db.prepare("SELECT * FROM question WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.pool.noQuestion");
  return row;
}

/**
 * Why `src` cannot stay in a text of the question `questionId` (null for a new
 * one), or null if it can: an image of that question, or an upload staged and
 * not yet purged. Anything else - another question's image, a `data:` URI, a
 * foreign address - is refused.
 */
function imageProblem(db, questionId, src) {
  const own = imageRoute.exec(src);
  if (own) {
    const image = db.prepare("SELECT question_id AS questionId FROM image WHERE id = ?").get(Number(own[1]));
    if (image && questionId !== null && image.questionId === questionId) return null;
    return "otherQuestion";
  }
  const staged = uploadRoute.exec(src);
  if (staged) {
    if (db.prepare("SELECT 1 FROM image_upload WHERE token = ?").get(staged[1])) return null;
    return "uploadGone";
  }
  return src.startsWith("data:") ? "notUploaded" : "outside";
}

/**
 * The problem an image's reason (`imageProblem`) makes at `field`: in the
 * question text when `answer` is null, else in that answer (1-based).
 */
function imageProblemAt(field, reason, answer) {
  const keys = {
    otherQuestion: ["exam.errors.pool.textImageOtherQuestion", "exam.errors.pool.answerImageOtherQuestion"],
    uploadGone: ["exam.errors.pool.textImageUploadGone", "exam.errors.pool.answerImageUploadGone"],
    notUploaded: ["exam.errors.pool.textImageNotUploaded", "exam.errors.pool.answerImageNotUploaded"],
    outside: ["exam.errors.pool.textImageOutside", "exam.errors.pool.answerImageOutside"],
  }[reason];
  return answer === null ? problemAt(field, keys[0], {}, null) : problemAt(field, keys[1], { answer }, answer);
}

/** A problem saving reports at the text as a whole, whichever answer it is in. */
function withoutAnswer(problem) {
  problem.answer = null;
  return problem;
}

/** Every image source a text names, before cleaning. */
function imageSources(html) {
  // Without "<img" no parser makes an image of it, and sanitizing is the
  // costly part of checking a file of 200 questions.
  if (!/<img/i.test(String(html ?? ""))) return [];
  const sources = [];
  cleanStoredHtml(String(html ?? ""), (src) => {
    sources.push(src);
    return src;
  });
  return sources;
}

/**
 * Every problem `input` has as a question of the pool (the spec's list): both
 * languages of the title and text present, every answer's text present in
 * both languages, the correct flags fitting the type, an existing category,
 * and only images the question may embed. An empty list means it can be
 * saved. `questionId` is the question being edited, or null for a new one.
 */
export function questionProblems(db, input, questionId = null) {
  const problems = [];
  const problem = (field, key, params = {}, answer = null) => problems.push(problemAt(field, key, params, answer));
  const value = input ?? {};

  if (!questionTypes.includes(value.type)) problem("type", "exam.errors.pool.chooseType");
  const categoryId = value.categoryId;
  if (!Number.isInteger(categoryId) || !db.prepare("SELECT 1 FROM question_category WHERE id = ?").get(categoryId)) {
    problem("categoryId", "exam.errors.pool.chooseCategory");
  }
  for (const [field, missing, tooLong] of [
    ["nameDe", "exam.errors.pool.titleMissingDe", "exam.errors.pool.titleTooLongDe"],
    ["nameEn", "exam.errors.pool.titleMissingEn", "exam.errors.pool.titleTooLongEn"],
  ]) {
    const name = trimmedName(value[field]);
    if (name.length === 0) problem(field, missing);
    else if (name.length > nameLimit) problem(field, tooLong, { limit: nameLimit });
  }
  for (const [field, missing] of [["textDe", "exam.errors.pool.textMissingDe"], ["textEn", "exam.errors.pool.textMissingEn"]]) {
    if (!present(value[field])) problem(field, missing);
  }

  const answers = Array.isArray(value.answers) ? value.answers : [];
  const correct = answers.filter((answer) => answer?.correct === true).length;
  if (value.type === "truefalse") {
    if (answers.length !== 2) problem("answers", "exam.errors.pool.trueFalseAnswers");
    else if (correct !== 1) problem("answers", "exam.errors.pool.trueFalseMark");
  } else {
    answers.forEach((answer, index) => {
      for (const [field, missing] of [["textDe", "exam.errors.pool.answerTextMissingDe"], ["textEn", "exam.errors.pool.answerTextMissingEn"]]) {
        if (!present(answer?.[field])) problem(field, missing, { answer: index + 1 }, index + 1);
      }
    });
    if (answers.length < 2) problem("answers", "exam.errors.pool.twoAnswers");
    if (value.type === "multichoice" && correct !== 1) problem("answers", "exam.errors.pool.singleChoiceCorrect");
    if (value.type === "multichoiceset" && correct === 0) problem("answers", "exam.errors.pool.oneCorrect");
  }

  const texts = [
    ["textDe", null, value.textDe],
    ["textEn", null, value.textEn],
    ...(value.type === "truefalse" ? [] : answers.flatMap((answer, index) => [["textDe", index + 1, answer?.textDe], ["textEn", index + 1, answer?.textEn]])),
  ];
  for (const [field, answer, html] of texts) {
    for (const src of imageSources(html)) {
      const reason = imageProblem(db, questionId, src);
      if (reason) problems.push(imageProblemAt(field, reason, answer));
    }
  }
  return problems;
}

/**
 * Stores the texts and answers of `input` as the question `questionId`'s,
 * inside the caller's transaction: texts cleaned, staged uploads turned into
 * the question's images (an identical one it has already is reused), answers
 * replaced, and the question's images that no text references and no test
 * shows removed.
 */
function writeContent(db, questionId, input) {
  const insertImage = db.prepare(
    `INSERT INTO image (question_id, mime, sha256, data) VALUES (?, ?, ?, ?)
     ON CONFLICT (question_id, sha256) DO UPDATE SET sha256 = excluded.sha256 RETURNING id`
  );
  const usedUploads = new Set();
  // `answer` is the answer's number, or null for the question text.
  const resolve = (src, answer) => {
    const reason = imageProblem(db, questionId, src);
    if (reason) throw new QuestionProblemsError([withoutAnswer(imageProblemAt("text", reason, answer))]);
    const staged = uploadRoute.exec(src);
    if (!staged) return src;
    const upload = db.prepare("SELECT mime, sha256, data FROM image_upload WHERE token = ?").get(staged[1]);
    usedUploads.add(staged[1]);
    return imagePath(insertImage.get(questionId, upload.mime, upload.sha256, upload.data).id);
  };

  const textDe = cleanStoredHtml(input.textDe, resolve, null);
  const textEn = cleanStoredHtml(input.textEn, resolve, null);
  db.prepare("UPDATE question SET text_de = ?, text_en = ? WHERE id = ?").run(textDe, textEn, questionId);

  db.prepare("DELETE FROM answer WHERE question_id = ?").run(questionId);
  const insertAnswer = db.prepare("INSERT INTO answer (question_id, position, text_de, text_en, correct) VALUES (?, ?, ?, ?, ?)");
  input.answers.forEach((answer, index) => {
    const where = index + 1;
    // A true/false question's answers are the fixed words, true first.
    const word = index === 0 ? "true" : "false";
    const answerDe = input.type === "truefalse" ? `<p>${trueFalseText.de[word]}</p>` : cleanStoredHtml(answer.textDe, resolve, where);
    const answerEn = input.type === "truefalse" ? `<p>${trueFalseText.en[word]}</p>` : cleanStoredHtml(answer.textEn, resolve, where);
    insertAnswer.run(questionId, index + 1, answerDe, answerEn, answer.correct === true ? 1 : 0);
  });

  const removeUpload = db.prepare("DELETE FROM image_upload WHERE token = ?");
  for (const token of usedUploads) removeUpload.run(token);
  removeUnreferencedImages(db, questionId);
}

/**
 * Deletes the images of a question that none of its texts references any
 * more, except those a test's snapshot shows: they stay, served to that test.
 */
function removeUnreferencedImages(db, questionId) {
  const texts = [
    ...Object.values(db.prepare("SELECT text_de, text_en FROM question WHERE id = ?").get(questionId)),
    ...db.prepare("SELECT text_de, text_en FROM answer WHERE question_id = ?").all(questionId).flatMap(Object.values),
  ].join(" ");
  const referenced = new Set([...texts.matchAll(/\/exam\/api\/images\/(\d+)/g)].map((match) => Number(match[1])));
  const remove = db.prepare("DELETE FROM image WHERE id = ?");
  for (const { id } of db
    .prepare("SELECT id FROM image i WHERE question_id = ? AND NOT EXISTS (SELECT 1 FROM test_image t WHERE t.image_id = i.id)")
    .all(questionId)) {
    if (!referenced.has(id)) remove.run(id);
  }
}

/** The next position at the end of a category. */
function endOfCategory(db, categoryId) {
  return db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM question WHERE category_id = ?").get(categoryId).position;
}

/** The input normalized for storing: a true/false question always gets its two answers. */
function normalizedInput(input) {
  const answers = Array.isArray(input.answers) ? input.answers : [];
  return {
    ...input,
    nameDe: trimmedName(input.nameDe),
    nameEn: trimmedName(input.nameEn),
    answers,
  };
}

/**
 * The tests that hold the question in a snapshot and have not been written
 * yet: the ones the editor offers to bring up to the saved version.
 */
export function unwrittenTestsWith(db, questionId) {
  return db
    .prepare(
      `SELECT t.id, t.name, co.id AS courseId, co.subject, cl.name AS className
       FROM test t
       JOIN course co ON co.id = t.course_id
       JOIN class cl ON cl.id = co.class_id
       WHERE EXISTS (SELECT 1 FROM test_question tq WHERE tq.test_id = t.id AND tq.question_id = ?)
         AND NOT EXISTS (SELECT 1 FROM attempt a WHERE a.test_id = t.id)
       ORDER BY t.created_at, t.id`
    )
    .all(questionId);
}

/** What a save answers: the question as the editor reads it, and the unwritten tests holding it. */
function saved(db, questionId) {
  return { question: getQuestion(db, questionId), unwrittenTests: unwrittenTestsWith(db, questionId) };
}

/**
 * Saves the edited question `id` (design D5). Refused with every problem
 * before anything is written, and with a conflict when `input.version` is not
 * the stored version - the question was changed in between. A save is a
 * review: it clears an imported question's "not reviewed" mark.
 */
export function saveQuestion(db, id, input = {}) {
  questionRow(db, id);
  const problems = questionProblems(db, input, id);
  if (problems.length > 0) throw new QuestionProblemsError(problems);
  const value = normalizedInput(input);
  return inTransaction(db, () => {
    const row = questionRow(db, id);
    const position = row.category_id === value.categoryId ? row.position : endOfCategory(db, value.categoryId);
    const { changes } = db
      .prepare(
        `UPDATE question SET category_id = ?, type = ?, name_de = ?, name_en = ?, position = ?,
           version = version + 1, updated_at = ?, unreviewed = 0
         WHERE id = ? AND version = ?`
      )
      .run(value.categoryId, value.type, value.nameDe, value.nameEn, position, now(), id, Number.isInteger(value.version) ? value.version : -1);
    if (changes === 0) {
      throw new ConflictError("exam.errors.pool.changedMeanwhile");
    }
    writeContent(db, id, value);
    return saved(db, id);
  });
}

/**
 * Inserts the checked question `input` at the end of its category, inside the
 * caller's transaction, and answers its id. Shared by the editor's create and
 * the Markdown import (exam-question-import design D5), which records the
 * import it came from and marks it as not reviewed.
 */
export function insertQuestion(db, input, { importId = null, unreviewed = false } = {}) {
  const value = normalizedInput(input);
  const at = now();
  const { id } = db
    .prepare(
      `INSERT INTO question (category_id, type, name_de, name_en, text_de, text_en, position, created_at, updated_at, import_id, unreviewed)
       VALUES (?, ?, ?, ?, '', '', ?, ?, ?, ?, ?) RETURNING id`
    )
    .get(value.categoryId, value.type, value.nameDe, value.nameEn, endOfCategory(db, value.categoryId), at, at, importId, unreviewed ? 1 : 0);
  writeContent(db, id, value);
  return id;
}

/** Creates a question in its category, at the end of it. Refused like a save. */
export function createQuestion(db, input = {}) {
  const problems = questionProblems(db, input, null);
  if (problems.length > 0) throw new QuestionProblemsError(problems);
  return inTransaction(db, () => saved(db, insertQuestion(db, input)));
}

/**
 * Clears the "not reviewed" mark of an imported question (exam-question-import
 * design D7). The content is unchanged, so the version is too: an editor open
 * meanwhile can still save.
 */
export function markReviewed(db, id) {
  questionRow(db, id);
  db.prepare("UPDATE question SET unreviewed = 0 WHERE id = ?").run(id);
  return getQuestion(db, id);
}

/** Retires a question: not offered for new tests, its tests and usage untouched. */
export function retireQuestion(db, id) {
  return setRetired(db, id, 1);
}

/** Makes a retired question available for new tests again. */
export function reviveQuestion(db, id) {
  return setRetired(db, id, 0);
}

function setRetired(db, id, retired) {
  questionRow(db, id);
  db.prepare("UPDATE question SET retired = ?, version = version + 1, updated_at = ? WHERE id = ?").run(retired, now(), id);
  return getQuestion(db, id);
}

/**
 * Deletes a question no test has ever contained, with its answers and images.
 * A used one is refused with retiring offered instead (design D6).
 */
export function deleteQuestion(db, id) {
  questionRow(db, id);
  return inTransaction(db, () => {
    const used =
      db.prepare("SELECT 1 FROM question_usage WHERE question_id = ? LIMIT 1").get(id) ||
      db.prepare("SELECT 1 FROM test_question WHERE question_id = ? LIMIT 1").get(id);
    if (used) throw new ConflictError("exam.errors.pool.usedCannotDelete");
    db.prepare("DELETE FROM question WHERE id = ?").run(id);
    return { deleted: id };
  });
}

// --------------------------------------------------------------------- uploads

/** The image type of `bytes`, judged by their first bytes alone, or null. */
export function imageTypeOf(bytes) {
  if (!Buffer.isBuffer(bytes)) return null;
  const starts = (signature, offset = 0) => bytes.length >= offset + signature.length && bytes.subarray(offset, offset + signature.length).equals(Buffer.from(signature));
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts(Buffer.from("GIF87a")) || starts(Buffer.from("GIF89a"))) return "image/gif";
  if (starts(Buffer.from("RIFF")) && starts(Buffer.from("WEBP"), 8)) return "image/webp";
  return null;
}

/**
 * Stages an uploaded image until a save makes it a question's (design D4) and
 * answers where the editor can show it meanwhile. Only PNG, JPEG, GIF and WebP
 * up to `uploadLimitBytes`, recognized by their content.
 */
export function stageUpload(db, bytes, username, at = now()) {
  if (Buffer.isBuffer(bytes) && bytes.length > uploadLimitBytes) {
    throw new InvalidInputError("exam.errors.pool.imageTooLarge");
  }
  const mime = imageTypeOf(bytes);
  if (mime === null) throw new InvalidInputError("exam.errors.pool.imageType");
  const token = randomBytes(16).toString("hex");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  db.prepare("INSERT INTO image_upload (token, uploaded_by, uploaded_at, mime, sha256, data) VALUES (?, ?, ?, ?, ?, ?)").run(
    token,
    username,
    at,
    mime,
    sha256,
    bytes
  );
  return { src: uploadPath(token) };
}

/** A staged upload by its token, or null. */
export function readUpload(db, token) {
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) return null;
  return db.prepare("SELECT mime, data FROM image_upload WHERE token = ?").get(token) ?? null;
}

/** Removes uploads older than `uploadMaxAgeMs` that no save took up. Returns how many. */
export function purgeUploads(db, at = new Date()) {
  const cutoff = new Date(at.getTime() - uploadMaxAgeMs).toISOString();
  return Number(db.prepare("DELETE FROM image_upload WHERE uploaded_at < ?").run(cutoff).changes);
}

// ------------------------------------------------------------------ categories

function categoryRow(db, id) {
  const row = db.prepare("SELECT * FROM question_category WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.pool.noCategory");
  return row;
}

/** Both names of a category, trimmed; both are required. */
function categoryNames({ nameDe, nameEn }) {
  const de = trimmedName(nameDe);
  const en = trimmedName(nameEn);
  if (de.length === 0 || en.length === 0) throw new InvalidInputError("exam.errors.pool.categoryNames");
  if (de.length > nameLimit || en.length > nameLimit) throw new InvalidInputError("exam.errors.pool.categoryNameLength", { limit: nameLimit });
  return { de, en };
}

/** A parent given by the client: null for the top, or an existing category's id. */
function parentOf(db, parentId) {
  if (parentId === null || parentId === undefined) return null;
  if (!Number.isInteger(parentId)) throw new InvalidInputError("exam.errors.pool.categoryParent");
  categoryRow(db, parentId);
  return parentId;
}

function endOfSiblings(db, parentId) {
  return db
    .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM question_category WHERE COALESCE(parent_id, 0) = COALESCE(?, 0)")
    .get(parentId).position;
}

/** Runs `fn`, answering a duplicate German name among siblings with a conflict naming it. */
function namedUniquely(name, fn) {
  try {
    return fn();
  } catch (error) {
    if (/UNIQUE constraint failed/.test(error?.message ?? "")) {
      throw new ConflictError("exam.errors.pool.categoryExists", { name });
    }
    throw error;
  }
}

function categoryView(db, id) {
  const row = categoryRow(db, id);
  return { id: row.id, parentId: row.parent_id, nameDe: row.name_de, nameEn: row.name_en, position: row.position };
}

/**
 * Inserts a category under `parentId` (null for the top) after its siblings,
 * inside the caller's transaction, and answers its id. Also the Markdown
 * import's way to create the categories its file names.
 */
export function insertCategory(db, { parentId = null, nameDe, nameEn }) {
  const names = categoryNames({ nameDe, nameEn });
  return db
    .prepare("INSERT INTO question_category (parent_id, name_de, name_en, position) VALUES (?, ?, ?, ?) RETURNING id")
    .get(parentId, names.de, names.en, endOfSiblings(db, parentId)).id;
}

/** Creates a category at the top or under `parentId`, after its siblings. */
export function createCategory(db, { parentId = null, nameDe, nameEn } = {}) {
  const names = categoryNames({ nameDe, nameEn });
  const parent = parentOf(db, parentId);
  return namedUniquely(names.de, () =>
    inTransaction(db, () => categoryView(db, insertCategory(db, { parentId: parent, nameDe: names.de, nameEn: names.en })))
  );
}

/**
 * Changes a category (design D10): renames it in both languages, moves it
 * under another parent - to the end of its new siblings, never under itself or
 * below it - or one place up or down among its siblings (`move`).
 */
export function updateCategory(db, id, input = {}) {
  const row = categoryRow(db, id);
  const names = input.nameDe === undefined && input.nameEn === undefined
    ? { de: row.name_de, en: row.name_en }
    : categoryNames({ nameDe: input.nameDe ?? row.name_de, nameEn: input.nameEn ?? row.name_en });
  const parent = input.parentId === undefined ? row.parent_id : parentOf(db, input.parentId);
  if (parent !== null && categoryAndBelow(db, id).has(parent)) {
    throw new InvalidInputError("exam.errors.pool.categoryMoveInto");
  }
  if (input.move !== undefined && input.move !== "up" && input.move !== "down") {
    throw new InvalidInputError("exam.errors.pool.categoryMoveDirection");
  }
  return namedUniquely(names.de, () =>
    inTransaction(db, () => {
      const moved = parent !== row.parent_id;
      db.prepare("UPDATE question_category SET name_de = ?, name_en = ?, parent_id = ?, position = ? WHERE id = ?").run(
        names.de,
        names.en,
        parent,
        moved ? endOfSiblings(db, parent) : row.position,
        id
      );
      if (input.move !== undefined && !moved) {
        const up = input.move === "up";
        const neighbour = db
          .prepare(
            `SELECT id, position FROM question_category
             WHERE COALESCE(parent_id, 0) = COALESCE(?, 0) AND position ${up ? "<" : ">"} ?
             ORDER BY position ${up ? "DESC" : "ASC"} LIMIT 1`
          )
          .get(parent, row.position);
        if (neighbour) {
          db.prepare("UPDATE question_category SET position = ? WHERE id = ?").run(neighbour.position, id);
          db.prepare("UPDATE question_category SET position = ? WHERE id = ?").run(row.position, neighbour.id);
        }
      }
      return categoryView(db, id);
    })
  );
}

/** Deletes a category that holds no question - retired ones included - and no subcategory. */
export function deleteCategory(db, id) {
  categoryRow(db, id);
  return inTransaction(db, () => {
    const questions = db.prepare("SELECT COUNT(*) AS n FROM question WHERE category_id = ?").get(id).n;
    const children = db.prepare("SELECT COUNT(*) AS n FROM question_category WHERE parent_id = ?").get(id).n;
    if (questions > 0 || children > 0) {
      const key =
        children === 0
          ? "exam.errors.pool.categoryHoldsQuestions"
          : questions === 0
            ? "exam.errors.pool.categoryHoldsSubcategories"
            : questions === 1
              ? children === 1
                ? "exam.errors.pool.categoryHoldsQuestionAndSubcategory"
                : "exam.errors.pool.categoryHoldsQuestionAndSubcategories"
              : children === 1
                ? "exam.errors.pool.categoryHoldsQuestionsAndSubcategory"
                : "exam.errors.pool.categoryHoldsQuestionsAndSubcategories";
      throw new ConflictError(key, { count: children === 0 ? questions : questions === 0 ? children : questions, questions, children });
    }
    db.prepare("DELETE FROM question_category WHERE id = ?").run(id);
    return { deleted: id };
  });
}
