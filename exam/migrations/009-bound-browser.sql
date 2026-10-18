-- The browser an attempt is bound to, as it names itself (`online-test`,
-- exam-live-bound-browser design D1): the `User-Agent` of the browser that
-- started the attempt or bound to it after a release, and that of every
-- browser refused. Shown to the teacher in the live view, never compared - the
-- binding stays the cookie. Only adds; existing rows keep NULL, which the live
-- view shows as "unknown".

-- Cleared with `device_hash` when the teacher unbinds the attempt.
ALTER TABLE attempt ADD COLUMN device_user_agent TEXT;
ALTER TABLE refused_device ADD COLUMN user_agent TEXT;
