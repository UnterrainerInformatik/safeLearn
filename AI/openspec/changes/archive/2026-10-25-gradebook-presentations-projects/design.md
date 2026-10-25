## Context

See proposal.md for the motivation. State found on 2026-10-25 (`7665445`):

- **Categories** are spelled out in four places. `exam/grading.js:21` has `entryCategory` (kind → category). `exam/classes.js:100` has `weightCategories` and `defaultWeights` (20 × 5). `exam/client/gradebook.js:21` has `categories`, `categoryLabels` and `addableKinds`. `exam/client/classes.js:20` has the labels. The config sheet takes its rows from `course.categories`, which the server sends. `entryKinds` in `exam/gradebook.js:29` is derived from the keys of `entryCategory`.
- **Kinds** are fixed by a CHECK in `assessment`: `kind IN ('test', 'shorttest', 'plusminus', 'homework')` (`exam/migrations/012-short-tests.sql`). `012` rebuilt the table under the runner's `-- foreign_keys: off` marker (`exam/db.js:89`). It dropped and recreated the closed-year triggers of `assessment` and `manual_entry` around the rebuild. `test.assessment_id` (from `013`) also references `assessment` now.
- **Results**: `manual_entry.value REAL NOT NULL CHECK (0..1)`, plus `points` for a column with a maximum. A result is turned into `{ value, points }` by `normalizeResult` (`exam/gradebook.js:268`). `plusminus` is the only special case.
- **Band midpoint**: `bandMidpoint(grade, scale)` in `exam/grading.js` already turns a grade into a fraction on the current scale. The year grade uses it for a winter override, on read.
- **Weights** are stored as JSON in `course.weights` and read as `{ ...defaultWeights, ...stored }` (`exam/classes.js:589`). `normalizeWeights` requires every category in `weightCategories`, whole numbers from 0 to 100, with a sum of 100. `weightedMean` gives a category weighted 0 no influence, so a 0 % category already counts nowhere. It is only still *shown*.
- **Sheet**: `courseOverview` answers every column and each row's `categories`. The client groups columns per `categories` (`exam/client/gradebook.js:219`) and draws one heading per group with weight and `+`. The student record (`:768`) and the student's own results (`:949`) list categories from the same constant.
- **Offline tests** create their column with kind `test` or `shorttest` (`exam/tests.js:803`, `offlineColumnKinds`). The form offers both (`exam/client/tests.js:223`).

## Goals / Non-Goals

**Goals:**
- Two new categories and the project grouping, with a migration that leaves every existing proposal unchanged.
- Hiding a 0 % category from one rule that every view uses, without deleting anything.

**Non-Goals:**
- Letting project `+`/`−` marks move the end grade by a formula. Gerald decided on 2026-10-25 that they are notes for the record. The teacher weighs them into the end grade they type.
- Proposing an end grade from anything. It is always typed.
- Hiding online tests outside the gradebook. The tests page, sittings and the live view stay as they are when online tests weigh 0 %. A test can still be written, for practice for example, and its column simply does not show in the sheet. This is the one deliberate limit of "hidden everywhere". If Gerald wants the "new online test" button gone too, that is a small follow-up.
- Changing the kind of an existing column (for example turning a test column into a presentation).

## Decisions

### D1: Three new kinds, two new categories

| kind | category | field | maximum |
|---|---|---|---|
| `presentation` | `presentations` | grade 1–5 | none |
| `project` | `projects` | grade 1–5 (end grade) | none |
| `projectmark` | — (counts nowhere) | `+`/`−` | none |

`entryCategory` gets `presentation` and `project`. `projectmark` is not a key there, because a key there means "counts in this category". `entryKinds` therefore becomes an explicit list: the keys of `entryCategory` plus `projectmark`. `weightCategories` becomes `onlineTests, manualTests, shortTests, presentations, projects, participation, homework`. `columnMax` refuses a maximum for all three new kinds, as for `plusminus`.

### D2: A mark column points at its project through `assessment.project_id`

`assessment` gains `project_id INTEGER REFERENCES assessment (id)`, set for a `projectmark` column and NULL for every other column. A CHECK enforces `(kind = 'projectmark') = (project_id IS NOT NULL)`. `createColumn` with `kind: "projectmark"` requires a `projectId` that names a `project` column of the same course. Everything else is refused.

A project is therefore an ordinary column (its end grade) with child columns, not a table of its own. Because a project is itself a column, the result routes, the closed-year triggers, the retention purge and the backup cover it unchanged.

*Alternative:* a `project` table, with the end grade and the marks as columns pointing at it. This needs a second id space, routes for it, and its own closed-year triggers, all for a name and a date that a column already has.

### D3: Grade results keep the grade, and the fraction is computed on read

`manual_entry` gains `grade INTEGER CHECK (grade IS NULL OR grade BETWEEN 1 AND 5)`. For `presentation` and `project`, `normalizeResult` takes `{ grade }` (a whole number 1–5) and stores the grade. It also stores `value = bandMidpoint(grade, scale)` at write time, because `value` is NOT NULL.

