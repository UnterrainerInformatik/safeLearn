Source: request by Gerald on 2026-10-24 (no backlog entry).

## Why

Teachers give short written tests between the big ones. Today these can only be entered as columns under **written tests** (`manualTests`). Within a category every column counts the same, so a six-point quiz weighs as much as a forty-point test. The short tests need a category with its own weight on the config sheet.

A fifth category also makes the sheet wider, and it is already too wide. A course with nine columns is 2253 px wide, and on a 1280 px screen only the leading columns and one result column are visible. The width comes almost entirely from the column headers. Each header stacks a name field, a date field with a calendar button, a maximum field and a delete button, so a column is 140–215 px wide while its result field needs about 3.5em. The leading headers ("Calculated proposal", "Teacher override") are wider than what they hold.

## What Changes

- New gradebook category **short tests** (de "Kurztests", en "Short tests"), with a column kind of its own. Its columns work like those of written tests: a name, a date and an optional maximum, with results in points or percent. It has its own `+` in the sheet and its own weight on the config sheet.
- Category order on the config sheet and in the sheet: online tests, written tests, short tests, participation, homework.
- Existing courses get a short-test weight of 0 %, so their weights still add up to 100 and no proposal changes. A new course starts at 20 % for each of the five categories.
- **The sheet becomes compact.** A column header shows its name, its date as day and month, and its maximum, as text only. Hovering over it shows the full name, the full date and the maximum (or "percent"). A column named by its date shows that date only once.
- Clicking an editable column's header opens a dialog, the same one the `+` uses, where the name, the date and the maximum are changed and the column is deleted. Every field of the dialog is saved as it changes, as before. Header inputs and the inline delete button go away.
- The leading columns get shorter headings, and an empty category takes up only a narrow placeholder column. The result fields keep their size and keyboard behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gradebook-sheet`: columns belong to one of four manual categories, short tests among them. A column's header is compact, with its details on hover, and is edited in a dialog opened from the header instead of in place. A new requirement covers short tests as a weighted category and the 0 % weight for existing courses.
- `year-grade`: the config sheet holds five category weights instead of four.

The category list in the `gradebook` delta of the unarchived change `exam-module` ("online tests, manual tests, participation, homework") is amended in place to name short tests. That change describes the gradebook as it will be when archived, and `gradebook` is not yet a main spec that a delta could modify.

## Impact

- `exam/migrations/012-short-tests.sql`: rebuilds `assessment` with the new kind `shorttest` in its CHECK. It also writes `shortTests: 0` into the weights of every existing course.
- `exam/grading.js` (`entryCategory`), `exam/classes.js` (`weightCategories`, `defaultWeights`), `exam/gradebook.js` (column kinds, doc comments).
- `exam/client/gradebook.js`: categories, `addableKinds`, compact `columnHead`, the column dialog (shared with `addColumn`), shorter leading headings. `exam/client/classes.js`: category labels.
- `css/exam.css`: the sheet's header and column widths.
- `i18n/de.json`, `i18n/en.json`: `exam.categories.shortTests`, shorter leading headings, the column dialog's texts.
- Tests: `test/exam-gradebook.test.js` (category, weights, migration), `test/exam-classes.test.js` (default weights), `test/exam.test.js` (sheet: header dialog instead of header inputs; short-test column end to end).
- `docs-exam-module.md`: the fifth category and editing a column through its header.
