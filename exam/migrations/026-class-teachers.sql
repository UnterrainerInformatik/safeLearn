-- The teachers entered in a class (`class-teachers`, class-bound-teachers
-- design D1): one row per class and directory username. A session acting as a
-- teacher but not as an admin sees a class only while it has a row here.
--
--   class_id  the class, which belongs to one school year; the rows go with
--             their class when it is deleted
--   username  the teacher's lowercased directory username
--
-- The list decides who may look at a class and is no record of the year, so,
-- unlike every other table with a path to `school_year`, it has no closed-year
-- triggers: an admin may change it in a closed year as well. Only adds;
-- nothing is rebuilt, and every class starts with no teacher entered.

CREATE TABLE class_teacher (
  class_id INTEGER NOT NULL REFERENCES class (id) ON DELETE CASCADE,
  username TEXT NOT NULL CHECK (length(username) BETWEEN 1 AND 256),
  PRIMARY KEY (class_id, username)
);
CREATE INDEX class_teacher_username ON class_teacher (username);
