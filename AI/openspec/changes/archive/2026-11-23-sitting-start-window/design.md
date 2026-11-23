## Context

A sitting row (`exam/migrations/006-online-tests.sql`) has `opens_at`, `closes_at` and `duration_s`; each attempt stores its own `deadline`, written at start in `startAttempt` (`exam/attempts.js`) as the earlier of start + duration and `closes_at`. `sittingState` (`exam/tests.js`) is a pure function of the window alone: scheduled before `opens_at`, open before `closes_at`, over after. Everything else keys off that function or off `closes_at` directly in SQL: the Exams page's open-tests query and the start query (`attempts.js`), the review condition (`reviewableCondition`, `reviewOpen`), `endSitting`, `extendSitting`, `rescheduleSitting`, `discardTest`, the live snapshot (`live.js`) and the client's `testTiming`. On the client, `exam/client/periods.js` maps a date and a from/to period range to a window (`windowFor`, `matchWindow`, `defaultPeriods`), and `displayWindow` in `exam/client/tests.js` renders it. Offline sittings share all of these code paths, with `started_at` and no attempts.

## Goals / Non-Goals

**Goals:**
- One definition of "open" and "over" for an online sitting, used by the server's state, by every SQL predicate and by the client, so the review cannot open while a classmate is still writing.
- No migration and no data conversion: the stored window is read as the start window.
- Offline sittings behave exactly as today.

**Non-Goals:**
- A writing-time extension for a single participant.
- Giving later starters the writing time a teacher added (spec: it applies to attempts running at that moment).
- Changing how an offline sitting is planned, started or displayed.

## Decisions

### D1 — The columns keep their names, the window becomes the start window

`opens_at`/`closes_at` are the start window; `duration_s` stays per sitting. `startAttempt` writes `deadline = started_at + duration_s` with no clamp. The check `durationS < window` in `sittingTimes` goes; the remaining checks are: opens before closes, closes in the future, duration 1–600 minutes, start window length up to 600 minutes. The schema's `CHECK (opens_at < closes_at)` already fits.

*Alternative:* new columns `start_opens_at`, `start_minutes`. Rejected: the stored data already means exactly that once read differently, and Gerald confirmed nothing needs converting.

### D2 — "Running until" is part of a sitting's state

`sittingState` gains an input `runningUntil`: the latest `deadline` of the sitting's attempts that are unsubmitted and whose deadline is after `at` (null if none). An online sitting is `scheduled` before `opens_at`, `open` while `at < closes_at` or `runningUntil` is set, `over` otherwise. Offline sittings ignore `runningUntil` (they have no attempts). A helper `runningUntil(db, sittingId, at)` supplies it; every caller of `sittingState` that reads a row from the database goes through one function (`rowState`) that fetches it, so no caller can forget it.

The same rule in SQL is one fragment, `sittingOverSql(alias)`:
`alias.closes_at <= ? AND NOT EXISTS (SELECT 1 FROM attempt ra WHERE ra.sitting_id = alias.id AND ra.submitted_at IS NULL AND ra.deadline > ?)`, used by `reviewableCondition` and `reviewOpen`. An attempt past its deadline but not yet finalized counts as not running; the finalizer submits it at its deadline anyway, so the review shows the same answers.

The sitting JSON (`testSittings`, `getSitting`) and the live snapshot gain `startOpen` (the start window is open now) and `endsAt`: while `startOpen`, the later of `closes_at + duration_s` and `runningUntil`; after it, `runningUntil`; null once over.

*Alternative:* a stored `ends_at` column kept up to date on every start, submit, end and extension. Rejected: four writers to keep in step for a value one indexed query computes.

### D3 — Offering, starting and resuming

The Exams page's open-tests query lists an online test when a sitting of the student's is in its start window **or** the student has a running attempt in one; the entry's `closesAt` for a started attempt is its deadline. `startAttempt` answers an existing attempt first (resume, regardless of the start window) and creates a new one only while a sitting of the student's is in its start window. `nextOpenTestsChange` already lists `closes_at` and deadlines, so the student's page drops an unstarted test at the end of the start window and a started one at its deadline without change.

### D4 — Two extensions for online, one for offline

`extendSitting` stays as the offline extension (moves the shared `closes_at`) and is refused for an online sitting. Two new functions and routes:
- `extendStartWindow(db, id, {minutes})`, `POST /api/sittings/:id/extend-start`: 5–120 minutes, refused unless `at < closes_at`; moves `closes_at`, touches no attempt.
- `extendWritingTime(db, id, {minutes})`, `POST /api/sittings/:id/extend-writing`: 1–120 minutes, refused unless `runningUntil` is set; `UPDATE attempt SET deadline = deadline + minutes WHERE sitting_id = ? AND submitted_at IS NULL AND deadline > ?` (computed in JS on ISO strings, as elsewhere).
Both are announced like the old extend (`announcedLive`), whose "window changed" event already makes the live view and the students' pages refetch deadlines.

`endSitting` sets `closes_at = min(closes_at, at)` and every running deadline to `at`, then finalizes. The guard "end not later than the opening" stays.

### D5 — Periods: one period, an offset and a length

`periods.js` gains `startWindowFor(periods, date, n, offsetMinutes, lengthMinutes)` and `matchStart(periods, opensAt, closesAt)` → `{ date, n, offset, length }` when `opens_at` lies in `[start, end)` of a period and both instants are on the same Vienna date, else null. `defaultPeriods` keeps its rule and the form adds offset 5, length 10, and the proposed period is the first of today whose default start window (start + 5 to start + 15) has not closed yet. `windowFor`/`matchWindow` stay for offline display only. The sitting form of an online test is rebuilt on one window state as today (school-periods D7): the periods editor (date, period, offset, length) and the clock editor (date, start time, length) both read and write `{ opensAt, closesAt }`; the form shows the start window and `closesAt + duration` live. What the form sends to the server does not change: `{ opensAt, closesAt, durationMinutes, participants }`. The reschedule proposal takes `matchStart` of the old window onto the next weekday, or the clock start and length when it does not match.

### D6 — Display

`displayStartWindow(sitting, periods)` renders `<weekday date> · <period> · <start> HH:MM–HH:MM`, the period part only when `matchStart` names one (with its tooltip as today, `periodLabel`), full clock times with both dates when the start window crosses midnight. Every online place that called `displayWindow` (list of tests, test page sittings, live view, view for the class) uses it; offline places keep `displayWindow`. The live view and the view for the class add a line "time runs out at the latest HH:MM" from `endsAt`, or "over" once null. i18n keys in `de.json`/`en.json` (`exam.periods.start`, `exam.live.endsAt`, the two extend labels and their refusals).

## Risks / Trade-offs

- [A sitting is open during deploy and its attempts were stored with clamped deadlines] → Deploy when no sitting is open; an attempt already running keeps its stored deadline, which is only ever shorter, and nothing breaks.
- [`rowState` now runs a query per sitting in lists] → One indexed aggregate per sitting on `attempt (sitting_id)`; the lists show a handful of sittings per test. If needed, `testSittings` fetches all `runningUntil` in one grouped query.
- [A writing-time extension given while the start window is open does not reach later starters, which may surprise] → The spec states it; the live view shows each participant's own time, so the difference is visible.
- [Old sittings spanning two periods now read as one long start window] → Intended (spec "An older sitting"); they are all in the past.
