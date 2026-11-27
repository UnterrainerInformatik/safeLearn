-- A photo per student (`student-photos`, design D1): at most one per directory
-- username, the image itself as a BLOB in this database, so the module's data
-- stays one file with one backup and one restore path.
--
--   image        the JPEG or PNG bytes, checked by their header before they
--                get here: at most 256 KB, at most 600 px on the longer side
--   mime         image/jpeg or image/png, read from the header
--   width/height the pixels the header states
--   imported_at  when this photo was stored; the version a list's payload
--                carries is made from it, so a replaced photo has a new URL
--   imported_by  the admin who stored it
--
-- No reference to `student`: a photo belongs to a directory person, who need
-- not be on any roster yet. Nothing deletes a row but an admin's explicit
-- deletion on the import page (design D7); the retention purge and the
-- directory refresh leave this table alone. Only adds; nothing is rebuilt.

CREATE TABLE student_photo (
  username TEXT PRIMARY KEY CHECK (length(username) BETWEEN 1 AND 256),
  image BLOB NOT NULL CHECK (length(image) BETWEEN 1 AND 262144),
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png')),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 600),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 600),
  imported_at TEXT NOT NULL,
  imported_by TEXT NOT NULL
);
