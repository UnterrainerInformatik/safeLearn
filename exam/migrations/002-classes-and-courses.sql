-- Classes and courses (P1, `class-roster`). The tables came with the skeleton;
-- this adds what using them needs.

-- A subject is one course per class however it is capitalized: "WMC" and "wmc"
-- are the same course. The skeleton's UNIQUE (class_id, subject) stays and is
-- covered by this one.
CREATE UNIQUE INDEX course_class_subject_nocase ON course (class_id, subject COLLATE NOCASE);

-- A student's own rosters - and later their own courses and results - are
-- looked up by username.
CREATE INDEX roster_entry_username ON roster_entry (username);
