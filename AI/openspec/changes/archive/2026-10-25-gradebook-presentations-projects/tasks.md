## 1. Data and categories

- [x] 1.1 `exam/migrations/014-presentations-projects.sql` (with `-- foreign_keys: off`): rebuild `assessment` with the kinds `presentation`, `project`, `projectmark`, `project_id` and its CHECK, keeping ids and recreating indexes and the closed-year triggers of `assessment` and `manual_entry`. Add `manual_entry.grade`. Write `presentations: 0, projects: 0` into every course's weights, with `course_closed_year_update` lifted for that statement (design D7). Comments in the style of `012`
- [x] 1.2 `exam/grading.js`: `entryCategory` with `presentation` → `presentations` and `project` → `projects`. `exam/classes.js`: `weightCategories` in the new order, `defaultWeights` (D7), `categoriesInUse(course)`, and `getCourse` answering `categoriesInUse` (D4)
- [x] 1.3 `exam/gradebook.js`: an explicit `entryKinds` including `projectmark` (D1). `columnMax` refuses a maximum for the three new kinds. `createColumn` takes and checks `projectId` for `projectmark` (D2) and refuses kinds whose category is not in use (D4). `normalizeResult` takes `{ grade }` for `presentation`/`project` and `{ mark }` for `projectmark` (D3)
- [x] 1.4 `exam/gradebook.js`: `entryFromRow` computes a grade result's `value` as `bandMidpoint` on the current scale and answers its typed `grade`. `projectmark` entries carry no category and are kept out of `proposal` (D3)
- [x] 1.5 `exam/gradebook.js`: `courseColumns` orders projects with their marks before them, filters marks by their project's semester, and leaves out columns of categories not in use. `courseOverview`, `studentRecord` and `resultsOf` drop the entries and `categories` of categories not in use (D4, D5)
- [x] 1.6 `exam/gradebook.js`: `deleteColumn` on a `project` removes its mark columns and every result in the project in one transaction, and answers the counts (D5)
- [x] 1.7 `exam/tests.js`: `createOfflineTest`/`updateOfflineTest` refuse a `gradebookKind` whose category is not in use (D4)
- [x] 1.8 `i18n/de.json` / `i18n/en.json` (same keys, BabelEdit): `exam.categories.presentations` ("Referate" / "Presentations") and `exam.categories.projects` ("Projekte" / "Projects"), the grade field and its refusal, the end-grade header, the project dialog and its delete confirmation, `exam.gradebook.projectMarksNote`, `exam.classes.hiddenColumns`, `exam.errors.gradebook.categoryNotInUse` and the `projectId` refusals

## 2. Client

- [x] 2.1 `exam/client/gradebook.js`: `categories`/`categoryLabels`/`addableKinds` for the new categories. Groups and category lines are built from `course.categoriesInUse` instead of the constant, in the sheet, the student record and the student's results. `exam/client/classes.js`: the labels
- [x] 2.2 `exam/client/gradebook.js`: the grade field in `cellText`/`readCell` (one character 1–5, refused otherwise). `projectmark` goes through the `+`/`−` branch. The dialog asks for no maximum for the new kinds (D6)
- [x] 2.3 `exam/client/gradebook.js`: the project group (the middle heading row with one cell per project, `+` for a mark column, click opens the project dialog, `rowspan="2"` for other headers only while a project is shown, "Grade" header on the end-grade column) and the project dialog with delete and confirmation (D5)
- [x] 2.4 `exam/client/gradebook.js`: the student's results show grade entries as grades and project marks indented under their project with the note (D6)
- [x] 2.5 `exam/client/classes.js`: the config sheet lists all seven categories and, for one at 0 % holding columns, the hidden-columns hint
- [x] 2.6 `exam/client/tests.js`: the offline form offers only categories in use, and the "new offline test" button is hidden while neither is in use
- [x] 2.7 `css/exam.css`: the project heading row and the indented project marks, in light and dark mode

## 3. Verification

- [x] 3.1 `test/exam-gradebook.test.js`: migration from version 13 leaves ids, counts and every proposal unchanged and writes the new weights, closed years included. Presentation grades and their midpoint follow a scale change (spec scenarios "A presentation graded 2", "The scale changes under a grade", "Two presentations"). Project marks count nowhere, and a project without an end grade is left out. A 0 % category is hidden in overview, record and results, with its data kept and shown again at > 0 %. A project delete cascades. `projectId` refusals, and refusals of kinds not in use
- [x] 3.2 `test/exam-classes.test.js`: a new course's default weights (20 × 5, 0 × 2). Weights must name all seven categories and add up to 100
- [x] 3.3 `test/exam-tests.test.js`: an offline test in a category not in use is refused
- [x] 3.4 `test/exam.test.js` (browser): a presentation column through its `+` with a grade typed and a refused 6. A project with two mark columns, its end grade, the group order and its delete with confirmation. Setting homework to 0 % removes its group, and setting it back restores it. The offline form without short tests
- [x] 3.5 `docs-exam-module.md`: the two categories, the project group, hiding at 0 %, and the online-tests limit (design Non-Goals)
- [x] 3.6 Run `npm test` in full and record the result here (known flaky checks: see memory `flaky-content-checks`)
  - 2026-10-25: `npm test` 911/914. Red: legibility "a narrow viewport…" (390px, known flaky; passed on re-run), and in `test/exam.test.js` "the live view orders by status…" and "started from its page, a present student sees their handout…". Both were red in a second full run of `test/exam.test.js` (167/169) **and on unchanged HEAD** with the tree stashed (162/165, plus "no student reaches another student's attempt…"), so they are not caused by this change. The exam server suites (323) and the gradebook browser suite (20, incl. the new checks) are green.
