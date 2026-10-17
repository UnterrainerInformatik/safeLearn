-- The gradebook as a sheet (`gradebook-sheet`, `year-grade`). A result now
-- belongs to a column - an `assessment` with its kind, name, date and maximum -
-- instead of carrying those itself, and a student has at most one result per
-- column. A course gets the winter semester's share in the year grade.

-- A column of a course's sheet. `kind` decides the category as before, and
-- `held_on` the semester of every result in it. Without `max_points` a test or
-- homework column takes its results in percent; a participation column never
-- has one.
CREATE TABLE assessment (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course (id),
  kind TEXT NOT NULL CHECK (kind IN ('test', 'plusminus', 'homework')),
  name TEXT NOT NULL,
  held_on TEXT NOT NULL,                -- ISO date; decides the semester
  max_points REAL CHECK (max_points IS NULL OR max_points > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX assessment_course ON assessment (course_id, held_on);

-- The entries recorded so far, grouped into the columns they become: one per
-- course, kind, date, maximum and note. A student who has two entries in one
-- group keeps both, the second in a column of its own (`copy` 2, and so on),
-- so no result is lost to the one-result-per-column rule.
CREATE TEMP TABLE migrated_entry AS
SELECT e.*,
  ROW_NUMBER() OVER (
    PARTITION BY course_id, kind, entered_on, max_points, note, username ORDER BY id
  ) AS copy
FROM manual_entry e;

CREATE TEMP TABLE migrated_column (
  id INTEGER PRIMARY KEY,
  course_id INTEGER, kind TEXT, entered_on TEXT, max_points REAL, note TEXT, copy INTEGER, created_at TEXT
);
INSERT INTO migrated_column (course_id, kind, entered_on, max_points, note, copy, created_at)
SELECT course_id, kind, entered_on, max_points, note, copy, MIN(created_at)
FROM migrated_entry
GROUP BY course_id, kind, entered_on, max_points, note, copy
ORDER BY MIN(id);

-- Named by the note, or else by the kind and date.
INSERT INTO assessment (id, course_id, kind, name, held_on, max_points, created_at)
SELECT id, course_id, kind,
  COALESCE(note, CASE kind WHEN 'test' THEN 'Test' WHEN 'plusminus' THEN 'Participation' ELSE 'Homework' END || ' ' || entered_on)
    || CASE WHEN copy > 1 THEN ' (' || copy || ')' ELSE '' END,
  entered_on, max_points, created_at
FROM migrated_column;

-- SQLite cannot add a NOT NULL reference to a table in place, so the results
-- move into a new table. `value` and `points` are copied unchanged, so every
-- proposal stays what it was.
CREATE TABLE manual_entry_next (
  id INTEGER PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessment (id),
  username TEXT NOT NULL REFERENCES student (username),
  value REAL NOT NULL CHECK (value >= 0 AND value <= 1),
  points REAL,                          -- what was typed, for a column with a maximum
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (assessment_id, username)
);
INSERT INTO manual_entry_next (id, assessment_id, username, value, points, created_at, updated_at)
SELECT e.id, c.id, e.username, e.value, e.points, e.created_at, e.updated_at
FROM migrated_entry e
JOIN migrated_column c
  ON c.course_id = e.course_id AND c.kind = e.kind AND c.entered_on = e.entered_on
  AND c.max_points IS e.max_points AND c.note IS e.note AND c.copy = e.copy;

DROP TABLE manual_entry;
ALTER TABLE manual_entry_next RENAME TO manual_entry;
CREATE INDEX manual_entry_username ON manual_entry (username);

DROP TABLE migrated_entry;
DROP TABLE migrated_column;

-- The winter semester's share in the year grade, in whole percent. Beside the
-- weights rather than inside them: the four category weights add up to 100,
-- and this takes no part in that sum.
ALTER TABLE course ADD COLUMN winter_share INTEGER NOT NULL DEFAULT 50 CHECK (winter_share BETWEEN 0 AND 100);
