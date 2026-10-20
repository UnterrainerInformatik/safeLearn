## Context

See `proposal.md` for the motivation. The data model is that of `exam/migrations/001`–`009`: a `school_year` has classes, a class has `roster_entry` rows and courses, and everything a gradebook or a test records hangs off a course (`assessment` → `manual_entry`, `semester_grade`, `test` → `test_question`/`test_answer`/`test_image`, `sitting` → `sitting_participant`, `attempt` → `attempt_question`/`attempt_token`/`response`/`refused_device`). `question_usage` points at a test and a course. The question pool itself belongs to no year.

Today there are about 48 write routes across `routes-classes.js`, `routes-gradebook.js`, `routes-tests.js` and `routes-attempts.js`, plus the attempt sweep in `attempts.js`, which finalizes attempts without a request. A rule that every one of them has to remember would be easy to break with the next route.

## Goals / Non-Goals

**Goals:**

- A closed year cannot be changed by any path, including ones added later.
- The next year is built in minutes from the previous one, and nobody lands on a roster without a teacher ticking them.
- The records of students who have left are deleted once the retention period has passed, never earlier and never without a confirmation that names the counts.

**Non-Goals:**

- Reopening a closed year. A correction after closing is not foreseen. If it turns out to be needed, it is a change of its own.
- Deleting old years, classes, courses or tests that hold no personal data any more. They stay as the school's record of what was taught and tested.
- Anonymizing instead of deleting (decided against on 2026-10-20).
- Deleting automatically on a timer. Deletion happens only in the year change, after the confirmation.

## Decisions

### D1 — Closing is a timestamp on the year, set by a button after the end date

- Migration `010-year-change.sql` adds `school_year.closed_at TEXT` (ISO timestamp, NULL while open).
- `closeYear(db, id)` refuses a year whose `ends_on` is today or later (Vienna date) and a year that is already closed, and refuses the current year. The current year is moved on first with `setCurrentYear`. Otherwise it sets `closed_at`.
- The overview of a year whose end date has passed shows **Close school year**. The confirmation says that nothing in the year can be changed afterwards, not even by the person closing it.
- `yearFromRow` reports `closed` (and `closedAt`), so every page can disable its write controls without a request of its own.

*Alternative:* closed automatically once the end date has passed. Rejected (Gerald, 2026-10-20): grades are often finished in the last days, and a teacher should decide when the year is done.

### D2 — The database refuses writes to a closed year, by triggers

- The same migration adds `BEFORE INSERT`, `BEFORE UPDATE` and `BEFORE DELETE` triggers on every table whose rows belong to a year: `class`, `roster_entry`, `course`, `assessment`, `manual_entry`, `semester_grade`, `test`, `test_question`, `test_answer`, `test_image`, `sitting`, `sitting_participant`, `attempt`, `attempt_question`, `attempt_token`, `response`, `refused_device`, `question_usage`. Each resolves the row's year through its parent chain and runs `SELECT RAISE(ABORT, 'exam: school year closed')` when that year has a `closed_at`.
- `school_year` itself gets a trigger that refuses changing a closed year's dates or name and clearing `closed_at`. Setting `is_current` stays allowed.
- `classes.js` maps the abort message to a new `ConflictError("exam.errors.years.closed")` in the shared error path, so every route answers 409 with a readable text without a check of its own.
- The attempt sweep never meets a closed year in practice (a year cannot be closed before its end, and sittings lie within it), but if it does, the sweep logs and skips that attempt rather than stopping.

*Alternative:* a check in each write function or route. Rejected: 48 routes plus the sweep, and every new route would have to remember it. Triggers are the one place no path can go around.

### D3 — Retention deletes through the triggers by a marker row

The deletion has to remove rows of closed years, which D2 forbids. A one-row table `purge_in_progress` is the exception: the delete triggers let a delete through while a row exists in it. `purgeLeavers` inserts the row, deletes, and removes the row again, all in one transaction, so no other write can see the marker. Only deletes are let through, never inserts or updates.

