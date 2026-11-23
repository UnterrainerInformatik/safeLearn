-- foreign_keys: off
-- Free-text questions (`question-pool`, freetext-questions design D1): a
-- fourth type `freetext` with a model solution in German and English and no
-- answers. The model solution is two columns on the question and on its
-- snapshot in a test, sanitized HTML, both present for `freetext` and both
-- NULL for every other type.
--
-- SQLite cannot change a CHECK in place, so `question` and `test_question`
-- are rebuilt as in 011: new table, rows copied with their ids, old table
-- dropped, new one renamed, indexes and triggers recreated. The runner does
-- this with foreign keys off and checks every reference before the commit.
-- Every existing row keeps its type and gets no model solution.

-- Every trigger that reads `question` or `test_question` would keep them from
-- being renamed; all are recreated below, the one of `test_question` that
-- compares its columns extended by the model solution.
DROP TRIGGER test_answer_closed_year_insert;
DROP TRIGGER test_answer_closed_year_update;
DROP TRIGGER test_answer_closed_year_delete;
DROP TRIGGER test_question_closed_year_insert;
DROP TRIGGER test_question_closed_year_update;
DROP TRIGGER test_question_closed_year_delete;
DROP TRIGGER question_usage_closed_year_delete;

-- question: the columns of 005, 007 and 008, and the model solution.
CREATE TABLE new_question (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES question_category (id),
  type TEXT NOT NULL CHECK (type IN ('multichoiceset', 'multichoice', 'truefalse', 'freetext')),
  name_de TEXT NOT NULL,                -- the short title
  name_en TEXT NOT NULL,
  text_de TEXT NOT NULL,                -- sanitized HTML
  text_en TEXT NOT NULL,
  solution_de TEXT,                     -- sanitized HTML, the model solution of a `freetext` question
  solution_en TEXT,
  position INTEGER NOT NULL,            -- order within its category
  retired INTEGER NOT NULL DEFAULT 0 CHECK (retired IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  import_id INTEGER REFERENCES question_import (id),
  unreviewed INTEGER NOT NULL DEFAULT 0 CHECK (unreviewed IN (0, 1)),
  CHECK (CASE WHEN type = 'freetext' THEN solution_de IS NOT NULL AND solution_en IS NOT NULL
              ELSE solution_de IS NULL AND solution_en IS NULL END)
);
INSERT INTO new_question (id, category_id, type, name_de, name_en, text_de, text_en, position, retired, created_at, updated_at, version, import_id, unreviewed)
  SELECT id, category_id, type, name_de, name_en, text_de, text_en, position, retired, created_at, updated_at, version, import_id, unreviewed FROM question;
DROP TABLE question;
ALTER TABLE new_question RENAME TO question;
CREATE INDEX question_category_position ON question (category_id, position);
CREATE INDEX question_unreviewed ON question (unreviewed) WHERE unreviewed = 1;

-- test_question: the columns of 011, and the model solution as the pool held it.
CREATE TABLE new_test_question (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES test (id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES question (id) ON DELETE SET NULL,
  position INTEGER NOT NULL,            -- the order the teacher chose; each attempt shuffles it
  type TEXT NOT NULL CHECK (type IN ('multichoiceset', 'multichoice', 'truefalse', 'freetext')),
  name_de TEXT NOT NULL,
  name_en TEXT NOT NULL,
  text_de TEXT NOT NULL,                -- sanitized HTML, as the pool held it
  text_en TEXT NOT NULL,
  solution_de TEXT,                     -- sanitized HTML, as the pool held it
  solution_en TEXT,
  UNIQUE (test_id, position),
  UNIQUE (test_id, question_id),
  CHECK (CASE WHEN type = 'freetext' THEN solution_de IS NOT NULL AND solution_en IS NOT NULL
              ELSE solution_de IS NULL AND solution_en IS NULL END)
);
INSERT INTO new_test_question (id, test_id, question_id, position, type, name_de, name_en, text_de, text_en)
  SELECT id, test_id, question_id, position, type, name_de, name_en, text_de, text_en FROM test_question;
DROP TABLE test_question;
ALTER TABLE new_test_question RENAME TO test_question;

-- test_answer: its year through test_question_id (test_question), as in 010
CREATE TRIGGER test_answer_closed_year_insert BEFORE INSERT ON test_answer
WHEN EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = NEW.test_question_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_answer_closed_year_update BEFORE UPDATE ON test_answer
WHEN EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = OLD.test_question_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = NEW.test_question_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_answer_closed_year_delete BEFORE DELETE ON test_answer
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = OLD.test_question_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- test_question: its year through test_id (test), as in 011. In a closed
-- year, a copy may still let go of a deleted question and nothing else; the
-- model solution is one of the columns that has to stay.
CREATE TRIGGER test_question_closed_year_insert BEFORE INSERT ON test_question
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_question_closed_year_update BEFORE UPDATE ON test_question
WHEN (EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL))
  AND NOT (OLD.question_id IS NOT NULL AND NEW.question_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM question q WHERE q.id = OLD.question_id)
    AND NEW.id IS OLD.id AND NEW.test_id IS OLD.test_id AND NEW.position IS OLD.position AND NEW.type IS OLD.type
    AND NEW.name_de IS OLD.name_de AND NEW.name_en IS OLD.name_en AND NEW.text_de IS OLD.text_de AND NEW.text_en IS OLD.text_en
    AND NEW.solution_de IS OLD.solution_de AND NEW.solution_en IS OLD.solution_en)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_question_closed_year_delete BEFORE DELETE ON test_question
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- question_usage: a usage record may go with its deleted question, as in 011
CREATE TRIGGER question_usage_closed_year_delete BEFORE DELETE ON question_usage
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM question q WHERE q.id = OLD.question_id)
  AND EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
