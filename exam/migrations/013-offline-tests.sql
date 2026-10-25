-- Offline tests (`offline-test`, `exam-handout`, exam-offline-sittings design
-- D1, D3): a test without questions, written in the classroom, whose sittings
-- a teacher starts by a button, with an attendance table and up to two
-- handouts. Only adds columns with defaults: every existing test is an online
-- test, every existing participant is present in group A, and online code
-- reads none of it.

-- Which kind of test. Every guard about questions asks for 'online'.
ALTER TABLE test ADD COLUMN kind TEXT NOT NULL DEFAULT 'online' CHECK (kind IN ('online', 'offline'));
-- An offline test's duration; its sittings copy it, so a make-up keeps it.
ALTER TABLE test ADD COLUMN duration_s INTEGER CHECK (duration_s IS NULL OR duration_s > 0);
-- The handouts' corpus paths, relative to `md/`. A second one only beside a first.
ALTER TABLE test ADD COLUMN handout_a TEXT;
ALTER TABLE test ADD COLUMN handout_b TEXT CHECK (handout_b IS NULL OR handout_a IS NOT NULL);
-- An offline test's column in the gradebook: an ordinary manual column of
-- the test or short-test category.
ALTER TABLE test ADD COLUMN assessment_id INTEGER REFERENCES assessment (id);

-- When the teacher started an offline sitting; NULL before, and always for an
-- online one. Until then `opens_at`/`closes_at` hold the planned window.
ALTER TABLE sitting ADD COLUMN started_at TEXT;

-- The attendance table: present or absent, and the handout group.
ALTER TABLE sitting_participant ADD COLUMN present INTEGER NOT NULL DEFAULT 1 CHECK (present IN (0, 1));
ALTER TABLE sitting_participant ADD COLUMN handout_group TEXT NOT NULL DEFAULT 'A' CHECK (handout_group IN ('A', 'B'));
