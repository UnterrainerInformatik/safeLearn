## 1. Columns in the database

- [x] 1.1 Migration `004-assessment-columns.sql`: `assessment` table; rebuild `manual_entry` onto `assessment_id` with `UNIQUE (assessment_id, username)`; group existing entries by course, kind, date, maximum and note into columns named by the note or kind and date (design D1)
- [x] 1.2 Unit test: a database filled under schema 3 (several courses, both semesters, notes and none, points and fractions) migrates to 4 with every proposal, override and result unchanged, and one column per group
- [x] 1.3 `exam/gradebook.js`: create, change (rename, re-date, maximum with recomputation or refusal) and delete columns; upsert and delete one cell for `points`, `percent` or `mark` by the column's kind; course entries read through the columns; unit tests for each, including "two results in one column" and "maximum below a stored result"
- [x] 1.4 Migration 004 adds `course.winter_share` (default 50, 0–100); course API and config-sheet data carry it, validated as a whole percentage (design D10)
- [x] 1.5 `grading.js`: summer semester counts summer-dated entries only; `yearProposal` from the winter fraction (proposal, or the override's band midpoint on the current scale) and the summer's own fraction by the share; one side missing → the other; unit tests for the `year-grade` scenarios, shares 0 and 100, and a scale change moving the midpoint
- [x] 1.6 Overview, student record and a student's own results compute the year through `yearProposal` and answer the winter grade used (`winter: { grade, overridden }`); unit tests
- [x] 1.7 The overview answers `columns` in sheet order (category order of the config sheet, then date, then creation) and `results` per row, semester-filtered for WS; the student's own results carry the column's name and date instead of the note; unit tests

## 2. API

- [x] 2.1 Routes: `POST /courses/:id/assessments`, `PUT`/`DELETE /assessments/:id`, `PUT`/`DELETE /assessments/:id/results/:username` answering the recomputed row; remove `POST /courses/:id/entries` and `PUT`/`DELETE /entries/:id` (design D3); all behind `requireTeacher`
- [x] 2.2 Bring `exam-module`'s artifacts in line (design D8): its `gradebook` spec's manual-entry requirement and task 5.7 refer to columns; its summer-proposal rule and design D7's semester assignment point to `year-grade`

## 3. Table conventions in the client

- [x] 3.1 `client/frame.js`: row marking (click or focus marks one row per table, design D6), sticky leading columns with measured offsets re-measured on draw and on font-size/typeface change (D5), and a save-on-change field helper with one request in flight per field, queueing the latest value, and saving/saved/refused states (D4); leave-page prompt while a field is saving
- [x] 3.2 CSS in `css/exam.css`: marked row, sticky cells with the table's background in both themes, the sheet's own horizontal scroll wrapper, field states

## 4. The gradebook sheet

- [x] 4.1 Rewrite the `gradebook` element as the sheet: name, proposal, override (select, saved on change), grade on the left and sticky; two header rows, the category as a heading spanning its columns with its `+` (none for online tests), below it each column's name, date and maximum, editable in place, with delete; one field per student and column; percent hint once above the sheet; remove the class-wide entry form
- [x] 4.2 Arrow keys (design D9): down/up move to the same column's field of the next/previous student; right/left move to the next/previous column of the same student only with the cursor at the end/start of the text (empty field passes both ways), across category boundaries; the target's text is selected; the field left is saved; override not part of it; `+`/`−` as a one-character input that the arrows never change; points and percent fields as decimal text inputs the arrows do not step
- [x] 4.3 Year view: the winter grade (marked when overridden) as a fixed column beside the year proposal, summer columns only; the config sheet's winter-share field
- [x] 4.4 The `gradebook-student` page: override and comment as before, results listed read-only by column with a link to the sheet; remove its entry form
- [x] 4.5 Student results (`results` element and page): each result with its column's name and date

## 5. The module bar

- [x] 5.1 Server-side bar builder from the database: school year, class, course, semester as selects plus overview links, the current year by default, positions to the right cleared or empty as the spec says (design D7)
- [x] 5.2 Wire the bar into every `teacherPage` shell (`/exam/`, classes, courses, gradebook, student record, scale), not into `/exam/results` or embeds; sticky under the top bar; wraps below 700px
- [x] 5.3 Creating from the bar: new school year, new class in the chosen year, new course in the chosen class, each offered only with everything to its left chosen, opening the existing forms as dialogs and choosing the new record afterwards; remove the forms' old places where the bar replaces them
- [x] 5.4 Client script that turns a choice into navigation to the right page

## 6. The other tables

- [x] 6.1 Classes of a year, roster, config sheet, student record: row marking and a sticky first column; save on change where a field stands alone; config-sheet weights saved on change only while they add up to 100 %, with the sum shown otherwise

## 7. Verification and docs

- [x] 7.1 Harness (`test/exam.test.js`): the bar on teacher pages with the right values and links, choosing a class clears the course, creating a course from the bar, no bar for a student or a teacher in student view and none on `/exam/results`; the sheet: `+` adds a column, a typed result is stored without a save action and the row's proposal follows, emptying removes it, a refused value is marked and leaves the stored one, override saved on change, at most one marked row, the left four columns keep their position when the sheet scrolls; arrow down/up moves within a column, right/left moves across columns only at the text's edge and across a category boundary, the field left is saved, and no arrow changes a `+`/`−`; the category heading spans its columns; the year view shows the winter grade and the year proposal combined by the share; weights saved only at 100 %
- [x] 7.2 Update `test/coverage-map.json`, `docs-exam-module.md` (the bar, the sheet, columns instead of notes, arrow keys, the year grade with the winter share, the rollback note) and `AI/architecture.md` (routes, `assessment`)
- [ ] 7.3 `npm test` in both module configurations; then sync to secureLectures and check the log for the migration from 3 to 4 and its pre-migration copy
