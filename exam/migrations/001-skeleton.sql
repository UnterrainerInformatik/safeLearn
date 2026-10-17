-- The schema skeleton: school years, classes, students, rosters, courses and
-- the global grading scale (AI/exam-module-plan.md, section 5). Later phases
-- add their tables in migrations of their own.

CREATE TABLE school_year (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,            -- e.g. "2026/27"
  starts_on TEXT NOT NULL,              -- ISO date
  summer_starts_on TEXT NOT NULL,       -- first day of the summer semester
  ends_on TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
);
-- At most one current school year.
CREATE UNIQUE INDEX school_year_one_current ON school_year (is_current) WHERE is_current = 1;

CREATE TABLE class (
  id INTEGER PRIMARY KEY,
  school_year_id INTEGER NOT NULL REFERENCES school_year (id),
  name TEXT NOT NULL,                   -- lowercased, e.g. "5ahif"
  UNIQUE (school_year_id, name)
);

-- A person as the module records them: by directory username, never by the
-- Keycloak user id. The names are a snapshot for display only.
CREATE TABLE student (
  username TEXT PRIMARY KEY,            -- lowercased
  given_name TEXT,
  family_name TEXT,
  names_refreshed_at TEXT
);

CREATE TABLE roster_entry (
  class_id INTEGER NOT NULL REFERENCES class (id),
  username TEXT NOT NULL REFERENCES student (username),
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (class_id, username)
);

-- Class x subject x school year; the year comes with the class.
CREATE TABLE course (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES class (id),
  subject TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en')),
  weights TEXT NOT NULL DEFAULT '{}',   -- the config sheet, as JSON
  UNIQUE (class_id, subject)
);

-- One global scale, in percent: a grade is reached at or above its threshold.
CREATE TABLE grading_scale (
  grade INTEGER PRIMARY KEY CHECK (grade BETWEEN 1 AND 5),
  min_percent REAL NOT NULL
);
INSERT INTO grading_scale (grade, min_percent) VALUES (1, 88), (2, 75), (3, 63), (4, 50), (5, 0);
