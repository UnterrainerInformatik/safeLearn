-- Writing in full screen and the tick rate of the writing page (`online-test`,
-- exam-fullscreen-tick-rate design D5): whether the browser refused full
-- screen, the stretches out of full screen and with the tick rate down, and
-- the student's own frame rate the tick rate is measured against. Only adds
-- columns with defaults, so every existing attempt reads as "in full screen,
-- no figures" and needs no backfill. A closed year's triggers on `attempt`
-- (010-year-change.sql) cover the new columns as they are.

-- Set for good when the browser refused full screen, at the start or later.
ALTER TABLE attempt ADD COLUMN fullscreen_unavailable INTEGER NOT NULL DEFAULT 0;
-- Out of full screen: how many stretches, how long in all, and whether the
-- last span was one, so a run of them counts once.
ALTER TABLE attempt ADD COLUMN out_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempt ADD COLUMN out_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempt ADD COLUMN beat_out INTEGER NOT NULL DEFAULT 0;
-- Tick rate down: the same three.
ALTER TABLE attempt ADD COLUMN slow_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempt ADD COLUMN slow_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempt ADD COLUMN beat_slow INTEGER NOT NULL DEFAULT 0;
-- The tick rate of the last span, per mille of the baseline; NULL until known.
ALTER TABLE attempt ADD COLUMN tick_share INTEGER;
-- The median frame rate of the first normal spans, frames a second.
ALTER TABLE attempt ADD COLUMN frame_baseline REAL;
-- The frame rates of the normal spans so far, comma-separated, until there
-- are enough for the baseline; then cleared.
ALTER TABLE attempt ADD COLUMN rate_samples TEXT;