On read, `entryFromRow` replaces `value` with `bandMidpoint(grade, readScale())` for every row with a grade. A scale change thus moves every grade result at once, the same way the winter override already moves in `winterContribution`. The stored `value` of a grade result is never read. It only satisfies the column constraint. The entry's `grade` field is the typed grade, not `gradeFor(value)`. For a midpoint the two agree anyway, but the typed grade cannot drift.

*Alternative:* updating the stored values inside `updateScale`. That fails on closed years, whose triggers refuse updates to `manual_entry`, and it would make a closed year's figures move in one place and not in another.

### D4: Hidden means "weight 0", decided on the server

One helper `categoriesInUse(course)` returns `weightCategories.filter((c) => course.weights[c] > 0)`. It is applied on the server, so no client can show a hidden category by mistake:

- `courseColumns` leaves out columns whose category is not in use. A `projectmark` column follows its project, so a mark is hidden whenever projects are hidden.
- `courseOverview`, `studentRecord` and `resultsOf` drop entries and `categories` of categories not in use. `resultsOf` drops them from `entries` as well. Proposals need no change, because a weight of 0 already counts nowhere (see Context).
- `getCourse` keeps sending `categories` (all seven, for the config sheet). Next to it, it sends `categoriesInUse`, which the sheet and the record use for their groups and category lines instead of the client constant.
- `createColumn` refuses a kind whose category is not in use (`exam.errors.gradebook.categoryNotInUse`). A `projectmark` is refused when projects are not in use. Results in an existing hidden column can still be set through the API. The UI just offers no field for them.
- `createOfflineTest` refuses a `gradebookKind` whose category is not in use. `updateOfflineTest` refuses the same if it changes the kind. The test form offers only categories in use and hides the "new offline test" button while neither is in use.

Nothing is deleted or rewritten when a weight drops to 0 or rises again. That is the whole of "they reappear".

### D5: The project group in the sheet

`courseColumns` sorts within `projects` by the project's date and creation, and places each project's marks (by date, then creation) directly before their project's column. Each mark column carries `projectId`. A mark column follows its project's semester, not its own date (spec: "the project's date decides"): the semester filter tests the project's `held_on` for both.

In the client, the projects category heading spans every column of every project. Below it a second heading row has one cell per project (name, `+` for a mark column, click → project dialog). Below that come the column headers as usual. Other categories have no cell in that middle row, so their headers span two rows (`rowspan="2"`). The end-grade column's header shows "Note"/"Grade" instead of a date. This keeps one table and lets the arrow keys work unchanged.

The project dialog is `columnDialog` with name and date, opened from the project heading. Its delete warns with the count of the project's results and mark columns. `deleteColumn` on a `project` deletes, in one transaction, the results of its mark columns, the mark columns, its own results, then itself. Deleting a mark column deletes only that column.

### D6: A grade field

`cellText`/`readCell` gain a branch for grade columns: the field shows the grade and accepts one character `1`–`5`. Anything else is refused at the field, with the usual marking. Arrow-key movement treats it like any other text field. `projectmark` uses the existing `+`/`−` branch (`plusminus`) unchanged. The student's results show a grade entry as its grade, and project marks indented under their project, with a "for the record" hint (`exam.gradebook.projectMarksNote`).

### D7: Migration `014-presentations-projects.sql`

It carries the `-- foreign_keys: off` marker and follows `012`:

1. Drop the closed-year triggers of `manual_entry` (they read `assessment`).
2. Create `new_assessment` with the extended kind CHECK, `project_id` and its CHECK, copy every row with its id (`project_id` NULL), drop `assessment`, rename, recreate `assessment_course` and an index on `project_id`.
3. Recreate the closed-year triggers of `assessment` and `manual_entry` unchanged.
4. `ALTER TABLE manual_entry ADD COLUMN grade INTEGER CHECK (grade IS NULL OR grade BETWEEN 1 AND 5)`.
5. Lift `course_closed_year_update`, run `UPDATE course SET weights = json_set(weights, '$.presentations', 0, '$.projects', 0)`, and recreate the trigger. Every course has stored all five keys since `012`, so no defaults need to be materialized first.

`test.assessment_id` keeps referencing `assessment` by name, as `manual_entry` does. The runner checks foreign keys before the commit, and it writes a backup before any pending migration.

`defaultWeights` becomes `{ onlineTests: 20, manualTests: 20, shortTests: 20, presentations: 0, projects: 0, participation: 20, homework: 20 }`.

## Risks / Trade-offs

- [The sheet gets a third header row whenever projects are in use] → The middle row exists only while at least one project is shown. Otherwise the header stays at two rows, as today.
- [A teacher sets a category to 0 % and believes its results are deleted] → The config sheet's weight row for a category at 0 % that still holds columns shows a quiet hint: "N columns hidden" (`exam.classes.hiddenColumns`).
- [Grade results read the scale per request] → `readScale` is already read once per view. The midpoint is a lookup in a five-row array.
- [Online tests at 0 % still exist on the tests page] → Deliberate (Non-Goals), documented in `docs-exam-module.md`.

## Migration Plan

Deploying runs `014` on start. Rolling back means restoring the backup the runner wrote, as for every migration. All existing proposals stay unchanged, and the migration test checks exactly that (tasks 3.1).

## Open Questions

None blocking. The online-tests limit in Non-Goals is the one point Gerald might want to widen later.
