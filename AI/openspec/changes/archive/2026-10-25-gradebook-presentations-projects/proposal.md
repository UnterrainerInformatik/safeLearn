Source: AI/open-proposals.md — "Weitere Leistungsarten: Referate, Projekte, und 0 % blendet eine Kategorie aus"

## Why

Two kinds of assessment have no place in the gradebook yet. One is a **presentation** (Referat): it is graded with a single grade, not with points. The other is a **project**: it gets an end grade, and while it runs the teacher keeps `+`/`−` notes on it. Teachers enter both offline today, beside the sheet.

The weights on the config sheet can already be changed at any time. But a category set to 0 % still shows everywhere: as a column group with its `+` in the sheet, and as a category line in the student's view. With seven categories, the sheet must stay readable, so a course should only show the categories it actually uses.

## What Changes

- **A category weighted 0 % is not in use, and is hidden.** The sheet shows no group for it, no `+` and no category line. Neither does a student's record, the student's own results, or the choice of category for an offline test. The config sheet keeps showing every category with its weight, so a hidden one can be brought back. The results of a hidden category stay stored. They reappear with the category once its weight is above 0 %, and they never count while it is 0 %.
- **New category: presentations** (de "Referate", en "Presentations"). It has its own weight and `+`, and any number of columns. Each column takes **one grade from 1 to 5** per student. A grade counts in the proposal as the middle of its band on the grading scale, the same way an override of the winter semester counts in the year grade. It follows a change of the scale.
- **New category: projects** (de "Projekte", en "Projects"). It has its own weight and `+`, and any number of projects. A project's **end grade** is entered by the teacher, one grade from 1 to 5 per student, and counts like a presentation's grade. Each project can hold any number of **`+`/`−` columns**. They are for the record only and do not enter any calculation. In the sheet, a project is a group of its own: its `+`/`−` columns come first, then its end grade, under one heading with a `+` for another `+`/`−` column. Deleting a project deletes its `+`/`−` columns and their marks.
- Category order: online tests, manual tests, short tests, presentations, projects, participation, homework.
- Existing courses get 0 % for presentations and projects, so none of their proposals changes and neither category shows until a teacher gives it a weight. A new course also starts with both at 0 %, and with 20 % for each of the other five.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gradebook`: results can be a grade, whose fraction is the band midpoint on the current scale. The proposal's categories include presentations and projects. Project `+`/`−` marks are results that count nowhere.
- `gradebook-sheet`: two new categories with their columns. A project is a column group with its own `+`/`−` columns. A 0 % category is hidden in the sheet, in a student's record and in the student's own results.
- `year-grade`: the config sheet holds seven category weights instead of five.
- `offline-test`: the choice between test and short test offers only the categories in use.

## Impact

- `exam/migrations/014-presentations-projects.sql`: rebuilds `assessment` with the kinds `presentation`, `project` and `projectmark` and a nullable `project_id` (a mark column's project). Adds `manual_entry.grade`. Writes `presentations: 0, projects: 0` into every course's weights, closed years included, the way `012` did.
- `exam/grading.js` (`entryCategory`, the band midpoint for grade results), `exam/classes.js` (`weightCategories`, `defaultWeights`), `exam/gradebook.js` (column kinds, grade results, project grouping and cascade delete, hiding 0 % categories in every view), `exam/tests.js` (offline column kinds in use).
- `exam/client/gradebook.js` (categories, grade fields, the project group, hiding), `exam/client/classes.js` (labels), `exam/client/tests.js` (offline category choice).
- `css/exam.css`: the project group's headings.
- `i18n/de.json`, `i18n/en.json`: category labels, the grade field, the project dialog, refusals.
- Tests: `test/exam-gradebook.test.js`, `test/exam-classes.test.js`, `test/exam-tests.test.js`, `test/exam.test.js`.
- `docs-exam-module.md`.
