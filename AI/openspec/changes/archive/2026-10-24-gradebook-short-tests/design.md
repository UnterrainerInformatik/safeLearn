## Context

See proposal.md for the motivation. State found on 2026-10-24 (`4b8f64a`):

- **Categories** are spelled out in four places. `exam/grading.js:21` has `entryCategory` (kind → category). `exam/classes.js:93` has `weightCategories` and `defaultWeights` (25 each). `exam/client/gradebook.js:21` has `categories` and `addableKinds`. `exam/client/classes.js:20` has the labels. The config sheet takes its rows from `course.categories`, which the server sends.
- **Kinds** are fixed by a CHECK in the `assessment` table: `kind IN ('test', 'plusminus', 'homework')` (`exam/migrations/004-assessment-columns.sql:13`). `manual_entry.assessment_id` references `assessment(id)`. No other table references `assessment`.
- **Migrations** run with `PRAGMA foreign_keys = ON`, each file inside its own transaction (`exam/db.js:59`, `:130`). Foreign keys cannot be switched off inside a transaction.
- **Weights** are stored as JSON in `course.weights` (default `'{}'`) and read as `{ ...defaultWeights, ...stored }` (`exam/classes.js:536`). A course whose stored JSON lacks a key therefore takes that key's default.
- **Sheet**: `columnHead` (`exam/client/gradebook.js:278`) puts a name input, an `sl-date-input`, a maximum input and a `confirmButton` into every editable header. `addColumn` (`:525`) builds a `<dialog>` with the same three fields for a new column. Measured on a course with 3 test, 4 participation and 2 homework columns: the headers are 143–215 px wide, the leading columns 144/190/166/128 px, and the table 2253 px. The leading headings show in Title Case ("Calculated Proposal") even though `exam-ui-conventions` asks for sentence case, because the content table's `th` styling capitalizes. `.sl-exam-column-head` already resets this.
- A participation column added without a name stores its ISO date as its name ("2026-09-17"). The header then shows that ISO string above the formatted date.

## Goals / Non-Goals

**Goals:**
- Add the category with a schema and weight migration that leaves every existing proposal unchanged.
- Keep the column dialog as one piece of code for adding and for editing.

**Non-Goals:**
- Converting existing written-test columns into short tests. A teacher who wants to move them deletes them and re-enters them (there is no "change kind").
- Changing the result fields, the arrow-key movement or the sticky leading columns.
- Changing the student's own results view beyond the new category label it picks up automatically.

## Decisions

### D1: A kind `shorttest` for the category `shortTests`

Kinds and categories already differ (`test` → `manualTests`, `plusminus` → `participation`). The new pair follows that pattern: kind `shorttest`, category `shortTests`. It is added to `entryCategory`, `weightCategories` (after `manualTests`), the client's `categories`, `addableKinds` and the labels. `columnMax` treats it like `test`. The new pair gets no special case anywhere. Every rule that is not about `plusminus` already covers it.

### D2: Rebuild `assessment` and `manual_entry` together, with foreign keys left on

Changing the CHECK requires a new `assessment` table. Dropping the old one while `manual_entry` still references it fails with foreign keys on, and the runner cannot switch them off inside the migration's transaction. So migration `012-short-tests.sql` rebuilds both:

1. Create `assessment_next` with the extended CHECK, copy every row with its id.
2. Create `manual_entry_next` referencing `assessment_next`, copy every row with its id.
3. Drop `manual_entry` (a child, nothing depends on it), then `assessment` (no longer referenced).
4. Rename `assessment_next` → `assessment`. SQLite rewrites the reference in `manual_entry_next`.
5. Rename `manual_entry_next` → `manual_entry`.
6. Recreate the indexes `assessment_course` and `manual_entry_username`.

Ids are kept, so links like `/exam/assessments/:id` and the online tests' read-only columns are unaffected. The runner already writes a backup before any pending migration.

*Alternative:* teaching the runner a per-file "foreign keys off" marker for the official 12-step rebuild. That costs more code in the runner for a single migration, and with the rebuild of both tables it is not needed.

### D3: Existing courses get `shortTests: 0`, materialized in the same migration

`UPDATE course SET weights = json_set(json_patch('{"onlineTests":25,"manualTests":25,"participation":25,"homework":25}', weights), '$.shortTests', 0)`.

`json_patch` first writes the old defaults into any course whose JSON lacks a key (`'{}'` included). Without it, such a course would read the *new* defaults after the change (20 each, plus short tests at 0) and add up to 80 %. Afterwards every course stores all five keys, and `defaultWeights` becomes 20 each for new courses only.

### D4: The header is a button that opens the column dialog

`columnHead` for an editable column renders a `th` holding one `<button class="sl-exam-column-edit">`. The button contains the name, the short date (if the name is not the date) and `/max` as lines of text. A click opens `columnDialog(course, column)`. `addColumn` becomes `columnDialog(course, null, category)`, so both share the fields and their checks:

- **New column** (`column === null`): a form with submit, as today.
- **Existing column**: the same fields, each wrapped in `saveOnChange` against `PUT /assessments/:id` exactly as the header fields are today, so saving, saved and refused are marked in the dialog. Below them sits the existing `confirmButton` for deleting. Closing the dialog reloads the sheet if anything was saved, because a new date can move the column or take it out of the semester.

The header's `title` holds the full name, the full date (`format.date`) and the maximum or "percent". The read-only headers (online tests, left students) get the same text and `title`, but no button. An online-test header keeps its link to the test.

*Alternative:* a popover anchored at the header. It is wider than the column anyway, so the native `<dialog>`, which the module already uses and which works on a tablet, is the simpler choice.

### D5: Day and month from the format module

`createFormat` (`i18n/format.js:124`) already builds a day–month formatter inside `weekday`. It is exposed as `format.dayMonth(iso)` ("27.09." / "09/27"), so the header follows the reader's format like every other date (`locale-formats`). A column whose name equals its ISO date shows only `dayMonth`.

### D6: Widths in CSS, not in code

- `.sl-exam-column-edit` is styled as plain header text (no border, inherits font, `text-align: left`, a pointer cursor and a hover or focus underline), with `white-space: nowrap`. Names longer than about 10em are cut with an ellipsis; the full name is in the `title`.
- An empty category's placeholder `th` shows only "–", with its text in `title`.
- The leading headings get `text-transform: none`, so they are in sentence case.
- They also get shorter labels, in every place they are used: de `Vorschlag` / `Festgelegt` / `Note`, en `Proposal` / `Override` / `Grade`. Under "one wording per thing" the student's page uses the same keys, so it changes with them.

## Risks / Trade-offs

- [Editing a column now takes one click more than before] → Renaming is rare compared with entering results. The dialog keeps saving each field on change, so there is no extra "save" click.
- [Shorter labels lose meaning ("Festgelegt")] → The `title` of each leading heading carries the long form, which also documents it for new teachers. Gerald can still change the wording in BabelEdit.
- [The rebuild of `manual_entry` touches every result] → Ids, values and points are copied unchanged. A test compares a database migrated from version 9 against its pre-migration copy (counts, ids, every proposal of a seeded course).
- [Browser checks that type into header inputs break] → They are rewritten to open the dialog. That is the behavior change itself.

## Migration Plan

Deploy as usual. The runner backs up the database, applies `012-short-tests.sql` in one transaction, and the server starts. To roll back, restore the backup the runner wrote (`exam-backups/`) and deploy the previous image. An older image refuses the newer schema by design (`NewerSchemaError`), so a rollback without restoring is not possible and not silent.
