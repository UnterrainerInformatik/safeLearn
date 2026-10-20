-- foreign_keys: off
-- Tests follow the pool until they begin (`online-test`, `question-editor`,
-- exam-questions-follow-pool design D5/D6): a question may now be deleted
-- although a test holds it. A begun test's copy lets go of the question
-- (`test_question.question_id` becomes NULL), its usage records go with it,
-- and its images outlive it as long as a test shows them.
--
-- SQLite cannot change a column's references in place, so the three tables
-- are rebuilt: new table, rows copied with their ids, old table dropped, new
-- one renamed, indexes and triggers recreated. The runner does this with
-- foreign keys off and checks every reference before the commit. No row
-- changes; every id another table references stays valid.

-- The closed-year triggers of `test_answer` read `test_question` and would
-- keep it from being renamed; they are recreated unchanged below.
DROP TRIGGER test_answer_closed_year_insert;
DROP TRIGGER test_answer_closed_year_update;
DROP TRIGGER test_answer_closed_year_delete;

-- image: the question it belongs to, NULL once that question is deleted.
-- UNIQUE (question_id, sha256) lets NULLs repeat.
CREATE TABLE new_image (
  id INTEGER PRIMARY KEY,
  question_id INTEGER REFERENCES question (id) ON DELETE SET NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  sha256 TEXT NOT NULL,
  data BLOB NOT NULL,
  UNIQUE (question_id, sha256)
);
INSERT INTO new_image (id, question_id, mime, sha256, data)
  SELECT id, question_id, mime, sha256, data FROM image;
DROP TABLE image;
ALTER TABLE new_image RENAME TO image;

-- test_question: the pool question a copy was taken from, NULL once that
-- question is deleted. Only a begun test keeps such a row.
CREATE TABLE new_test_question (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES test (id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES question (id) ON DELETE SET NULL,
  position INTEGER NOT NULL,            -- the order the teacher chose; each attempt shuffles it
  type TEXT NOT NULL CHECK (type IN ('multichoiceset', 'multichoice', 'truefalse')),
  name_de TEXT NOT NULL,
  name_en TEXT NOT NULL,
  text_de TEXT NOT NULL,                -- sanitized HTML, as the pool held it
  text_en TEXT NOT NULL,
  UNIQUE (test_id, position),
  UNIQUE (test_id, question_id)
);
INSERT INTO new_test_question (id, test_id, question_id, position, type, name_de, name_en, text_de, text_en)
  SELECT id, test_id, question_id, position, type, name_de, name_en, text_de, text_en FROM test_question;
DROP TABLE test_question;
ALTER TABLE new_test_question RENAME TO test_question;

-- question_usage: goes with its question.
CREATE TABLE new_question_usage (
  question_id INTEGER NOT NULL REFERENCES question (id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES test (id),
  course_id INTEGER NOT NULL REFERENCES course (id),
  used_on TEXT NOT NULL,                -- ISO date of the test
  PRIMARY KEY (question_id, test_id)
);
INSERT INTO new_question_usage (question_id, test_id, course_id, used_on)
  SELECT question_id, test_id, course_id, used_on FROM question_usage;
DROP TABLE question_usage;
ALTER TABLE new_question_usage RENAME TO question_usage;
CREATE INDEX question_usage_course ON question_usage (course_id);

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

-- The closed-year triggers of the two rebuilt tables that belong to a year
-- (010-year-change.sql), dropped with them. Each is as before, with one
-- exception for deleting a pool question (design D6): in a closed year, a
-- copy may let go of a question that no longer exists - nothing else of the
-- row changes - and a usage record may go with its deleted question. What
-- the closed year's students wrote and were graded by stays untouched.

-- test_question: its year through test_id (test)
CREATE TRIGGER test_question_closed_year_insert BEFORE INSERT ON test_question
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_question_closed_year_update BEFORE UPDATE ON test_question
WHEN (EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL))
  AND NOT (OLD.question_id IS NOT NULL AND NEW.question_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM question q WHERE q.id = OLD.question_id)
    AND NEW.id IS OLD.id AND NEW.test_id IS OLD.test_id AND NEW.position IS OLD.position AND NEW.type IS OLD.type
    AND NEW.name_de IS OLD.name_de AND NEW.name_en IS OLD.name_en AND NEW.text_de IS OLD.text_de AND NEW.text_en IS OLD.text_en)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_question_closed_year_delete BEFORE DELETE ON test_question
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- question_usage: its year through course_id (course)
CREATE TRIGGER question_usage_closed_year_insert BEFORE INSERT ON question_usage
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER question_usage_closed_year_update BEFORE UPDATE ON question_usage
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER question_usage_closed_year_delete BEFORE DELETE ON question_usage
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM question q WHERE q.id = OLD.question_id)
  AND EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
