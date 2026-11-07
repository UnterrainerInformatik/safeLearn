-- A note per cell of the sheet (`gradebook-sheet`, gradebook-result-notes
-- design D1): one student in one column, where the column is either a manual
-- column (`assessment_id`) or an online test (`test_id`), never both. A note
-- lives beside the result, not inside it, so a cell can hold a note without a
-- value and `manual_entry` keeps its rule that a row is a result. Only adds;
-- nothing is rebuilt, and no proposal reads this table.

CREATE TABLE result_note (
  id INTEGER PRIMARY KEY,
  assessment_id INTEGER REFERENCES assessment (id),
  test_id INTEGER REFERENCES test (id),
  username TEXT NOT NULL REFERENCES student (username),
  -- `length()` counts characters, so this is the spec's 4000 characters.
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((assessment_id IS NULL) <> (test_id IS NULL))
);
-- At most one note per cell, for each kind of column.
CREATE UNIQUE INDEX result_note_assessment ON result_note (assessment_id, username) WHERE assessment_id IS NOT NULL;
CREATE UNIQUE INDEX result_note_test ON result_note (test_id, username) WHERE test_id IS NOT NULL;
-- The retention purge counts and deletes by student.
CREATE INDEX result_note_username ON result_note (username);

-- result_note: its year through assessment_id (assessment) or test_id (test),
-- as 010-year-change.sql asks of every table with a path to `school_year`.
CREATE TRIGGER result_note_closed_year_insert BEFORE INSERT ON result_note
WHEN EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = NEW.assessment_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER result_note_closed_year_update BEFORE UPDATE ON result_note
WHEN EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = OLD.assessment_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = NEW.assessment_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER result_note_closed_year_delete BEFORE DELETE ON result_note
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND (EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = OLD.assessment_id AND y.closed_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
