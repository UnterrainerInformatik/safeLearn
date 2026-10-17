Source: Gerald's feedback from the production smoke-check of the gradebook on 2026-10-17 (no backlog entry).

## Why

The exam module went live in secureLectures on 2026-10-17, and the first real use showed two things. Its pages are reached by following links from page to page, so a teacher who wants another class's gradebook has to walk back up and down again. And the gradebook records results through a separate form, one test at a time, while what teachers actually keep is a sheet: one column per test or participation mark, one row per student. Both should be fixed now, before the first semester's results go in, because changing how results are recorded after teachers have filled in a semester is much harder.

## What Changes

- **A module top bar.** Every module page gets a second bar under the instance's top bar. From left to right it holds the school year, the class, the course and the gradebook. Each is a dropdown whose choices depend on what is chosen to its left, and each links to its overview table. Something new is created from the same bar, also from left to right: a new school year, a new class in the chosen year, a new course in the chosen class.
- **The gradebook as a sheet.** One column per assessment instead of a form per entry. A `+` at the top of each manual category (manual tests, participation, homework) adds a column with a name, a date and, for tests and homework, the maximum points, all shown in the column's header. Each student has one field per column. Columns are grouped by category, and within a category the newest is furthest right.
- **Saving on change.** A field is saved the moment it changes. Emptying a field removes that result. There is no "Save" or "Record" button in the gradebook.
- **A table that stays readable when it grows.** The student's name, the proposal, the override and the grade stay on the left and do not scroll. Everything else scrolls horizontally when the table is wider than the screen. A click on a row marks it, and marking another row unmarks the first, so the eye can follow one student across a wide sheet.
- **The same conventions in the module's other tables.** The class overview, the roster and the config sheet use the same row marking, the same fixed left columns where they have them, and save on change wherever a single field can be saved on its own. The hint "empty maximum: results in percent" moves out of the cells and above the table.
- **Arrow keys in the sheet.** Down and up move to the same column's field of the next or previous student, so a test or a round of `+`/`−` is entered down the list. Each category is a heading row above its columns.
- **The winter semester counts towards the year grade with a weight of its own.** The config sheet gets the winter semester's share of the year grade (50 % to begin with). The year proposal is the winter result times that share plus the summer semester's own result times the rest, and the summer semester's own result counts summer entries only. An overridden winter semester counts as the middle of its grade's range on the scale. **BREAKING** for the year grade: until now the summer proposal counted every entry of the year with equal standing.
- **Existing entries become columns.** Results already recorded (secureLectures holds none of its own after the smoke-check, but the migration must not depend on that) are grouped into columns by course, kind, date, maximum and note.

## Capabilities

### New Capabilities

- `exam-navigation`: the module's top bar, its cascading choice of school year, class, course and gradebook, links to each overview, and creating new records from it left to right.
- `gradebook-sheet`: assessment columns per category, recording a result per student and column, saving on change, the sheet's layout (fixed left columns, horizontal scroll, row marking), and the same table conventions applied to the module's other tables.
- `year-grade`: the winter semester's share in the year grade, how the year proposal combines both semesters, and what the year view shows of the winter result.

### Modified Capabilities

None. The capabilities this builds on (`gradebook`, `class-roster`) exist so far only in the change `exam-module`, which is not archived. The new requirements are written as capabilities of their own, so they do not modify a spec that is not yet in `openspec/specs/`. Where they replace behaviour that `exam-module` describes (the class-wide entry form, the per-entry note, the summer proposal counting every entry of the year), the replacement is stated in `gradebook-sheet`, and `exam-module`'s `gradebook` spec is brought in line before either change is archived (see design.md, D6).

## Impact

- **Code:** `exam/` only, plus one stylesheet rule set in `css/exam.css`. A new migration adds the assessment column and moves existing entries onto it. `exam/gradebook.js` and `exam/routes-gradebook.js` gain column routes and a per-cell write. `exam/client/` gets the top bar and the sheet, and the classes elements adopt the table conventions.
- **APIs:** new routes for columns and for a single cell. The batch entry route stays for the student record page and for the harness. The student's own results keep their shape. A result's label is now the column's name.
- **Proposals and grades:** the winter proposal is unchanged. The year proposal changes (`year-grade`). Columns change how results are entered and shown, not how a semester's own fraction is computed.
- **Online tests (P3, later):** a test written online will show up as a column of the online-test category. That category has no `+`.
- **Tests:** harness checks for the top bar, the sheet's save-on-change, row marking and the fixed columns. Unit tests for the column migration and the cell write.
- **Order:** this change is to be applied before P2 of `exam-module`, while the gradebook in production is still empty.
