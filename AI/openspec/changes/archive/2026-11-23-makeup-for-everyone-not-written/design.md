## Context

A sitting's participants are rows of `sitting_participant (sitting_id, username, present, handout_group)`. They are read directly by many places: `startAttempt` and the Exams page queries in `exam/attempts.js`, handout access (`exam/handout.js`), teachers' notes (`exam/teacher-notes.js`), the live view and the attendance table (`exam/live.js`), the group that counts for the factor A:B (`exam/tests.js`), and retention. Today the rows of a make-up are written once, from the students the teacher ticked, by `createSitting`/`createOfflineSitting`, and rewritten by `updateSitting`/`updateOfflineSitting` before opening/starting.

An online student has at most one attempt per test (`UNIQUE (test_id, username)` on `attempt`). An attempt's questions, tokens, answers and refused browsers go with it via `ON DELETE CASCADE`. Offline tests take no answers. Their results are `manual_entry` rows of the test's `assessment` column, and presence is `sitting_participant.present` in a sitting with `started_at` set.

`discardTest` today runs only for an online test whose first sitting is open.

## Goals / Non-Goals

**Goals:**
- Every reader of `sitting_participant` keeps working unchanged: the rows of a make-up that is still ahead are always the current answer to "who has not written, plus retakes".
- A retake's first online attempt is deleted in the same transaction that creates the new one.
- One discard path for online and offline, before and after the end.

**Non-Goals:**
- No marker in an earlier sitting's live view that a student moved on to a retake. That row simply shows no attempt once the retake has started.
- No automatic clearing of an offline retake's earlier points.
- No change to the first sitting's choice of participants (whole class or chosen students).

## Decisions

### D1: Make-up rows are kept current on write, not computed on read

A make-up that is still ahead (online: `opens_at > now`; offline: `started_at IS NULL`) gets its rows from one function, `refreshMakeups(db, testId)`. For each such make-up of the test it computes the eligible set:
- online: active roster members without an attempt of the test;
- offline: active roster members not `present = 1` in another started sitting of the test.

It adds the rows marked `retake = 1` whose student is still on the roster and has still written. It then writes the set with the existing `writeParticipants`, which keeps the attendance and group of those who stay. A retake row whose student no longer counts as having written (their attempt was deleted by a reschedule, or their presence was corrected to absent) becomes a plain row with `retake = 0`.

`refreshMakeups` is called inside the transaction of every write that can change eligibility:
- creating or changing a sitting of the test, including the first sitting's participants;
- starting an attempt (online) or an offline sitting;
- `setAttendance`;
- rescheduling (it deletes attempts);
- deleting a sitting;
- the roster writes in `exam/classes.js` (join, rejoin, leave), for each test of each course of that class;
- an admin's deletion of an attempt (`deleteAttempt`), which makes the student one who has not written.

The make-up a create or update request has just written is filled even when its start window is open already (a make-up may be created starting now), since the refresh otherwise skips sittings that have opened. The refresh lives in `exam/makeups.js`, which depends on `exam/classes.js` alone, so that the roster writes and the start-up can call it without an import cycle through `tests.js` and `attempts.js`.

Retention deletes students who are on no current roster, so it needs no call.

Since nothing else changes eligibility, the rows are current when a make-up opens. "Fixed when the start window opens / when it is started" then needs no event: `refreshMakeups` simply skips make-ups that have opened or started. A make-up in a closed school year is never ahead, so the closed-year triggers on `sitting_participant` are never hit.

*Alternative considered:* computing participants on read, as a view or a function used by every reader. That would touch every query listed in Context and make "who was a participant of a past make-up" depend on later events. Freezing at opening would then need a lazy write on first read. The write-side refresh keeps one representation for past and future sittings.

### D2: `retake` is a flag on the participant row

