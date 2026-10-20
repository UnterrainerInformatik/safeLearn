## Context

See proposal.md for why. Today `updateSitting` and `deleteSitting` (`exam/tests.js`) call `requireNotOpened`, so a sitting that has opened is fixed. An attempt belongs to one sitting (`attempt.sitting_id`); its questions, tokens, responses and refused browsers go with it by `ON DELETE CASCADE`, and `deleteAttempt` (`exam/attempts.js`, admin only) relies on that. The gradebook derives an online test's column from the attempts and dates it by `MIN(opens_at)` over all of the test's sittings (`onlineColumns`, `exam/gradebook.js`); `question_usage.used_on` is kept in step by `refreshUsageDate`. All test routes sit behind `requireTeacher`, which admits any teacher, not only the course's; the admin-only writes use `requireAdmin` or `actsAsAdmin`.

## Goals / Non-Goals

**Goals:** move an over sitting to a new window in one step, deleting its attempts, with the permission split decided on 2026-10-20.

**Non-Goals:** changing the duration or participants while rescheduling (that would ripple into make-ups; delete and create covers the rare case once nothing is written); rescheduling a scheduled or open sitting (Change and End already exist); keeping the deleted attempts anywhere but the backup; moving a test's snapshot (see D6).

## Decisions

### D1 `rescheduleSitting(db, id, { opensAt, closesAt, attempts }, { admin })` in `exam/tests.js`

It refuses unless the sitting is over (`sittingState` = "over", `ConflictError exam.errors.tests.sittingNotOver`). It counts the sitting's attempts; a count above zero without `admin` is refused with `ForbiddenError` (403), and a count different from `attempts` with `ConflictError exam.errors.tests.attemptsChanged`, so an admin never deletes more than the label promised. The window is checked by the existing `sittingTimes` with the stored duration, the participants by `participantsOf` after dropping usernames that have left the roster (`emptyRoster`-style refusal if none remain). In one `inTransaction`: delete the sitting's attempts, update the window, replace the participant rows, `refreshUsageDate`.

*Alternative:* reuse `updateSitting` with a flag. Rejected: its make-up/duration rules and `requireNotOpened` would need exceptions; a separate function keeps both readable.

### D2 Route `POST /api/sittings/:id/reschedule`

Behind `requireTeacher` like the other sitting writes; the handler passes `admin: await actsAsAdmin(req)` as `DELETE /tests/:id` does. The answer is announced with `notifySittings()` and `notify(id, "window", null)` (the live view reloads its window) and, when attempts were deleted, `notify(id, "deleted", username)` per attempt so an open live view drops the rows.

### D3 The form

An over sitting shows **Reschedule** beside its line when the reader may use it: always without attempts, only for an admin with attempts (the client knows both from `examMe` and the sitting's attempt count, which `testSittings` adds). It opens `drawSittingForm` in a reschedule mode: heading "Reschedule sitting", date and periods editable, duration and participants shown read-only. The periods are matched from the old window (`matchWindow`); the date proposed is the next Monday to Friday after today. Holidays are not known to the client; the teacher corrects the date. Without attempts the save is a plain button, with attempts a `confirmButton` whose armed label is `exam.tests.rescheduleArmed` with the count.

### D4 Make-ups and the first sitting

A make-up takes its duration from the first sitting; since rescheduling keeps the duration, no make-up rule is touched. A first sitting moved past its make-ups stays the first sitting (`makeup` flag unchanged). The gradebook date is `MIN(opens_at)` and so follows by itself; only `refreshUsageDate` needs calling.

### D5 Permission check on the server, not only the button

The button's visibility is convenience; the 403 in D1 is the rule. A non-admin who somehow sends a request for a sitting with attempts changes nothing.

### D6 Snapshot

The snapshot stays as it is. Once the test's last attempt is gone, `testStarted` is false again, so the test's questions become editable through the existing "update unwritten tests" path. The planned change "snapshot only when a test begins" will drop the snapshot at that point; it needs nothing from this change but the attempts being gone.

## Risks / Trade-offs

- [An admin deletes written results by mistake] → second click naming the count, server-side count check, admin only, daily backup.
- [Proposed date is a holiday] → the teacher sees and edits the date before saving; nothing is saved without the click.
- [Students still have the old sitting's page open] → the sitting is over, so nothing can be saved there; the announcement refreshes their list.

## Migration Plan

No schema change. Deploy as usual; rollback is the previous image, since nothing new is stored.
