-- The gradebook (P4, `gradebook`). The grading scale came with the skeleton,
-- seeded 88/75/63/50; this adds the manual entries and the per-semester
-- override with its comment. Proposals are computed on read, never stored
-- (design.md, D7).

-- A result a teacher enters by hand. `value` is the fraction everything is
-- computed from; `points` and `max_points` are what was typed, kept for
-- display only ("17/24"), and are both set or both empty.
CREATE TABLE manual_entry (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course (id),
  username TEXT NOT NULL REFERENCES student (username),
  kind TEXT NOT NULL CHECK (kind IN ('test', 'plusminus', 'homework')),
  value REAL NOT NULL CHECK (value >= 0 AND value <= 1),
  points REAL,
  max_points REAL,
  entered_on TEXT NOT NULL,             -- ISO date; decides the semester
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((points IS NULL) = (max_points IS NULL))
);
CREATE INDEX manual_entry_course_student ON manual_entry (course_id, username);
CREATE INDEX manual_entry_username ON manual_entry (username);

-- A teacher's override and comment for one student's semester. `ss` is the
-- year grade. A row without an override and without a comment is not kept.
CREATE TABLE semester_grade (
  course_id INTEGER NOT NULL REFERENCES course (id),
  username TEXT NOT NULL REFERENCES student (username),
  semester TEXT NOT NULL CHECK (semester IN ('ws', 'ss')),
  override INTEGER CHECK (override BETWEEN 1 AND 5),
  comment TEXT,
  comment_visible INTEGER NOT NULL DEFAULT 0 CHECK (comment_visible IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (course_id, username, semester)
);
