/**
 * Fixtures the exam module's checks share. Not a check itself: its name does
 * not end in `.test.js`, so the runner loads it only through an import.
 */

/**
 * Enters `username` - by default `tdent`, the teacher the route checks ask as
 * - in the class `classId` (`class-teachers`), straight in the database: a
 * teacher sees only the classes they are entered in, and the route checks are
 * about something else. On a database at a schema before the teachers' list
 * there is nothing to enter, and nothing is.
 */
export function enterTeacher(db, classId, username = "tdent") {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'class_teacher'").get()) return;
  db.prepare("INSERT OR IGNORE INTO class_teacher (class_id, username) VALUES (?, ?)").run(classId, username);
}
