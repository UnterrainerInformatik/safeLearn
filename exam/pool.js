/**
 * The question pool as teachers read it (`question-pool`): the category tree,
 * a text search, one question with its correct answers and its usage history,
 * and the images the questions embed. Everything here is a teacher's; the only
 * other reader of an image is a student inside an open attempt containing it,
 * which `studentMaySeeImage` decides.
 *
 * Reads are synchronous, like every other read of the module (design.md, D2).
 * The pool is about a hundred questions, so the search filters in process
 * rather than through an index.
 */

import { NotFoundError } from "./classes.js";

const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** The words of a stored text, without its markup, for searching. */
export function plainText(html) {
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => entities[entity])
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The tree, as nested nodes in their stored order: each with both names, its
 * children, and how many questions it holds - `questions` directly, `total`
 * with every category below it. Retired questions are not counted.
 */
export function categoryTree(db) {
  const rows = db
    .prepare(
      `SELECT c.id, c.parent_id AS parentId, c.name_de AS nameDe, c.name_en AS nameEn,
         (SELECT COUNT(*) FROM question q WHERE q.category_id = c.id AND q.retired = 0) AS questions
       FROM question_category c ORDER BY c.position, c.id`
    )
    .all();
  const nodes = new Map(rows.map((row) => [row.id, { ...row, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    if (node.parentId === null) roots.push(node);
    else nodes.get(node.parentId)?.children.push(node);
  }
  const total = (node) => (node.total = node.questions + node.children.reduce((sum, child) => sum + total(child), 0));
  roots.forEach(total);
  return roots;
}

/** The ids of `categoryId` and every category below it. */
function categoryAndBelow(db, categoryId) {
  return new Set(
    db
      .prepare(
        `WITH RECURSIVE below (id) AS (
           SELECT id FROM question_category WHERE id = ?
           UNION ALL SELECT c.id FROM question_category c JOIN below b ON c.parent_id = b.id
         ) SELECT id FROM below`
      )
      .all(categoryId)
      .map((row) => row.id)
  );
}

/** Each category's path from the root, in both languages, by id. */
function categoryPaths(db) {
  const rows = db.prepare("SELECT id, parent_id AS parentId, name_de AS nameDe, name_en AS nameEn FROM question_category").all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const paths = new Map();
  const pathOf = (id) => {
    if (paths.has(id)) return paths.get(id);
    const row = byId.get(id);
    const parent = row.parentId === null ? { de: [], en: [] } : pathOf(row.parentId);
    const path = { de: [...parent.de, row.nameDe], en: [...parent.en, row.nameEn] };
    paths.set(id, path);
    return path;
  };
  for (const row of rows) pathOf(row.id);
  return paths;
}

/**
 * The questions of a category and everything below it - all of them without
 * `categoryId` - whose name, text or answers contain `query` in either
 * language, ignoring case. Retired questions only with `includeRetired`. Each
 * comes with its category's path and how often and when it was last used, so
 * the list can be read while choosing questions for a test.
 */
export function listQuestions(db, { categoryId = null, query = "", includeRetired = false } = {}) {
  const inCategory = categoryId === null ? null : categoryAndBelow(db, categoryId);
  if (inCategory !== null && inCategory.size === 0) throw new NotFoundError("There is no such category.");
  const paths = categoryPaths(db);
  const needle = String(query ?? "").trim().toLowerCase();
  const answers = new Map();
  for (const row of db.prepare("SELECT question_id AS id, text_de AS de, text_en AS en FROM answer").all()) {
    answers.set(row.id, `${answers.get(row.id) ?? ""} ${row.de} ${row.en}`);
  }
  return db
    .prepare(
      `SELECT q.id, q.category_id AS categoryId, q.type, q.name_de AS nameDe, q.name_en AS nameEn,
         q.text_de AS textDe, q.text_en AS textEn, q.retired,
         (SELECT COUNT(*) FROM answer a WHERE a.question_id = q.id) AS answers,
         (SELECT COUNT(*) FROM question_usage u WHERE u.question_id = q.id) AS uses,
         (SELECT MAX(used_on) FROM question_usage u WHERE u.question_id = q.id) AS lastUsedOn
       FROM question q
       JOIN question_category c ON c.id = q.category_id
       ORDER BY c.position, c.id, q.position, q.id`
    )
    .all()
    .filter((row) => includeRetired || row.retired === 0)
    .filter((row) => inCategory === null || inCategory.has(row.categoryId))
    .filter(
      (row) =>
        needle === "" ||
        plainText(`${row.nameDe} ${row.nameEn} ${row.textDe} ${row.textEn} ${answers.get(row.id) ?? ""}`)
          .toLowerCase()
          .includes(needle)
    )
    .map(({ textDe, textEn, retired, ...row }) => ({
      ...row,
      retired: retired === 1,
      category: paths.get(row.categoryId),
      excerptDe: plainText(textDe).slice(0, 160),
      excerptEn: plainText(textEn).slice(0, 160),
    }));
}

/**
 * One question as the preview shows it: both languages, every answer in its
 * original order with its correct flag, the category's path, and each test it
 * was used in, with course and date.
 */
export function getQuestion(db, id) {
  const row = db
    .prepare(
      `SELECT id, category_id AS categoryId, type, name_de AS nameDe, name_en AS nameEn,
         text_de AS textDe, text_en AS textEn, retired
       FROM question WHERE id = ?`
    )
    .get(id);
  if (!row) throw new NotFoundError("There is no such question.");
  const answers = db
    .prepare("SELECT position, text_de AS textDe, text_en AS textEn, correct FROM answer WHERE question_id = ? ORDER BY position")
    .all(id)
    .map((answer) => ({ ...answer, correct: answer.correct === 1 }));
  const usage = db
    .prepare(
      `SELECT u.test_id AS testId, u.used_on AS usedOn, co.id AS courseId, co.subject,
         cl.name AS className, y.name AS yearName
       FROM question_usage u
       JOIN course co ON co.id = u.course_id
       JOIN class cl ON cl.id = co.class_id
       JOIN school_year y ON y.id = cl.school_year_id
       WHERE u.question_id = ?
       ORDER BY u.used_on, u.test_id`
    )
    .all(id);
  return {
    ...row,
    retired: row.retired === 1,
    category: categoryPaths(db).get(row.categoryId),
    answers,
    usage,
    uses: usage.length,
  };
}

/** A stored image with the question it belongs to, or null. */
export function readImage(db, id) {
  return db.prepare("SELECT question_id AS questionId, mime, data FROM image WHERE id = ?").get(id) ?? null;
}

/**
 * Whether the student `username` may see `image` because it belongs to a
 * question of an attempt they have open. Attempts arrive with the online
 * tests (P3, tasks 5.4 and 5.5); until then no student is inside one, and the
 * answer is no.
 */
export function studentMaySeeImage(db, username, image) {
  return false;
}
