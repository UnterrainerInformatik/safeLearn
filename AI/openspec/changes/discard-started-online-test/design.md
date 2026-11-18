## Context

Four existing pieces already cover most of what discarding needs:

- `testBegun` (`exam/tests.js`): a test has begun when it has an attempt or one of its sittings has opened.
- `followPoolIfNotBegun`: makes a test that is no longer begun follow the pool again. `rescheduleSitting` and `deleteSitting` already call it.
- An online test's gradebook column is not a stored row. `exam/gradebook.js` derives it from "the test has a sitting", dates it by the first sitting, and takes its results from the submitted attempts.
- `deleteTest` shows what hangs off a test: `result_note` and `teacher_note` by `test_id`. The attempt's questions, tokens, answers and refused browsers go with it through foreign keys.

The students' pages listen on `/exam/api/my/events`. The `tests` event fires on every write to a sitting. While a student is writing, the page does not redraw on it.

## Goals / Non-Goals

**Goals:**
- One server operation that returns a test that has begun to exactly the state "never started" in one transaction.
- Reuse the existing pieces (`followPoolIfNotBegun`, `confirmButton`, the `notify` channels) instead of a parallel mechanism.

**Non-Goals:**
- Keeping a copy of the discarded attempts. They are gone, as with a reschedule.
- Discarding after the window has closed, or from an open make-up. That stays the admin's reschedule or deleting single attempts.
- Offline tests.

## Decisions

**D1 — The action belongs to the test, not to the sitting.** It is `POST /tests/:id/discard` with `{ attempts }`. "Never started" means no sitting is left, and that is the only way the derived gradebook column disappears. Keeping the sitting and moving its window would keep the column and the semester date. The rejected alternative was to keep the sittings and only empty them, like a reschedule. That would leave a "scheduled" sitting the teacher did not ask for, and it would still count for the column.

**D2 — Only while the first sitting is open.** Gerald's request covers the case "sitting open, attempts running". Allowing the action after the window has closed would let any teacher delete graded results that students may already have reviewed. Today only an admin can do that, through a reschedule. While a make-up is open, the first sitting's results are usually final, so the action is refused there too. Make-ups scheduled for later have not opened, so they hold no attempts and go with the test. The confirmed count is `COUNT(*) FROM attempt WHERE test_id = ?`. It covers the whole test, not one sitting, because every attempt of the test goes.

**D3 — Order inside the transaction.** First check: the test is online, its first sitting is open, and the count matches the confirmed count. Then delete `result_note` and `teacher_note` for the test, then `attempt`, then `sitting` (participants go through foreign keys). Then call `followPoolIfNotBegun(db, id, at)` and `refreshUsageDate`. The sitting is not ended first through `endSitting`. Its `finalizeDue` would submit and grade the attempts, only for them to be deleted straight away, and it runs outside the transaction. Deleting a running attempt directly is what `deleteAttempt` already does.

**D4 — Announcing.** After the commit, the route calls `notifySittings()`, so every student's open-tests list and the Exams button follow. It also sends `notify(sittingId, "discarded", null)` on the live view's channel for the former first sitting. The live view shows the notice and a link to the test page and closes its stream. It does not try to load the sitting again, which would now give a 404.

**D5 — The writing page notices the discard.** While writing, the page also listens for `tests`. On that event it asks the server for its own attempt, which is one cheap request. If the attempt is gone (404 `noAttempt`), the page stops its timers, the heartbeat and the focus reports, leaves full screen and shows the notice `exam.attempt.discarded` instead of the questions. A save that was already on its way is refused by the server anyway, because the attempt no longer exists. The rejected alternative was to wait for the next save or heartbeat. That can take up to a beat interval and shows a generic save error instead of the reason.

**D6 — The UI.** A `confirmButton` with the label `exam.live.discard` and the armed label `exam.live.discardArmed_{one,other}` ("Click again: delete {count} attempts and discard the test") sits next to "End now" in the live view. The same button appears in the sitting section of the test page while the first sitting is open. The count in the armed label comes from the data the page has already loaded. If it is stale, the server refuses with `exam.errors.tests.attemptsChanged`, the same key the reschedule uses, and the page reloads its count.

## Risks / Trade-offs

- [A teacher discards by mistake] → The two-click confirmation names the number of attempts, and the action only exists while the first sitting is open. It cannot be undone, and the label says so through "delete".
- [An admin's deletion of a single attempt now also shows the "discarded" notice on the writing page] → Acceptable. That admin correction is rare. The wording ("Your teacher has discarded this test") does not tell the student anything wrong about their own attempt.
- [Live view or test page counts are stale] → Covered by the server's check of the count (D6).
- [Images that only the snapshot showed] → `followPoolIfNotBegun` already sweeps orphaned images.

## Migration Plan

No schema change. Deploy as usual. The route is additive, so rolling back means removing it.
