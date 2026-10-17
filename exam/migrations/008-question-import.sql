-- Importing questions from a Markdown file (`question-import`,
-- exam-question-import design D6): a row per import, and on each question the
-- import it came from and whether a teacher still has to review it. Only adds;
-- no existing row is rewritten, and every existing question counts as
-- reviewed. The one-time Moodle import keeps its own `pool_import`.

-- One import of a file. Taking the import back deletes the row after its
-- questions, so the same file is accepted again afterwards.
CREATE TABLE question_import (
  id INTEGER PRIMARY KEY,
  imported_at TEXT NOT NULL,            -- ISO timestamp
  imported_by TEXT NOT NULL,            -- the teacher's username
  file_name TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,          -- of the raw file; refuses the same file twice
  report TEXT NOT NULL                  -- JSON: counts, new categories, near duplicates
);

ALTER TABLE question ADD COLUMN import_id INTEGER REFERENCES question_import (id);
-- Set by an import, cleared by "Mark as reviewed" or a save in the editor.
ALTER TABLE question ADD COLUMN unreviewed INTEGER NOT NULL DEFAULT 0 CHECK (unreviewed IN (0, 1));
CREATE INDEX question_unreviewed ON question (unreviewed) WHERE unreviewed = 1;
