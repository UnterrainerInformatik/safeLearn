/**
 * A teacher's note on a participant (`online-test`, "Teachers note
 * participants in the live view"; exam-live-teacher-notes design D1/D2): free
 * text of one student in one test, written and read in the live view of any
 * of the test's sittings. Teachers only - no student route reads this table,
 * and it is kept apart from the cell note of the sheet (`result_note`), which
 * the student sees. It counts in nothing: no order, status, colour or grade
 * reads it.
 *
 * Plain SQL over the module's database, synchronous like `DatabaseSync`. A
 * closed year refuses the write through the triggers of migration 018.
 */

import { InvalidInputError, NotFoundError, now } from "./classes.js";

/** The longest teacher note, in characters, as long as a cell note. */
export const teacherNoteMaxLength = 4000;

function testRow(db, testId) {
  const test = db.prepare("SELECT id FROM test WHERE id = ?").get(testId);
  if (!test) throw new NotFoundError("exam.errors.tests.noTest");
  return test;
}

/** The username as stored, if the student takes part in a sitting of the test; otherwise not found. */
function participantOf(db, testId, username) {
  const row = db
    .prepare(
      `SELECT p.username FROM sitting_participant p JOIN sitting s ON s.id = p.sitting_id
       WHERE s.test_id = ? AND p.username = ? LIMIT 1`
    )
    .get(testId, typeof username === "string" ? username.toLowerCase() : "");
  if (!row) throw new NotFoundError("exam.errors.tests.notTestParticipant");
  return row.username;
}

/**
 * Whether the schema has teacher notes yet (migration 018): a database
 * migrated only part of the way, as the migration checks do, reads as one
 * without notes.
 */
function hasTeacherNotes(db) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'teacher_note'").get());
}

/** The teacher note of one student in one test, or null. */
export function teacherNoteOf(db, testId, username) {
  if (!hasTeacherNotes(db)) return null;
  return db.prepare("SELECT text FROM teacher_note WHERE test_id = ? AND username = ?").get(testId, username)?.text ?? null;
}

/** Every teacher note of a test, by username. */
export function teacherNotesOf(db, testId) {
  if (!hasTeacherNotes(db)) return new Map();
  return new Map(db.prepare("SELECT username, text FROM teacher_note WHERE test_id = ?").all(testId).map((row) => [row.username, row.text]));
}

/**
 * Sets the teacher note of `username` in test `testId`, replacing the one
 * there was. The text is stored as typed, line endings as `\n`; one that is
 * empty or white space only removes the note, so the live view can always
 * send what its field holds. A text over the limit is refused and the stored
 * note stays. Answers `{ username, teacherNote }`, the note null once removed.
 */
export function setTeacherNote(db, testId, username, text) {
  testRow(db, testId);
  const student = participantOf(db, testId, username);
  if (text !== null && text !== undefined && typeof text !== "string") throw new InvalidInputError("exam.errors.gradebook.noteText");
  const normalized = (text ?? "").replace(/\r\n?/g, "\n");
  if (!normalized.trim()) {
    db.prepare("DELETE FROM teacher_note WHERE test_id = ? AND username = ?").run(testId, student);
  } else {
    if ([...normalized].length > teacherNoteMaxLength) throw new InvalidInputError("exam.errors.gradebook.noteTooLong", { max: teacherNoteMaxLength });
    const stamp = now();
    db.prepare(
      `INSERT INTO teacher_note (test_id, username, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (test_id, username) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`
    ).run(testId, student, normalized, stamp, stamp);
  }
  return { username: student, teacherNote: teacherNoteOf(db, testId, student) };
}

/** The ids of the test's sittings, whose live views hear of a changed note. */
export function sittingsOfTest(db, testId) {
  return db.prepare("SELECT id FROM sitting WHERE test_id = ?").all(testId).map((row) => row.id);
}
