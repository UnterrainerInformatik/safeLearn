## 1. Server

- [ ] 1.1 `exam/gradebook.js`: add `evaluateColumn(db, courseId, columnKey)` per design D1. Resolve a manual id or `test-<id>`. Refuse non-test categories and categories not in use with `NotFoundError`. Filter `courseEntries` to the column. Return distribution, results, missing (roster not left, no entry) and the unrounded averages (`null` without results). Verify with unit tests in `test/exam-gradebook.test.js`: the 24-point scenario (1/1/1/0/1, 2.8, 70 %), an empty column, missing count, an online test with an unsubmitted attempt, an offline test with factor B 1.20, a student who left with and without a result, a homework column refused, a column of another course refused
- [ ] 1.2 `exam/routes-gradebook.js`: `GET /api/courses/:id/columns/:column/evaluation` behind `requireTeacher` (design D2). Verify with a test that a teacher gets the evaluation and a student is refused
- [ ] 1.3 `GET /api/tests/:id` (`getTest` in `exam/tests.js`): add `column`, the sheet key of the test's column or `null` (online: `test-<id>` once a sitting exists; offline: its manual column's id). Verify with unit tests for an online test without and with a sitting and for an offline test

## 2. Client

- [ ] 2.1 New `exam/client/evaluation.js` with `openEvaluation(host, courseId, columnKey)` (design D3): a modal dialog with name, date and category, five bars toned via `gradeTone`/`setTone` with their numbers beside them, average grade (one decimal) and average percentage (whole) via `Intl.NumberFormat` of the page locale, results and missing counts. Close button, Escape and a backdrop click close it, and the dialog removes itself on close. Verify by the browser check in 3.1
- [ ] 2.2 `exam/client/gradebook.js` `columnHead`: append an evaluation button beside the header button, online link or `↗` for columns of the online-test, manual-test and short-test categories (design D4). Give it an `aria-label` naming the column. Verify in the browser that the header button still opens the column dialog and the online date still links to the test
- [ ] 2.3 `exam/client/tests.js` `TestDetail`: an "Evaluation" action button in the online actions row and in `renderOffline`'s actions when `test.column` is not `null` (design D5). Verify in the browser for an online test without a sitting (no button), one after its sitting, and an offline test
- [ ] 2.4 `css/exam.css`: the popup layout and bars, light and dark, reusing the `data-tone` colours. Verify with a legibility check of the popup in both modes
- [ ] 2.5 `i18n/de.json`, `i18n/en.json`: `exam.evaluation.*` keys (title, open button labels, grade, average grade, average percentage, results, missing, close, no results yet), the same keys in both files. Verify with `test/i18n-catalog.test.js`

## 3. Verification

- [ ] 3.1 Browser check (alongside the gradebook checks the suite already has, or a new `test/checks/exam-evaluation.js` registered in `test/coverage-map.json`): open the evaluation from a sheet header and from the test page and compare their numbers. Check that a participation column has no button, that Escape keeps the sheet's semester and scroll position, that dark mode is legible, and that the header width of a nine-column sheet grows by at most a small tolerance
- [ ] 3.2 Run the affected unit tests and checks, fix what fails, then run the full `npm test` once

## 4. Docs

- [ ] 4.1 `docs-exam-module.md`: describe the evaluation, what it counts and both ways to open it
- [ ] 4.2 `AI/architecture.md`: the endpoint, `evaluation.js` and the `column` field of a test
