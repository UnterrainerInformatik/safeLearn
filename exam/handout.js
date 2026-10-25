/**
 * The handouts of offline tests (`exam-handout`, exam-offline-sittings design
 * D5-D7): a corpus Markdown file a test names by its path, which resolves or
 * shows in red, the corpus list the teacher's picker is built from, who may be
 * served a handout right now, and which attachments that makes servable.
 *
 * "Who may see the handout now" is answered from the database at every
 * request - open, participant, present, group, resolving path - so a change of
 * attendance, group or window needs no invalidation. The rendering itself is
 * `app.js`'s `renderHandout`, handed to the module at start-up.
 */

import fs from "node:fs";

import {
  getActivePermissionRoles,
  handoutReferencesVisibly,
  mdFilesDir,
  mdFilesDirStructure,
  normalizeCorpusPath,
} from "../obsidian.js";
import { handoutViews, normalizeRole } from "../permission-context.js";
import { InvalidInputError, now } from "./classes.js";

/** The handout groups, in the order the attendance table offers them. */
export const handoutGroups = Object.freeze(["A", "B"]);

/**
 * A handout's corpus path as the test stores it: relative to `md/`,
 * normalized, a Markdown file. Anything else is refused.
 */
export function handoutPath(value) {
  const normalized = typeof value === "string" ? normalizeCorpusPath(value.trim().replace(/^md\//, "")) : null;
  if (normalized === null || !normalized.toLowerCase().endsWith(".md")) throw new InvalidInputError("exam.errors.handouts.path");
  return normalized;
}

/** Whether a Markdown file of the corpus exists at `corpusPath` right now. */
export function handoutResolves(corpusPath) {
  return typeof corpusPath === "string" && Object.hasOwn(mdFilesDir, corpusPath);
}

/**
 * Whether the raw file holds a `@@@` directive naming `#answer`: the textual
 * check behind the solution button. A false positive only shows a deck
 * without answers.
 */
export function hasAnswers(corpusPath) {
  if (!handoutResolves(corpusPath)) return false;
  try {
    return /@@@[^\n]*#answer\b/i.test(fs.readFileSync(mdFilesDirStructure[corpusPath].absolutePath, "utf8"));
  } catch {
    return false;
  }
}

/** The handouts of a test row, A first: each with its path and whether it resolves. */
export function handoutsOf(test) {
  return [
    ["A", test.handout_a],
    ["B", test.handout_b],
  ]
    .filter(([, corpusPath]) => corpusPath !== null && corpusPath !== undefined)
    .map(([group, corpusPath]) => ({ group, path: corpusPath, resolves: handoutResolves(corpusPath), hasAnswers: hasAnswers(corpusPath) }));
}

/**
 * Whether a student of the class `className` can read the file under its own
 * whole-file directive: no directive, or one naming the class, `student` or
 * `students` with an open window. A warning for the picker, not a guarantee -
 * a person's own name and other roles are not looked at.
 */
function readableByClass(permissions, className) {
  if (permissions === null || permissions === undefined) return true;
  const readers = new Set([normalizeRole(className), "student", "students"]);
  return getActivePermissionRoles(permissions).some((role) => readers.has(normalizeRole(role)));
}

/**
 * Every Markdown file of the corpus for the teacher's picker: its path, its
 * folder and name, and whether the class can read it already. The tree and
 * the search are built on the client.
 */
export function corpusFiles(className) {
  return Object.values(mdFilesDirStructure).map((file) => ({
    path: file.path,
    folder: file.folders,
    name: file.fileName,
    classReadable: readableByClass(file.permissions, className),
  }));
}

/** The path a participant in `group` is served, of a test with these handouts, or null. */
function pathFor(row, group) {
  if (row.handout_a === null) return null;
  return group === "B" && row.handout_b !== null ? row.handout_b : row.handout_a;
}

const servableSelect = `SELECT s.id AS sittingId, t.id AS testId, t.name, t.handout_a, t.handout_b, p.handout_group
  FROM sitting_participant p
  JOIN sitting s ON s.id = p.sitting_id
  JOIN test t ON t.id = s.test_id
  WHERE p.username = ? AND t.kind = 'offline' AND s.started_at IS NOT NULL
    AND s.opens_at <= ? AND ? < s.closes_at AND p.present = 1`;

/**
 * The handout `username` may be served in sitting `sittingId` at `at`, as
 * `{ path, group, testId, name, closesAt }`, or null: the sitting is an
 * offline sitting, started and open, they take part in it, are marked
 * present, and the path of their group resolves. The one authorization of
 * the student's handout route (design D6).
 */
export function servableHandout(db, username, sittingId, at = now()) {
  if (typeof username !== "string") return null;
  const row = db.prepare(`${servableSelect} AND s.id = ?`).get(username, at, at, sittingId);
  if (!row) return null;
  const corpusPath = pathFor(row, row.handout_group);
  if (!handoutResolves(corpusPath)) return null;
  return { path: corpusPath, group: row.handout_b === null ? "A" : row.handout_group, testId: row.testId, name: row.name };
}

/** Every handout path `username` may be served right now, across their open offline sittings. */
function servableHandoutPaths(db, username, at = now()) {
  const paths = db
    .prepare(servableSelect)
    .all(username, at, at)
    .map((row) => pathFor(row, row.handout_group))
    .filter(handoutResolves);
  return [...new Set(paths)];
}

/** Every handout path any test names that resolves: what a teacher's previews and decks show. */
function everyHandoutPath(db) {
  const paths = db
    .prepare("SELECT handout_a AS path FROM test WHERE handout_a IS NOT NULL UNION SELECT handout_b FROM test WHERE handout_b IS NOT NULL")
    .all()
    .map((row) => row.path)
    .filter(handoutResolves);
  return [...new Set(paths)];
}

/**
 * The attachment gate's question to the module (design D7): whether a handout
 * open to this session references `attachment` in a place it may see, under
 * the views the handout rendering fixes. A participant's are the handouts
 * `servableHandout` would answer them right now, without the answers; a
 * teacher's are every handout of a test, with the answers, as the previews
 * and solution decks show them. Nothing is kept: the next request asks again.
 */
export async function handoutAttachmentCheck(db, req, attachment, { username, teacher }) {
  if (typeof username !== "string") return false;
  const paths = teacher ? everyHandoutPath(db) : servableHandoutPaths(db, username);
  if (paths.length === 0) return false;
  req[handoutViews] = { answer: teacher };
  try {
    // One after the other: the views sit on the request they decide.
    for (const corpusPath of paths) {
      if (await handoutReferencesVisibly(req, corpusPath, attachment)) return true;
    }
    return false;
  } finally {
    delete req[handoutViews];
  }
}
