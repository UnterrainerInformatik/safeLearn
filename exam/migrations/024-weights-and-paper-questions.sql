-- foreign_keys: off
-- Weights and tests on paper composed from the pool (pool-quickie design D1,
-- D2, D4).
--
-- `test_question` gains three columns:
--   weight        a whole number from 1 to 10 the question counts with in its
--                 test, 1 for every existing row, so every stored result stays
--                 as it is. From now on `attempt.question_count` holds the
--                 test's total weight at the attempt's start (its name stays).
--   handout_group the group of an offline test the question belongs to, 'A'
--                 for every online test. A question may be in both groups, so
--                 the uniqueness is per test and group.
--   answer_lines  the number of empty lines a printed sheet leaves under a
--                 `freetext` question, 1 to 40.
--
-- SQLite cannot change a UNIQUE in place, so `test_question` is rebuilt as in
-- 011 and 023: new table, rows copied with their ids, old table dropped, new
-- one renamed, triggers recreated. The runner does this with foreign keys off
-- and checks every reference before the commit.
--
-- `test.paper` marks an offline test composed from pool questions: it keeps
-- that kind when its last question goes from the pool, so that it refuses to
-- start instead of turning into an offline test with an editable column.
--
-- `question_grade` holds a teacher's grade from 1 to 5 per question of an
-- offline test and student. A retake writes over the same row; a change of
-- the student's group keeps it, since it belongs to the question.

-- Every trigger that reads `test_question` would keep it from being renamed.
DROP TRIGGER test_answer_closed_year_insert;
DROP TRIGGER test_answer_closed_year_update;
DROP TRIGGER test_answer_closed_year_delete;
DROP TRIGGER test_question_closed_year_insert;
DROP TRIGGER test_question_closed_year_update;
DROP TRIGGER test_question_closed_year_delete;

-- test_question: the columns of 023, the weight, the group and the answer lines.
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
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),
  handout_group TEXT NOT NULL DEFAULT 'A' CHECK (handout_group IN ('A', 'B')),
  answer_lines INTEGER NOT NULL DEFAULT 6 CHECK (answer_lines BETWEEN 1 AND 40),
  UNIQUE (test_id, handout_group, position),
  UNIQUE (test_id, handout_group, question_id),
  CHECK (CASE WHEN type = 'freetext' THEN solution_de IS NOT NULL AND solution_en IS NOT NULL
              ELSE solution_de IS NULL AND solution_en IS NULL END)
);
INSERT INTO new_test_question (id, test_id, question_id, position, type, name_de, name_en, text_de, text_en, solution_de, solution_en)
  SELECT id, test_id, question_id, position, type, name_de, name_en, text_de, text_en, solution_de, solution_en FROM test_question;
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
-- weight, the group and the answer lines are columns that have to stay.
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
    AND NEW.solution_de IS OLD.solution_de AND NEW.solution_en IS OLD.solution_en
    AND NEW.weight IS OLD.weight AND NEW.handout_group IS OLD.handout_group AND NEW.answer_lines IS OLD.answer_lines)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_question_closed_year_delete BEFORE DELETE ON test_question
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- test: an offline test composed from the pool
ALTER TABLE test ADD COLUMN paper INTEGER NOT NULL DEFAULT 0 CHECK (paper IN (0, 1) AND (paper = 0 OR (kind = 'offline' AND handout_a IS NULL)));

-- question_grade: a teacher's grade per question of an offline test and student
CREATE TABLE question_grade (
  test_question_id INTEGER NOT NULL REFERENCES test_question (id) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES student (username),
  grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 5),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (test_question_id, username)
);
CREATE INDEX question_grade_username ON question_grade (username);

-- question_grade: its year through test_question_id (test_question)
CREATE TRIGGER question_grade_closed_year_insert BEFORE INSERT ON question_grade
WHEN EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = NEW.test_question_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER question_grade_closed_year_update BEFORE UPDATE ON question_grade
WHEN EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = OLD.test_question_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = NEW.test_question_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER question_grade_closed_year_delete BEFORE DELETE ON question_grade
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = OLD.test_question_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
