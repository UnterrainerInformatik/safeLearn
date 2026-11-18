Source: AI/open-proposals.md, entry **Begonnenen Online-Test abbrechen und verwerfen**.

## Why

Sometimes an online test goes wrong after students have started it: a question is broken, the wrong test was opened, or the room's network fails. Today a teacher cannot get out of that state. Once the first attempt has started, the test cannot be deleted and its questions are fixed (`online-test`). Its attempts disappear only when a sitting that is over is rescheduled, and only an admin can do that with attempts in it (`exam-record-maintenance`). The teacher's only other choice is to assemble the test again under a new name. That leaves a dead column with partial results in the gradebook.

## What Changes

- A teacher (not only an admin) can **discard** an online test while its first sitting is open. Discarding ends the sitting, deletes every attempt of the test with its answers, and deletes every sitting of the test. That includes make-ups, which cannot have opened yet. It also deletes the test's notes in the gradebook column and the teachers' notes on its participants.
- The action needs the module's two-click confirmation. The second click's label names the number of attempts to be deleted. The server refuses the request if the actual number differs from the confirmed one.
- Afterwards the test is in the state it was in before its first sitting. It has no sitting, so it has no gradebook column and its results are gone. It drops its snapshot and follows the pool again: it takes each question's current pool version, and questions deleted from the pool meanwhile are no longer part of it. It can be renamed, its questions changed and it can be deleted. A new sitting can be scheduled for it as for any new test.
- Students who are writing at that moment are taken off their attempt. Their page tells them that the teacher discarded the test. The live view announces the discard and leaves the sitting.
- The action is offered in the sitting's live view and on the test's page, but only while the first sitting is open. Before that, the existing edit, delete and reschedule paths already apply. After the window has closed, discarding stays the admin's reschedule path. This keeps a teacher from wiping graded results weeks later.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `online-test`: the requirement "A test can be changed only until it is first written" gains discarding as the one way a begun test returns to the unbegun state. It then follows the pool, is editable and can be deleted.
- `exam-record-maintenance`: a new requirement "An open test can be discarded". It sits beside ending, extending and rescheduling a sitting, and covers who may discard, the confirmation with the attempt count, what is deleted and what is announced.

## Impact

- `exam/tests.js`: a new `discardTest`. It ends the sitting and deletes attempts, sittings and notes in one transaction, then calls `dropSnapshot` and makes the test follow the pool again.
- `exam/routes-tests.js`: a new `POST /tests/:id/discard` with `{ attempts }`. It is open to teachers and announced to the students' streams and to the live view.
- `exam/live.js` / `exam/client/live.js`: a `discarded` event. The live view shows it and links back to the test.
- `exam/client/attempt.js`: the writing page reacts to the discard. It leaves full screen and shows the notice instead of the attempt.
- `exam/client/tests.js`: the discard button with its two-click confirmation on the test page.
- `i18n/de.json`, `i18n/en.json`: labels, the confirmation label with the count, the students' notice and the refusals.
- Tests: unit tests for `discardTest` and its refusals, and a browser check covering a teacher discarding a sitting while a student writes.
