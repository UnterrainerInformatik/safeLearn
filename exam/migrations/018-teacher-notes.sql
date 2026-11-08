-- A teacher's note on a participant in the live view (`online-test`,
-- "Teachers note participants in the live view", exam-live-teacher-notes
-- design D1): one per student and test, not per sitting, so it exists before
-- the start, in an offline sitting without an attempt, and follows the
-- student into a make-up sitting. Its own table rather than a flag on
-- `result_note`: the cell note is shown to the student, and a table no
-- student query reads can never leak through a wrong filter. Only adds;
-- nothing is rebuilt, and nothing that grades reads this table.

CREATE TABLE teacher_note (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES test (id),
  username TEXT NOT NULL REFERENCES student (username),
  -- `length()` counts characters, so this is the spec's 4000 characters.
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (test_id, username)
);
-- The retention purge counts and deletes by student.
CREATE INDEX teacher_note_username ON teacher_note (username);

-- teacher_note: its year through test_id, as 010-year-change.sql asks of
-- every table with a path to `school_year`.
CREATE TRIGGER teacher_note_closed_year_insert BEFORE INSERT ON teacher_note
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER teacher_note_closed_year_update BEFORE UPDATE ON teacher_note
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER teacher_note_closed_year_delete BEFORE DELETE ON teacher_note
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
