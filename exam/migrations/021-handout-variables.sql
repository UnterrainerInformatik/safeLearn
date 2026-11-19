-- The values of an offline test's handout variables `%%var NAME%%`
-- (`exam-handout`, offline-handout-variables design D3): one list per test,
-- shared by handouts A and B. An empty value is no row. `CLASS` and `DATE`
-- are computed by the module and never stored. A row whose name no longer
-- appears in a handout is kept, so the value comes back with the variable.
-- Only adds a table, so every existing test behaves as before.
CREATE TABLE test_variable (
  test_id INTEGER NOT NULL REFERENCES test (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name GLOB '[A-Z]*' AND name NOT GLOB '*[^A-Z0-9_]*'),
  value TEXT NOT NULL CHECK (value <> ''),
  PRIMARY KEY (test_id, name)
);

-- test_variable: its year through test_id, as 010-year-change.sql asks of
-- every table with a path to `school_year`.
CREATE TRIGGER test_variable_closed_year_insert BEFORE INSERT ON test_variable
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_variable_closed_year_update BEFORE UPDATE ON test_variable
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_variable_closed_year_delete BEFORE DELETE ON test_variable
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
