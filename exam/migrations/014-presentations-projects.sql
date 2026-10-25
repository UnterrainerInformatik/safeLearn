-- foreign_keys: off
-- Presentations and projects as gradebook categories of their own
-- (`gradebook-sheet`, gradebook-presentations-projects design D1/D2/D3/D7):
-- the column kinds `presentation`, `project` and `projectmark`, a mark
-- column's project in `project_id`, a typed grade on a result, and the
-- weights `presentations` and `projects` on every course's config sheet.
-- Every column and result keeps its id and its values, so every proposal
-- stays what it was.

-- SQLite cannot change a CHECK in place, so `assessment` is rebuilt as in
-- 012-short-tests.sql: new table, rows copied with their ids, old table
-- dropped, new one renamed. The runner does this with foreign keys off and
-- checks every reference before the commit; `manual_entry` and `test` keep
-- referencing `assessment` by name.

-- The closed-year triggers of `manual_entry` read `assessment` and would keep
-- it from being renamed; they are recreated unchanged below.
DROP TRIGGER manual_entry_closed_year_insert;
DROP TRIGGER manual_entry_closed_year_update;
DROP TRIGGER manual_entry_closed_year_delete;

CREATE TABLE new_assessment (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course (id),
  kind TEXT NOT NULL CHECK (kind IN ('test', 'shorttest', 'plusminus', 'homework', 'presentation', 'project', 'projectmark')),
  name TEXT NOT NULL,
  held_on TEXT NOT NULL,                -- ISO date; decides the semester (a mark column follows its project's)
  max_points REAL CHECK (max_points IS NULL OR max_points > 0),
  created_at TEXT NOT NULL,
  -- A `projectmark` column's project; NULL for every other column.
  project_id INTEGER REFERENCES assessment (id),
  CHECK ((kind = 'projectmark') = (project_id IS NOT NULL))
);
INSERT INTO new_assessment (id, course_id, kind, name, held_on, max_points, created_at)
  SELECT id, course_id, kind, name, held_on, max_points, created_at FROM assessment;
DROP TABLE assessment;
ALTER TABLE new_assessment RENAME TO assessment;
CREATE INDEX assessment_course ON assessment (course_id, held_on);
CREATE INDEX assessment_project ON assessment (project_id);

-- The closed-year triggers of `assessment` (010-year-change.sql), dropped with
-- it, and those of `manual_entry`, all as before.

-- assessment: its year through course_id (course)
CREATE TRIGGER assessment_closed_year_insert BEFORE INSERT ON assessment
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER assessment_closed_year_update BEFORE UPDATE ON assessment
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER assessment_closed_year_delete BEFORE DELETE ON assessment
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- manual_entry: its year through assessment_id (assessment)
CREATE TRIGGER manual_entry_closed_year_insert BEFORE INSERT ON manual_entry
WHEN EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = NEW.assessment_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER manual_entry_closed_year_update BEFORE UPDATE ON manual_entry
WHEN EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = OLD.assessment_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = NEW.assessment_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER manual_entry_closed_year_delete BEFORE DELETE ON manual_entry
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = OLD.assessment_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- A presentation's or a project's result as the grade the teacher typed. Its
-- fraction is the grade's band midpoint on the scale as it is when read;
-- `value` keeps the midpoint at write time only to satisfy its NOT NULL.
ALTER TABLE manual_entry ADD COLUMN grade INTEGER CHECK (grade IS NULL OR grade BETWEEN 1 AND 5);

-- Presentations and projects start at 0 on every course, so the weights still
-- add up to 100 and no proposal moves. Every course stores all five earlier
-- weights since 012, so nothing else needs writing. That holds for the
-- courses of a closed year as well; their trigger is lifted for this one
-- statement and recreated as before, since nothing they show changes.
DROP TRIGGER course_closed_year_update;
UPDATE course SET weights = json_set(weights, '$.presentations', 0, '$.projects', 0);
CREATE TRIGGER course_closed_year_update BEFORE UPDATE ON course
WHEN EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = OLD.class_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = NEW.class_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
