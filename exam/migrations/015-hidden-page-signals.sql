-- Signs of a hidden page beside the focus log (`online-test`,
-- exam-hidden-page-signals design D4): a manipulated-browser finding, the
-- last heartbeat, and the stretches the heartbeat showed the page hidden
-- while the focus log said the student was on it. Only adds columns with
-- defaults, so every existing attempt reads as clean and needs no backfill.
-- A closed year's triggers on `attempt` (010-year-change.sql) cover the new
-- columns as they are.

-- The names of the replaced properties, comma-separated; merged, never shrunk.
ALTER TABLE attempt ADD COLUMN tamper_detail TEXT;
-- When the first of them was found.
ALTER TABLE attempt ADD COLUMN tamper_at TEXT;
-- The server's time of the last heartbeat received.
ALTER TABLE attempt ADD COLUMN beat_at TEXT;
-- Whether that last heartbeat was judged hidden, so a run of them counts once.
ALTER TABLE attempt ADD COLUMN beat_hidden INTEGER NOT NULL DEFAULT 0;
-- Hidden by timing: how many stretches, and how long in all.
ALTER TABLE attempt ADD COLUMN hidden_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempt ADD COLUMN hidden_ms INTEGER NOT NULL DEFAULT 0;