Migration `022-makeup-retakes.sql` adds `sitting_participant.retake INTEGER NOT NULL DEFAULT 0 CHECK (retake IN (0, 1))`. Existing rows get 0. The closed-year triggers cover the table already. For a make-up, the create and update calls take `retakes: [usernames]` instead of `participants`. Each must be on the active roster and have written, or the request is refused with a reason naming them. A make-up request that carries `participants` is refused (`exam.errors.tests.makeupNoChoice`). `testSittings` returns `retakes` beside `participants`. The test payload gains `written`: the roster members who count as having written, which the form lists. It replaces the offline-only `absent` proposal.

After the migration, the first `refreshMakeups` call for a test replaces the chosen students of a make-up still ahead. To make that happen at deployment and not at some later write, the migration's companion step in `exam/db.js` runs `refreshMakeups` once for every test that has a make-up still ahead, right after migrating.

### D3: Starting a retake replaces the attempt in one transaction

In `startAttempt`, when an attempt of the test exists:
- if it belongs to the open sitting being started in, behave as today (resume, or `submittedByYou`);
- otherwise, if the student is a `retake = 1` participant of a sitting whose start window is open and the existing attempt has a `submitted_at`: delete it and create the new attempt in that sitting, in the same transaction. While the existing attempt still runs, it is resumed as today: refusing it (the first draft's `retakeStillRunning`) would leave the student no way back into their running attempt, since a reload goes through the same start request;
- otherwise, `submittedByYou` as today.

`finalizeDue` runs first as today, so an attempt whose deadline has just passed counts as submitted before the check. Teachers' notes (`teacher_note`) and result notes (`result_note`) are keyed by student and test and are left alone.

*Alternative considered:* deleting the first attempt when the retake is ticked. Rejected with Gerald: the first result counts until the student actually writes again.

### D4: `discardTest` covers over and offline tests

The checks become:
- refused in a closed year;
- refused while a make-up is open, or an offline sitting is running (`rowState === "open"`);
- refused if no sitting has opened (online) or been started (offline).

Otherwise it deletes `result_note` and `teacher_note` of the test, then its attempts and its sittings (participants cascade). For an offline test it also deletes the `manual_entry` rows of its `assessment`. The confirmed count is the number of attempts (online) or of those entries (offline). The online test then follows the pool (`followPoolIfNotBegun`) and refreshes its usage date as today. The offline column keeps its `held_on`, because `refreshColumnDate` returns early without a sitting. The discard is announced through the same live notifications as today. An over sitting has no writing students, so the student-side message only matters for the open-first-sitting case. The client offers the button on the test page whenever the server would allow it. The live view keeps it only for the open first sitting. The armed label changes from "attempts" to "results".

### D5: The forms

The online and offline make-up forms drop the "whole class" box and the student checkboxes. They show the explanation ("for everybody who has not written the test yet") and, if `written` is not empty, a list headed "Already written, write again:" with one checkbox per name, ticked for the current retakes when changing a make-up. The sitting summaries, the live view rows and the attendance table show a "Retake" marker for `retake` rows. All strings go into `i18n/de.json` and `i18n/en.json` under existing groups, with the same keys in both.

## Risks / Trade-offs

- [A write path that changes eligibility forgets to call `refreshMakeups`] → The list in D1 is closed and each entry gets a test. A test also asserts that the rows of a make-up still ahead equal the computed set after each kind of write.
- [Roster writes now touch every test of every course of the class] → A class has a handful of courses and tests, and the refresh is a few indexed queries per make-up still ahead, usually none.
- [A retake deletes a submitted attempt without a further confirmation] → Ticking the box is the confirmation. The deletion happens only when the student starts, and the box can be unticked until the make-up opens.
- [Discarding an over test deletes many results] → The two-click confirmation names the number, and the server checks it. A closed year is refused.
- [Existing make-ups still ahead lose their chosen students at deployment] → This is intended and stated in the specs. At most a few exist.

## Migration Plan

1. Deploy migration 022 and the code together. On start-up, after migrating, `refreshMakeups` runs for every test with a make-up still ahead (D2).
2. Rollback: the old code ignores the `retake` column. A make-up still ahead keeps the rows the refresh last wrote, which is a valid list of chosen students for the old code.
