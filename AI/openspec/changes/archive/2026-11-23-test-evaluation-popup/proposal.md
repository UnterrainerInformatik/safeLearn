Source: AI/open-proposals.md, entry **Test-Auswertung pro Test und Klasse** (decided with Gerald on 2026-11-23: the evaluation is a popup, opened from the grading overview and from the test itself).

## Why

After a test, a teacher wants to know at a glance how the class did: how many 1s to 5s, the average, and who has no result yet. Today nothing answers that. The sheet only colours each row by the student's overall grade (`gradebook-sheet`, "Rows are coloured by their grade"). A single column cannot be summed up without counting by hand.

## What Changes

- A new **evaluation popup** for one test of a course. It shows:
  - the grade distribution: the number of 1s, 2s, 3s, 4s and 5s, each as a bar in the grade colours (1/2 green, 5 red, 3/4 neutral);
  - the average grade and the average percentage;
  - how many students have a result and how many do not have one yet.
- It covers every column of the **online-test, manual-test and short-test** categories. That includes offline tests, which are columns of the manual-test or short-test category. Homework, presentations, projects and participation get no evaluation.
- **Opened from the sheet:** every evaluable column's header gets a small evaluation button. It sits beside the existing header button or link, like the `↗` of an offline test's column.
- **Opened from the test:** the page of an online or offline test (`/exam/tests/<id>`) gets an "Evaluation" button once the test has a column in the sheet.
- The same popup and the same numbers in both places. They are computed on the server from the same results the sheet shows, with an offline test's factor A:B applied.
- Only teachers see it. A student sees nothing of it.

## Capabilities

### New Capabilities
- `test-evaluation`: what a test's evaluation for its course contains, whom it counts, how it is shown as a popup, and the two ways to open it (the sheet's column header and the test's page).

### Modified Capabilities
<!-- none: the sheet's header and the test page gain an entry point, defined in test-evaluation; no existing requirement changes -->

## Impact

- `exam/gradebook.js`: a function that evaluates one column of a course (online `test-<id>` or manual column id), reusing the existing entry builder including `groupRaise`.
- `exam/routes-gradebook.js`: `GET /api/courses/:id/columns/:column/evaluation` (teachers only).
- `exam/client/evaluation.js` (new): the popup, shared by the sheet and the test page.
- `exam/client/gradebook.js`: the evaluation button in `columnHead`.
- `exam/client/tests.js`: the evaluation button on `TestDetail`, online and offline.
- `css/exam.css`: the popup and its bars, light and dark.
- `i18n/de.json`, `i18n/en.json`: new keys under `exam.evaluation.*`.
- Tests: unit tests for the evaluation, a browser check for both entry points.
- Docs: `docs-exam-module.md`, `AI/architecture.md`.
