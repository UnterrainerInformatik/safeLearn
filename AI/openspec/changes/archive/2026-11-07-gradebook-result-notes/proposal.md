## Why

A grade on its own often needs a word of explanation: "You forgot GreetingService.java (-1). Otherwise great." Today the gradebook can only hold such a text once per semester, in the override's comment. There is no place for it at the result it explains, and the student never sees it beside that result. Teachers write it somewhere else or not at all.

## What Changes

- **A note per cell.** Every cell of the sheet - one student in one column - can hold a short note of up to 4000 characters. This holds for every column kind: online tests, manual tests, short tests, presentations, a project's end grade, a project's `+`/`−` columns, participation and homework.
- **A note does not need a result.** A note can stand in a cell without a value, for example "Not handed in, due Friday". Emptying a cell's value leaves its note in place, and removing the note leaves the value in place.
- **The sheet gives the note no room, except in the active column.** A cell holding a note shows a small note mark, and hovering it shows the text. The column holding the cursor opens a note field of about 20 characters for every student, right of the result field. It is saved as it changes, like every other field, and the arrow keys move through it. Enter inserts a line break in a note; in a result field, Enter moves down to the next student, like the down arrow. When the cursor leaves the column, its note fields close again. There is no popup and no extra button. An emptied note field removes the note. In an online-test column, whose results cannot be edited in the sheet, a click on a cell opens the column, and the note is the only thing a teacher can set there.
- **The student sees the note.** In the student's own results, each result shows its note beside it. A column in which the student has only a note, and no result, is shown to them with an empty result and the note. A note counts in no calculation. A category weighted 0 % hides its notes along with its results.
- **The teacher's student page** shows each result's note too.
- Deleting a column, an offline test's column or a project deletes its notes with it. Deleting an online test does the same. The retention purge counts a leaver's notes and deletes them with their other records.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gradebook-sheet`: Enter in a result field moves down; a note per cell, the note mark and the active column's note fields, notes in online-test columns, deleting notes with their column, the student seeing a column by its note.
- `gradebook`: a student sees each result's note beside it, and a note counts in no proposal.
- `school-year-change`: the retention purge reports and deletes notes as a record kind of their own.

## Impact

- `exam/migrations/016-result-notes.sql`: a new table `result_note` with one row per cell, keyed by student and either a manual column (`assessment_id`) or an online test (`test_id`), and its closed-year triggers.
- `exam/gradebook.js`: reading notes into the sheet's rows, the student record and the student's own results; setting and removing a note; deleting notes with a column.
- `exam/routes-gradebook.js`: routes to set and remove a note.
- `exam/tests.js` (`deleteTest`), `exam/retention.js` (record kind `notes`).
- `exam/client/gradebook.js`: the note mark, the active column's note fields and their arrow-key movement, the note in the student record and in the student's own results.
- `css/exam.css`: the note mark, the note field and the note in the results.
- `i18n/de.json`, `i18n/en.json`: labels, the refusal of a note that is too long, the retention report's new kind.
- Tests: `test/exam-gradebook.test.js`, `test/exam-tests.test.js`, `test/exam-offline.test.js`, `test/exam-year-change.test.js`, `test/exam.test.js` (browser harness).
- `docs-exam-module.md`.
