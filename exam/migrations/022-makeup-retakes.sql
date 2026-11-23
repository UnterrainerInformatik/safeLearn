-- A make-up's participants are no longer chosen (makeup-for-everyone-not-written
-- design D1, D2): they are everybody on the roster who has not written the test
-- yet, kept current by `refreshMakeups` until the make-up begins, plus the
-- students a teacher marked to write it again. `retake` marks those. Every
-- existing row is no retake. The closed-year triggers of 010-year-change.sql
-- cover the table already.
ALTER TABLE sitting_participant ADD COLUMN retake INTEGER NOT NULL DEFAULT 0 CHECK (retake IN (0, 1));
