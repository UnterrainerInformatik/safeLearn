Source: AI/open-proposals.md

## Why

While a sitting runs, the teacher notices things the figures in the live view cannot capture, such as "I think they cheated, look into it, maybe copied from xxx". Right now there is nowhere to write that down except the cell note in the sheet, and the student sees that one. Separately, three checks in `test/exam.test.js` have failed on every run since `757c494`, so `npm test` cannot be green and new regressions in the live view would go unnoticed. Both touch the same live view, so they go into one change.

## What Changes

- **Teacher note per participant in the live view.** Every participant row in the live view of a sitting (online and offline) gets a note field for teachers. It is saved as it changes, like the fields of the sheet. The note belongs to the student and the test, not to one sitting. It stays there after the sitting is over, and it comes along into a make-up sitting of the same test.
- **Only teachers see it.** It never reaches a student: not on the attempt page, not under *My tests*, not in their results and not over any student API. It does not appear on the view for the class (projector). It is kept apart from the cell note in the sheet and does not change it.
- **It counts in no calculation**: no effect on order, status, row colour, grade or proposal.
- **It is personal free-text data.** The note is read-only in a closed school year. It is deleted by the retention purge, and the year change reports it as a kind of its own.
- **The three exam harness checks pass again**: the tick-share format (`97%` vs. `97 %`), the timeout in the live view's sort check, and the missing handout link of an offline sitting under `/exam/my`. Each one is either fixed in the app or the check is corrected, depending on which side is wrong. The entry about them is removed from `AI/open-proposals.md`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `online-test`: new requirement "Teachers note participants in the live view", which covers online and offline sittings, only teachers see the note, and it counts in no calculation.
- `offline-test`: new requirement saying that the attendance table of an offline sitting holds the same teacher note.
- `school-year-change`: the retention purge also deletes teacher notes and counts them as a kind of its own. A closed year makes them read-only.

## Impact

- **DB**: new migration `018-teacher-notes.sql` with table `teacher_note (test_id, username, text, …)`, closed-year triggers following the pattern of `016-result-notes.sql`, and an index for the purge.
- **Server**: `exam/live.js` / `exam/routes-live.js` (the note in the snapshot and stream, plus a route to write it), `exam/retention.js` (counting and deleting).
- **Client**: `exam/client/live.js` (note field and mark in the row), `i18n/` (BabelEdit keys for en/de).
- **Tests**: `test/exam.test.js` gets new checks for the note (teacher only, not on the student side, not on the class view, closed year, purge) and fixes for the three red checks.
- **Not affected**: the sheet (`gradebook-sheet`), `result_note`, grading.
