-- The question pool (`question-pool`): a category tree, questions with their
-- text in German and English, their answers with the correct flags, the images
-- they embed, and where each was used. One pool for all teachers; after the
-- one-time Moodle import the database is its only source of truth.

-- A node of the tree, e.g. "HTTP und REST" with the child "Caching". Both
-- names are kept, because a course is held in German or in English.
CREATE TABLE question_category (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES question_category (id),
  name_de TEXT NOT NULL,
  name_en TEXT NOT NULL,
  position INTEGER NOT NULL             -- order among its siblings
);
CREATE UNIQUE INDEX question_category_name ON question_category (COALESCE(parent_id, 0), name_de);

-- One point per question, graded all-or-nothing; the type says how many
-- answers may be correct. A used question is retired, never deleted, so its
-- usage keeps its target (`question-editor`).
CREATE TABLE question (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES question_category (id),
  type TEXT NOT NULL CHECK (type IN ('multichoiceset', 'multichoice', 'truefalse')),
  name_de TEXT NOT NULL,                -- the short title Moodle gave it
  name_en TEXT NOT NULL,
  text_de TEXT NOT NULL,                -- sanitized HTML
  text_en TEXT NOT NULL,
  position INTEGER NOT NULL,            -- order within its category
  retired INTEGER NOT NULL DEFAULT 0 CHECK (retired IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX question_category_position ON question (category_id, position);

CREATE TABLE answer (
  id INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES question (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,            -- the original order; a test shuffles it
  text_de TEXT NOT NULL,                -- sanitized HTML
  text_en TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  UNIQUE (question_id, position)
);

-- An image a question's or an answer's text embeds, served only by the module
-- (`/exam/api/images/:id`) to a session allowed to see that question. Kept in
-- the database rather than as a file, so the one-file backup covers it. The
-- same picture in both languages is stored once per question.
CREATE TABLE image (
  id INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES question (id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  sha256 TEXT NOT NULL,
  data BLOB NOT NULL,
  UNIQUE (question_id, sha256)
);

-- Where a question was used: one row per test it was put into, written when
-- the test is assembled. The course and date are recorded here, so the
-- question browser shows the history without reaching into the tests. `test`
-- itself arrives with the online tests (P3); SQLite resolves the reference
-- only when a row is written, and nothing writes one before then.
CREATE TABLE question_usage (
  question_id INTEGER NOT NULL REFERENCES question (id),
  test_id INTEGER NOT NULL REFERENCES test (id),
  course_id INTEGER NOT NULL REFERENCES course (id),
  used_on TEXT NOT NULL,                -- ISO date of the test
  PRIMARY KEY (question_id, test_id)
);
CREATE INDEX question_usage_course ON question_usage (course_id);

-- The one-time import, with its report. A row here is what makes a second
-- import refuse.
CREATE TABLE pool_import (
  id INTEGER PRIMARY KEY,
  imported_at TEXT NOT NULL,
  source_de TEXT NOT NULL,
  source_en TEXT NOT NULL,
  report TEXT NOT NULL                  -- JSON: the counts the import printed
);