*Alternative:* `PRAGMA recursive_triggers`/disabling triggers for the run. SQLite cannot disable a trigger without dropping it, and dropping and recreating them inside the migration-owned schema is worse than a marker.

### D4 — Who counts as having left, and what is deleted

- A **leaver** is a student with no `roster_entry` in a class of the current year. Their **last year** is the latest `ends_on` among the years of all their roster entries.
- A leaver is **due** when their last year's `ends_on` plus `EXAM_RETENTION_YEARS` years is before today (Vienna date). A student who never was on any roster (possible after a failed import) is due at once.
- For each due student the deletion removes: their `manual_entry` and `semester_grade` rows, their attempts (the attempt's children go by `ON DELETE CASCADE`), their `sitting_participant` rows, their `roster_entry` rows, and the `student` row. Nothing else: courses, columns, tests and sittings stay, and a column or a test simply has one result fewer.
- `retentionReport(db, today)` answers the number of due students and the count per kind of record, never names. The confirmation shows exactly this report. `purgeLeavers(db, today, expected)` recomputes it and refuses if the counts differ from those the teacher confirmed (someone changed a roster in between).

### D5 — The retention period comes from `EXAM_RETENTION_YEARS`

A whole number of years, 1 to 10, default 2 (decided 2026-10-17 in `exam-module`, design Open Questions: the duty to keep records runs until the re-sits after a year are over). A malformed value disables the module at start with a message naming the variable, as `SCHOOL_PERIODS` does. `deploy/docker-compose.yml` passes it through. secureLectures does not set it.

### D6 — The next-year proposal is computed, the creation reuses `createClass`

- `nextYearProposal(db, yearId)` lists, for each class of the year before `yearId` (by `starts_on`), the successor name with the leading digit raised by one (`3ahif` → `4ahif`). A class whose name does not start with a digit from 1 to 4 has no successor and is listed as such. A successor that exists already in the new year is marked as done.
- For each class it answers last year's roster (those not marked as left) and the directory's current members of the successor name (`classCandidates`), with a flag per person whether they were on last year's roster. The client ticks last year's roster and shows the directory's other members unticked beside it. A known teacher is never offered, as everywhere (`class-roster`, D6 of `exam-module`).
- **Create** sends the ticked usernames and the courses to copy to `POST /exam/api/years/:id/next-classes`, which calls `createClass` and then `copyCourse` for each, all in one transaction. `copyCourse` copies subject, language, weights and winter share, nothing else.
- A closed year can be the source of a proposal: reading it is allowed.

## Risks / Trade-offs

- [The deletion is irreversible] → The report names counts before anything happens, the purge recomputes them, and the daily `VACUUM INTO` copies hold the previous state for 14 days. The backups are deliberately not purged early, since they age out on their own.
- [A trigger misses a table added later] → `test/exam-classes.test.js` (or a new year-change test) enumerates every table with a path to `school_year` from the schema and asserts that each one has its three triggers, so a new table without them fails the suite.
- [Triggers make writes slower] → One indexed lookup up the parent chain per row. During a sitting that is a few hundred lookups per minute, negligible on SQLite.
- [A year closed by mistake] → It cannot be reopened (non-goal). The confirmation states this. A restore from the backup of the day before remains as a last resort.

## Migration Plan

1. Merge to safeLearn and sync to secureLectures. The migration only adds a column, a table and triggers; no existing year is closed, so nothing changes until a teacher closes one.
2. The first real use is the change from 2026/27 to 2027/28 in summer 2027.
3. **Rollback:** the triggers and the column stay harmless with the old code, which never sets `closed_at`. A closed year would stay closed, which is the point.

## Open Questions

- None known. The decisions of 2026-10-20 settled delete versus archive, how a year is closed, and where the period is set.
