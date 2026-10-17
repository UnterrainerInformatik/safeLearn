## Context

See proposal.md for the motivation. This change works only inside the exam module as `exam-module` P0, P1 and P4 left it (commits `ed10e45`, `5723a8d`, `cdbcec0`):

- **Data.** `manual_entry` holds one row per result: course, student, kind, fraction `value`, optional `points`/`max_points`, `entered_on`, `note`. Proposals are computed on read (`exam/grading.js`, `exam/gradebook.js`) and are not touched here.
- **Pages.** Module pages are server-rendered shells (`wrapInPage` with `title` and `wide`) holding one placeholder that a custom element from `exam/client/` fills. Navigation today is a breadcrumb link to `/exam/` plus links inside the elements.
- **Client.** Vanilla ES modules and custom elements, no build, a small `h()` DOM builder in `client/frame.js` (`exam-module` design D4). Every action goes through `/exam/api/*` and is decided on the server.
- **Gate.** Teacher pages pass `teacherPage`, the API `requireTeacher`. A teacher in student view gets neither (`exam-module` D5).
- **Production.** secureLectures runs with the module on since 2026-10-17. Its gradebook held only the smoke-check's entry, which was deleted again.

## Goals / Non-Goals

**Goals:**

- Columns as a first-class record, so a test is named, dated and given its maximum once and not per student.
- A sheet that a teacher can fill in by tabbing through fields, with no save button and no lost input.
- One navigation bar that works the same on every teacher page.

**Non-Goals:**

- Copy and paste of ranges, or undo. Arrow movement is D9's. Tab and Shift+Tab move along a row as the browser does.
- Live updates when another teacher edits the same sheet. The last write wins per field, and a reload shows the other teacher's values.
- A per-student note on a single result. The column's name is what the student sees (see D2).
- Changing how a semester's own fraction is computed. Only the year proposal changes (D10).

## Decisions

### D1 — `assessment` is a table of its own, and a result references it

Migration `004-assessment-columns.sql`:

- `assessment (id, course_id, kind, name, held_on, max_points NULL, created_at)`. `kind` is `test`, `plusminus` or `homework`, the same values as before. Online tests become rows of their own kind in P3.
- `manual_entry` is rebuilt (SQLite cannot add a NOT NULL foreign key in place) as `(id, assessment_id, username, value, points NULL, created_at, updated_at)` with `UNIQUE (assessment_id, username)`. Kind, date, maximum and note move to the column.
- Existing rows are grouped by `(course_id, kind, entered_on, max_points, note)` into one `assessment` each. The name is the note, or else `<Kind> <date>`. Their `value` and `points` are copied unchanged, so every proposal stays the same. `exam/db.js` already writes a pre-migration copy.

*Alternative:* keep `manual_entry` as it is and derive columns by grouping on read. That needs no migration, but then a column cannot be renamed or re-dated as one thing, and two tests of the same day with the same maximum would merge. Rejected.

### D2 — The column's name replaces the note

A result has no note of its own any more. The student sees the column's name and date beside the result (`gradebook-sheet`, "The student sees a result by its column"). This is what the note was used for in practice ("1st test"). A remark about one student's result belongs in the semester comment, which has its own visibility switch.

### D3 — Writing is per field: one cell, one request

- `PUT /exam/api/assessments/:id/results/:username` with `{ points }`, `{ percent }` or `{ mark }`, depending on the column, upserts the cell. `DELETE` on the same path removes it. Both answer the student's recomputed row (categories, proposal, override, grade), so the client redraws that row without reloading the sheet.
- `POST /exam/api/courses/:id/assessments`, `PUT /exam/api/assessments/:id` and `DELETE /exam/api/assessments/:id` create, change and delete a column. A changed maximum recomputes every `value` from the stored `points` in one transaction, or is refused if any `points` exceed it.
- `GET /exam/api/courses/:id/gradebook?semester=` additionally answers `columns` (ordered as the sheet shows them) and per row `results: { <assessmentId>: { value, points } }`. Only columns dated in the semester are part of an answer: the WS answer has the winter's columns, the SS answer (the year) the summer's, as `year-grade` asks of the year view (D10).
- The batch route `POST /courses/:id/entries` and `PUT`/`DELETE /entries/:id` are removed together with the class-wide form and the per-student entry form. The student record page keeps its override and comment and lists the results read-only, with a link to the sheet.

*Alternative:* keep the batch route and send the whole row on each change. That needs fewer routes, but a teacher tabbing quickly would send overlapping whole-row writes, and the last of them could undo an earlier field. Per-cell writes cannot overwrite each other.

### D4 — Save on `change`, serialized per field

The client writes on the field's `change` event, not `input`, so a value is sent once it is complete (on leaving the field, or on Enter). Each field holds at most one request in flight and queues the latest value behind it, so a slow answer never overwrites a newer one. A field shows three states via a class: saving, saved (briefly), refused (it keeps the typed value, adds the server's reason as `title` and a visible mark, and leaves the stored value untouched until the teacher corrects it or reloads). The override is a `<select>` with the same behaviour.

### D5 — Fixed left columns with `position: sticky`, offsets measured once per draw

The sheet sits in its own wrapper with `overflow-x: auto`, so the scrollbar belongs to the sheet and not to the page (`gradebook-sheet`). Name, proposal, override and grade get `position: sticky` with a `left` offset each. The offsets are measured from the rendered widths of the cells before them, once after each draw, and set as inline styles. Fixed widths would truncate long names. The sticky cells get the table's background, so scrolled cells do not show through, in both themes. The same helper serves the other tables, for their first column.

*Alternative:* two tables side by side, a fixed one and a scrolling one. That has no sticky support issue, but row heights have to be synchronized by script. All target browsers support `sticky` on table cells, so this is rejected.

