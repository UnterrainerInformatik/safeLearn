-- The question editor (`question-editor`, exam-question-editor design D4/D7):
-- a staging table for images uploaded before the save that makes them a
-- question's, and a version per question for catching concurrent edits. Only
-- adds; no existing row is rewritten.

-- An image a teacher uploaded into the editor and has not saved with a
-- question yet. Served to teachers only by its random token; a save turns it
-- into an `image` row of the question and deletes it here, and anything older
-- than a day is purged.
CREATE TABLE image_upload (
  token TEXT PRIMARY KEY,               -- 128 random bits, hex
  uploaded_by TEXT NOT NULL,            -- the teacher's username
  uploaded_at TEXT NOT NULL,            -- ISO timestamp
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  sha256 TEXT NOT NULL,
  data BLOB NOT NULL
);
CREATE INDEX image_upload_age ON image_upload (uploaded_at);

-- Bumped by every save, retire and revive; a save names the version it was
-- read at and is refused if the question moved on meanwhile.
ALTER TABLE question ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
