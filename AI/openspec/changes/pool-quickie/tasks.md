## 1. Data

- [x] 1.1 `exam/migrations/024-weights-and-paper-questions.sql` (`-- foreign_keys: off`): rebuild `test_question` with `weight` (1-10, default 1), `handout_group` (`A`/`B`, default `A`), `answer_lines` (1-40, default 6) and the uniqueness `(test_id, handout_group, question_id)` and `(test_id, handout_group, position)`, recreating indexes and the closed-year triggers; create `question_grade` with its closed-year triggers (design D1, D2, D4). Verify on a copy with attempts, responses and a closed year: rows and ids survive, `foreign_key_check` is clean, and closed-year writes are still refused

## 2. Server: weights for online tests

- [x] 2.1 `exam/attempts.js`: `scoreAttempt` sums weights; the attempt's `question_count` is the total weight at start; `resultView` and the review carry points out of the total weight and each question's weight (design D1). Verify "A weighted question", "Weighted questions" (review) and that an existing attempt's 3/4 is unchanged
- [x] 2.2 `exam/tests.js`: set a question's weight on an online test, refused once the test's questions are locked and out of range; the admin's removal of a question rescores with weights. Verify "Weighting before the sitting", "After the first attempt", "An old test"
- [x] 2.3 `exam/gradebook.js`: an online field shows points out of the total weight. Verify "A weighted test" (sheet)

## 3. Server: offline tests with questions

- [x] 3.1 `exam/tests.js`: create an offline test from questions (group A), with duration and category in use; set and reorder a group's questions; handouts and questions exclusive; group A emptied moves B to A (spec "An offline test is composed …", "Group B has its own selection"). Verify the scenarios of both requirements
- [x] 3.2 `exam/tests.js`: weight and answer lines per group and question for offline tests, changeable after the start (spec "Each question of a test on paper carries …"). Verify "Weighting a question", "A weight out of range"
- [x] 3.3 `exam/tests.js` and `exam/pool-edit.js`: `testBegun` for offline tests by a started sitting; freeze the snapshot in `startSitting`; refuse the start without questions; skip the handout guard for tests with questions (design D3). Verify "A typo fixed before the test", "Edited after the start", "The only question deleted"
- [x] 3.4 Groups and factor: two groups when group B holds questions, for the attendance table and the factor A:B (spec `offline-test` deltas). Verify "Two selections", "Group B emptied", "Two question groups"
- [x] 3.5 `exam/paper-grades.js` and routes: read the correction table, set and clear a grade 1-5, teacher only, only for present students and their counting group's questions (design D4, D8). Verify "Grading a row", "A grade out of range", "An absent student", "Moved to the other group", and that a student is refused
- [x] 3.6 `exam/gradebook.js`: the column of a test with questions computed on read from grades, weights, band midpoints and the factor; empty until complete; read-only; no maximum or delete in its dialog (design D5). Verify "A weighted result", "All fours", "Not yet complete", "The scale moves", "A computed field", and that the test evaluation shows the same values
- [x] 3.7 Discard, delete and purge: discarding an offline test with questions deletes its grades; deleting it is refused while a grade exists; the leavers' purge removes their grades; a retake writes over the earlier grades. Verify "A retake of a test with questions" and the discard count
- [x] 3.8 Print routes beside `exam/routes-handout.js`: sheet and solution per group in the course's language, with weights, boxes, answer lines and model solutions, the handout's `DATE` rule, teacher only (design D6). Verify "Printing group A", "Printing the solution", "A student asks for a sheet"
- [x] 3.9 No route sends a paper test's questions to a student; the Exams page entry shows name and time only. Verify "During the window"

## 4. Client

- [x] 4.1 `exam/client/pool.js`: create a test online or on paper (duration and category for paper), and the target mode `?test=&group=` for choosing a group's questions; free-text tickable only for paper (design D7)
- [x] 4.2 `exam/client/tests.js`: per group the questions with order, weight, answer lines and total weight; "Choose questions for group A/B"; print buttons for sheet and solution on the test's and every sitting's page; online tests' weight fields
- [x] 4.3 `exam/client/tests.js`: the correction table per group with the sheet's grade fields and keyboard, the result per row with the factor shown beside it (design D8)
- [x] 4.4 `exam/client/gradebook.js`: the read-only column of a test with questions with the dialog's way to the correction table; `exam/client/attempt.js` and the review: points out of the total weight and weights per question
- [x] 4.5 `i18n/de.json`, `i18n/en.json` (BabelEdit format, same keys): "Test on paper", group question choice, weight, total weight, answer lines, the print buttons and the sheet's headings (name line, group), the correction table, the refusals (handouts or questions, no questions at the start, weight and grade out of range, locked weight). Verify with `test/i18n-catalog.test.js`

## 5. Existing tests

- [x] 5.1 Update unit tests that assume one point per question, offline tests without questions, or an always-editable offline column (`test/exam-tests.test.js`, `test/exam-offline.test.js`, `test/exam-gradebook.test.js`, `test/exam.test.js`), so that each one asserts the new rule rather than being deleted

## 6. Verification

- [x] 6.1 Browser check in the existing exam checks (registered in `test/coverage-map.json`): set a weight on an online test and see the student's points out of the total weight; compose a test on paper from a free-text and a choice question for a demo course, choose group B, set weights and answer lines, print sheet and solution of group A, start the sitting with the demo students in both groups, see the Exams page without questions, grade both rows in the correction table, and see the computed, read-only field in the sheet and the student's result
- [x] 6.2 Run the affected unit tests and checks, fix what fails, then run the full `npm test` once

## 7. Docs and backlog

- [x] 7.1 `docs-exam-module.md`: weights, tests on paper from the pool, groups, printing, the correction table and the result rule
- [x] 7.2 `AI/architecture.md`: `test_question.weight`/`handout_group`/`answer_lines`, `question_grade`, `question_count` as total weight, the offline "begun" rule and the computed column
- [ ] 7.3 `AI/open-proposals.md`: remove the entry "Freitext-Fragen im Pool, Quickies daraus zusammensetzen" (at archive, after `freetext-questions` was archived too)
