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
import { pendingTestsWith } from "./tests.js";

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
 * with every category below it. Retired questions are not counted there;
 * `empty` says whether it holds nothing at all, retired questions included,
 * which is when it can be deleted.
 */
export function categoryTree(db) {
  const rows = db
    .prepare(
      `SELECT c.id, c.parent_id AS parentId, c.name_de AS nameDe, c.name_en AS nameEn,
         (SELECT COUNT(*) FROM question q WHERE q.category_id = c.id AND q.retired = 0) AS questions,
         NOT EXISTS (SELECT 1 FROM question q WHERE q.category_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM question_category k WHERE k.parent_id = c.id) AS empty
       FROM question_category c ORDER BY c.position, c.id`
    )
    .all();
  const nodes = new Map(rows.map((row) => [row.id, { ...row, empty: row.empty === 1, children: [] }]));
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
export function categoryAndBelow(db, categoryId) {
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

/** Where an imported question came from; all null for any other. */
const importColumns = "i.imported_at AS importedAt, i.imported_by AS importedBy, i.file_name AS importFileName";

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
 * language, ignoring case. Retired questions only with `includeRetired`, and
 * only those not reviewed yet with `onlyUnreviewed`. Each comes with its
 * category's path, how often and when it was last used, so the list can be
 * read while choosing questions for a test, and where it was imported from.
 */
export function listQuestions(db, { categoryId = null, query = "", includeRetired = false, onlyUnreviewed = false } = {}) {
  const inCategory = categoryId === null ? null : categoryAndBelow(db, categoryId);
  if (inCategory !== null && inCategory.size === 0) throw new NotFoundError("exam.errors.pool.noCategory");
  const paths = categoryPaths(db);
  const needle = String(query ?? "").trim().toLowerCase();
  const answers = new Map();
  for (const row of db.prepare("SELECT question_id AS id, text_de AS de, text_en AS en FROM answer").all()) {
    answers.set(row.id, `${answers.get(row.id) ?? ""} ${row.de} ${row.en}`);
  }
  return db
    .prepare(
      `SELECT q.id, q.category_id AS categoryId, q.type, q.name_de AS nameDe, q.name_en AS nameEn,
         q.text_de AS textDe, q.text_en AS textEn, q.retired, q.unreviewed, ${importColumns},
         (SELECT COUNT(*) FROM answer a WHERE a.question_id = q.id) AS answers,
         (SELECT COUNT(*) FROM question_usage u WHERE u.question_id = q.id) AS uses,
         (SELECT MAX(used_on) FROM question_usage u WHERE u.question_id = q.id) AS lastUsedOn
       FROM question q
       JOIN question_category c ON c.id = q.category_id
       LEFT JOIN question_import i ON i.id = q.import_id
       ORDER BY c.position, c.id, q.position, q.id`
    )
    .all()
    .filter((row) => includeRetired || row.retired === 0)
    .filter((row) => !onlyUnreviewed || row.unreviewed === 1)
    .filter((row) => inCategory === null || inCategory.has(row.categoryId))
    .filter(
      (row) =>
        needle === "" ||
        plainText(`${row.nameDe} ${row.nameEn} ${row.textDe} ${row.textEn} ${answers.get(row.id) ?? ""}`)
          .toLowerCase()
          .includes(needle)
    )
    .map(({ textDe, textEn, retired, unreviewed, ...row }) => ({
      ...row,
      retired: retired === 1,
      unreviewed: unreviewed === 1,
      category: paths.get(row.categoryId),
      excerptDe: plainText(textDe).slice(0, 160),
      excerptEn: plainText(textEn).slice(0, 160),
    }));
}

/**
 * One question as the preview and the editor show it: both languages, every
 * answer in its original order with its correct flag, the category's path,
 * each test that holds it, planned or written, with course and date, the
 * tests not yet begun that a save changes and a deletion takes it out of
 * (exam-questions-follow-pool design D7), the version a save has to name
 * (exam-question-editor design D7), and for an imported question when, by
 * whom and from which file (exam-question-import design D7).
 */
export function getQuestion(db, id) {
  const row = db
    .prepare(
      `SELECT q.id, q.category_id AS categoryId, q.type, q.name_de AS nameDe, q.name_en AS nameEn,
         q.text_de AS textDe, q.text_en AS textEn, q.retired, q.version, q.unreviewed, ${importColumns}
       FROM question q LEFT JOIN question_import i ON i.id = q.import_id WHERE q.id = ?`
    )
    .get(id);
  if (!row) throw new NotFoundError("exam.errors.pool.noQuestion");
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
    unreviewed: row.unreviewed === 1,
    category: categoryPaths(db).get(row.categoryId),
    answers,
    usage,
    uses: usage.length,
    pendingTests: pendingTestsWith(db, id),
  };
}

/** A stored image with the question it belongs to, or null. */
export function readImage(db, id) {
  return db.prepare("SELECT id, question_id AS questionId, mime, data FROM image WHERE id = ?").get(id) ?? null;
}

/**
 * Whether the student `username` may see the image `imageId` because the test
 * of an attempt they have open right now shows it. Once the attempt is
 * submitted or past its deadline, the answer is no.
 */
export function studentMaySeeImage(db, username, imageId, at = new Date().toISOString()) {
  return (
    db
      .prepare(
        `SELECT 1 FROM attempt a JOIN test_image ti ON ti.test_id = a.test_id
         WHERE a.username = ? AND ti.image_id = ? AND a.submitted_at IS NULL AND ? < a.deadline LIMIT 1`
      )
      .get(username, imageId, at) !== undefined
  );
}
