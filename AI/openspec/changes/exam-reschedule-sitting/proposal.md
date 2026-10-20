Source: AI/open-proposals.md, entry **Eine vorbeigegangene Sitzung neu ansetzen** (raised by Gerald 2026-10-19, decided 2026-10-20).

## Why

A sitting whose window has passed can neither be moved nor deleted: changing and deleting a sitting is refused once it has opened. When a test runs empty because nobody wrote it, or has to be repeated, the only way out today is a make-up sitting, which needs a participant list, cannot choose its own duration, and leaves the old sitting standing as "over". Gerald wants to set the same sitting again on another day, keeping its settings, with any results of it gone.

## What Changes

- **A sitting that is over offers "Reschedule".** It opens the existing sitting form, pre-filled with the same periods, the same duration and the same participants, with the next weekday proposed as the date. Only the window can be changed; duration and participants stay.
- **Saving moves the window and deletes the sitting's attempts** in one transaction. The deleted attempts are gone for good; the daily backup is the only trace (decided 2026-10-20).
- **Without attempts** any teacher may reschedule, with a single save. **With attempts** only an admin may, and the save button needs a second click whose label names the number of attempts ("Click again: delete 3 attempts and reschedule"). The server refuses if the number of attempts differs from the one confirmed.
- **Make-up sittings of the test stay as they are.** Rescheduling affects only the chosen sitting, which may itself be a make-up.
- **The gradebook column follows the new date,** also across the semester boundary, because a test's column and usage are dated by its earliest sitting.
- Participants who have left the class roster since are dropped from the rescheduled sitting; if nobody is left, it is refused.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `exam-record-maintenance`: adds the requirement that a sitting that is over can be rescheduled, with the permission and confirmation rules above.

## Impact

- `exam/tests.js`: a new `rescheduleSitting`; `exam/attempts.js` deletes a sitting's attempts the way `deleteAttempt` deletes one.
- `exam/routes-tests.js`: `POST /api/sittings/:id/reschedule` behind the teacher gate, with the admin check when attempts are deleted; announced to the students' streams and the sitting's live view.
- `exam/client/tests.js` and `exam/client/periods.js`: the button on an over sitting, the pre-filled form, the next-weekday default, the armed second click.
- `i18n/en.json`, `i18n/de.json`: new keys under `exam.tests`.
- `test/exam-tests.test.js` and the harness checks of the test page.
- Compatible with the planned change "snapshot only when a test begins" (AI/open-proposals.md): once a test's last attempt is deleted, it counts as not started again.