### D6 — Row marking is client state only

A click (or focus) on a row sets one `is-marked` class on that row in that table and removes it from the previous one. It is not stored and not sent anywhere. One small helper in `client/frame.js` is used by every module table.

### D7 — The module bar is rendered on the server

The bar is built in the page shell from the database, synchronously like every other module read: years, the classes of the chosen year, the courses of the chosen class, and the semesters. Each page passes what it shows (year, class, course, semester), and the bar fills in the rest: the current year when none is given. Each position is a `<select>` plus a link to its overview, and a small client script turns a choice into navigation to the right URL. The "new …" entries open the existing creation forms, moved into small dialogs reached from the bar. The bar is therefore present as the page is first shown (`exam-navigation`) and costs no extra request. It is only built inside `teacherPage` routes, so a student, or a teacher in student view, never receives it. The bar sits as the first element of the content area with `position: sticky; top: <top bar height>`.

*Alternative:* a client element that loads the choices from `/api/years` etc. That would cost three requests per page and show an empty bar first. Rejected.

### D8 — `exam-module`'s own artifacts are brought in line

`exam-module` is still open and describes the per-entry form and note in its `gradebook` spec (requirement "Teachers enter manual results per student") and in tasks 5.7 (online-test results). As part of this change, those passages are edited to refer to columns: a manual entry is a result in a column, and an online test's fraction lands in that test's column. Its `gradebook` requirement that the summer proposal uses every entry of the school year, and design D7's "Semester assignment", are edited to point to `year-grade` (D10). That way neither change's spec contradicts the other when they are archived.

### D9 — Arrow keys move between result fields; `+`/`−` is a one-character input

- The sheet's result fields carry their row and column index (the column index counting across categories, in display order). A `keydown` handler on the sheet moves the focus for ArrowDown and ArrowUp to the same column in the next or previous row. ArrowRight and ArrowLeft move to the next or previous column of the same row, but only when `selectionStart === selectionEnd` and that position is at `value.length` (right) or `0` (left). So inside `17.5` the arrows keep moving the cursor, and an empty field passes either way. After a move the target field's text is selected, so typing replaces it, as in a spreadsheet. Moving the focus fires `change` on the field left, so D4 saves it with no extra code path. The override select is not indexed and takes no part.
- The fields are text inputs (below), not `type="number"`. Number inputs do not expose `selectionStart`, so the edge check would be impossible.
- A `+`/`−` field is a text input of one character, not a `<select>`. A select changes its value on the arrow keys, which would turn "move to the next student" into "change this student's mark". The input accepts `+` and `-` (and `−`, normalized), and the minus sign is shown as `−`. Anything else is refused at the field before any request. Emptying it removes the mark.
- In a points or percent field the arrows would otherwise step a `type="number"` input's value. The handler prevents that default, so the arrows only move. The fields stay `inputmode="decimal"` text inputs, so the keyboard on a tablet is numeric.

### D10 — The year proposal combines the two semesters by the course's winter share

- Migration 004 also adds `course.winter_share INTEGER NOT NULL DEFAULT 50 CHECK (winter_share BETWEEN 0 AND 100)`. It sits beside the weights JSON, not inside it, because the four category weights must add up to 100 and the share must not take part in that sum. The config sheet shows it as its own field, saved as it changes (`gradebook-sheet`).
- `grading.js` keeps `proposal()` for one semester, now always over that semester's own entries: `entriesOfSemester(..., "ss")` returns summer-dated entries only. A new pure `yearProposal(winter, summerFraction, share, scale)` takes the winter's fraction (the proposal's, or the override's band midpoint) and returns the combined fraction and grade.
- The midpoint of a grade's band is `(min + upper) / 2` on the scale, where `upper` is the next better grade's threshold and 100 for grade 1. It is computed from the current scale, so it follows a scale change like every other proposal.
- `courseOverview(…, "ss")`, `studentRecord` and `resultsOf` compute the year via `yearProposal`. Each also answers the winter grade it used (`winter: { grade, overridden }`) for the year view's extra column.
- Unit tests cover the three scenarios of `year-grade`, a share of 0 and of 100, and a scale change moving the midpoint.

## Risks / Trade-offs

- [The migration rebuilds `manual_entry` on a production database] → It runs inside one transaction with the pre-migration `VACUUM INTO` copy before it (`exam-module` D2). The unit tests migrate a database filled under schema 3 and compare every proposal before and after. secureLectures holds next to no entries yet, which is the reason to apply this change now.
- [Save on change hides a failed write] → A refused or failed write stays marked at its field until it is corrected. A field still saving when the page is left triggers the browser's "leave page?" prompt.
- [Two teachers in the same sheet] → The last write wins per cell, never per row (D3). This is accepted, as for every other module record.
- [Sticky offsets wrong after a font-size change] → The offsets are re-measured after every draw and on the page's font-size and typeface change. Those are the only things that change cell widths without a draw.
- [The year grade changes meaning for a course already graded] → No production course has a summer semester yet. The first year grade is in July 2027. The docs state the new rule.
- [The bar's selects on a narrow screen] → Below 700px the positions wrap onto two lines. The sheet itself scrolls in its wrapper.

## Migration Plan

1. Merge to safeLearn, sync to secureLectures (module stays on). At start-up the module copies the database and then migrates it to schema 4.
2. Check the log for `Migrated … from schema version 3 to 4` and the pre-migration copy in `exam-backups/`.
3. **Rollback:** this needs the previous image and the pre-migration copy, because an older image refuses a schema-4 database (`exam-foundation`). Restore the copy as `docs-exam-module.md` describes.
