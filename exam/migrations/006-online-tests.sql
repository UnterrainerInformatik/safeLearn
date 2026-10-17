-- Online tests (`online-test`, exam-online-tests design D2): tests assembled
-- from the pool with a snapshot of their questions, the sittings they are
-- written in, and the attempts written. Only adds tables; `question_usage`'s
-- reference to `test` resolves from here on.

-- A test of a course, and the snapshot of its questions: what a student is
-- shown and graded by, never written again once an attempt exists. Each
-- snapshot row remembers the pool question it was taken from.
CREATE TABLE test (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course (id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX test_course ON test (course_id);

CREATE TABLE test_question (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES test (id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES question (id),
  position INTEGER NOT NULL,            -- the order the teacher chose; each attempt shuffles it
  type TEXT NOT NULL CHECK (type IN ('multichoiceset', 'multichoice', 'truefalse')),
  name_de TEXT NOT NULL,
  name_en TEXT NOT NULL,
  text_de TEXT NOT NULL,                -- sanitized HTML, as the pool held it
  text_en TEXT NOT NULL,
  UNIQUE (test_id, position),
  UNIQUE (test_id, question_id)
);

CREATE TABLE test_answer (
  id INTEGER PRIMARY KEY,
  test_question_id INTEGER NOT NULL REFERENCES test_question (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,            -- the original order; each attempt shuffles it
  text_de TEXT NOT NULL,
  text_en TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  UNIQUE (test_question_id, position)
);

-- The pool's images a snapshot shows, referenced rather than copied. The
-- database refuses to drop an image a test still shows.
CREATE TABLE test_image (
  test_id INTEGER NOT NULL REFERENCES test (id) ON DELETE CASCADE,
  image_id INTEGER NOT NULL REFERENCES image (id) ON DELETE RESTRICT,
  PRIMARY KEY (test_id, image_id)
);
CREATE INDEX test_image_image ON test_image (image_id);

-- When a test is written: a window, an attempt's duration within it, and who
-- takes part. A make-up is a sitting for selected students.
CREATE TABLE sitting (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES test (id) ON DELETE CASCADE,
  opens_at TEXT NOT NULL,               -- ISO timestamp, UTC
  closes_at TEXT NOT NULL,
  duration_s INTEGER NOT NULL CHECK (duration_s > 0),
  makeup INTEGER NOT NULL DEFAULT 0 CHECK (makeup IN (0, 1)),
  created_at TEXT NOT NULL,
  CHECK (opens_at < closes_at)
);
CREATE INDEX sitting_test ON sitting (test_id, opens_at);

CREATE TABLE sitting_participant (
  sitting_id INTEGER NOT NULL REFERENCES sitting (id) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES student (username),
  PRIMARY KEY (sitting_id, username)
);
CREATE INDEX sitting_participant_username ON sitting_participant (username);

-- One attempt per student and test, across all sittings. `score` and
-- `question_count` are set when it is submitted; the device's secret is kept
-- as its SHA-256 only. The focus log is a count and a sum, never read by the
-- scoring.
CREATE TABLE attempt (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES test (id),
  sitting_id INTEGER NOT NULL REFERENCES sitting (id),
  username TEXT NOT NULL REFERENCES student (username),
  started_at TEXT NOT NULL,
  deadline TEXT NOT NULL,
  submitted_at TEXT,
  score INTEGER,
  question_count INTEGER NOT NULL,
  device_hash TEXT,
  focus_count INTEGER NOT NULL DEFAULT 0,
  focus_ms INTEGER NOT NULL DEFAULT 0,
  away_since TEXT,
  UNIQUE (test_id, username)
);
CREATE INDEX attempt_sitting ON attempt (sitting_id);
CREATE INDEX attempt_open ON attempt (deadline) WHERE submitted_at IS NULL;

-- An attempt's permutation of the questions, and of each question's answers
-- behind random tokens: the only names a student's browser ever sees.
CREATE TABLE attempt_question (
  attempt_id INTEGER NOT NULL REFERENCES attempt (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  test_question_id INTEGER NOT NULL REFERENCES test_question (id),
  PRIMARY KEY (attempt_id, position),
  UNIQUE (attempt_id, test_question_id)
);

CREATE TABLE attempt_token (
  attempt_id INTEGER NOT NULL REFERENCES attempt (id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  test_answer_id INTEGER NOT NULL REFERENCES test_answer (id),
  position INTEGER NOT NULL,            -- the answer's place within its question for this attempt
  PRIMARY KEY (attempt_id, token),
  UNIQUE (attempt_id, test_answer_id)
);

-- The answers chosen; saving a question replaces its rows.
CREATE TABLE response (
  attempt_id INTEGER NOT NULL REFERENCES attempt (id) ON DELETE CASCADE,
  test_answer_id INTEGER NOT NULL REFERENCES test_answer (id),
  PRIMARY KEY (attempt_id, test_answer_id)
);

-- Requests for an attempt from another browser than the one bound to it.
CREATE TABLE refused_device (
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES attempt (id) ON DELETE CASCADE,
  at TEXT NOT NULL
);
CREATE INDEX refused_device_attempt ON refused_device (attempt_id);
