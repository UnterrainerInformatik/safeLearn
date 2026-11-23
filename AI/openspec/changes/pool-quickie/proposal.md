Source: AI/open-proposals.md, entry **Freitext-Fragen im Pool, Quickies daraus zusammensetzen** (decided with Gerald on 2026-11-23: builds on `freetext-questions`; every question of a test carries a weight, for all tests; a test on paper is composed from pool questions with its own selection per group A/B; a teacher grades each question of each student with a grade from 1 to 5, multiple choice included, normalized like every grade result to the middle of its band; the result is the weighted mean, and the column is computed from it; online tests with free-text questions are a later, optional change).

## Why

A short test on paper is today a manual column or an offline test with a handout written for that one test. Its questions cannot be reused, and its grading is one total typed into the sheet. With free-text questions in the pool (`freetext-questions`), a short test can be composed from pool questions like an online test. That keeps the questions reusable and shows where each one was used. Grading each question with a grade from 1 to 5, weighted, is how the teachers grade such tests anyway.

## What Changes

- **Every question of a test carries a weight**, a whole number from 1 to 10, 1 by default. It holds for online and offline tests. An online test's result becomes the weighted sum of its scored questions out of the total weight. With every weight at 1 it is exactly today's result, and every existing test keeps its result. An online test's weights can be changed until it begins. Points are shown out of the total weight: in the sheet, after submitting and in the review.
- **An offline test can be composed from pool questions** instead of handouts, in the question browser with a course chosen, choice and free-text questions alike. A test has either handouts or questions, never both. It is still created as counting as a test or as a short test.
- **Group A and group B each have their own selection.** The questions chosen first are group A's. Choosing questions for group B makes the test a two-group test, with the attendance table's groups and the factor A:B, as two handouts do today.
- **The test's questions follow the pool until its first sitting is started**, and are then fixed as a snapshot, like an online test's. Usage shows in the browser.
- **A generated sheet and its solution are printed.** For each group, the test's page and every sitting's page print a sheet of the questions in the course's language. Choice questions get boxes to tick, and free-text questions get an answer space whose number of lines the teacher sets per question. The solution prints the correct answers and the model solutions. The sheets are not shown on screen to students: these tests are written on paper.
- **The teacher grades each question of each student with a grade from 1 to 5**, in a correction table of the test: one row per student who was present, one column per question of their group. A grade counts as the middle of its band on the grading scale, the rule the gradebook already uses for every grade result. The student's result is the weighted mean, with the factor A:B on top. It shows only once every question of the student's group has a grade.
- **The test's column is computed and read-only** for a test with questions, like an online test's. **BREAKING** for `offline-test`: "An offline test is an editable column" now holds only for tests with handouts or without anything.
- **Retakes are graded over the earlier grades.**

## Capabilities

### New Capabilities
- `offline-test-questions`: composing an offline test from pool questions per group, its weights, its snapshot, the printed sheet and solution, the correction table and the computed result.

### Modified Capabilities
- `question-pool`: a question counts with its weight in a test. In an online test a choice question is graded all-or-nothing, and in a test on paper every question is graded by a teacher.
- `online-test`: questions carry weights, and the result is the weighted sum out of the total weight.
- `exam-attempt-review`: points out of the total weight, and each question's weight.
- `gradebook-sheet`: an online test's field shows points out of the total weight; the column of an offline test with questions is read-only.
- `offline-test`: an offline test has handouts or questions; groups and the factor also come from two question selections; the column of a test with questions is computed; a retake is graded over the earlier grades.

## Impact

- `exam/migrations/024-weights-and-paper-questions.sql`: `test_question.weight`, `test_question.handout_group` (`A`/`B`, always `A` for an online test), `test_question.answer_lines`, a table `question_grade`, and `attempt.question_count` reread as the total weight (existing rows unchanged, since every weight is 1).
- `exam/attempts.js` (`scoreAttempt`, `resultView`, review), `exam/tests.js` (assembly per kind and group, weights, snapshot at the offline start, start guard, handouts or questions), `exam/gradebook.js` (computed offline column, factor A:B on it), a new `exam/paper-grades.js` with its routes, the print routes beside `exam/routes-handout.js`.
- `exam/client/pool.js` (assembly for paper and group B), `exam/client/tests.js` (weights, answer lines, print buttons, correction table), `exam/client/gradebook.js` (read-only offline column), `exam/client/attempt.js` (points out of the total weight).
- `i18n/de.json`, `i18n/en.json` (BabelEdit format); unit tests, a browser check and `test/coverage-map.json`.
- Depends on `freetext-questions` being applied and archived first.
