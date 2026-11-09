Source: AI/open-proposals.md

## Why

Students want to look back at an online test and see what they got wrong. Today the page after Submit (`resultPage` in `exam/client/attempt.js`) shows only points, the number of questions and the grade. The questions and answers of the attempt are kept in the database (`attempt_question`, `attempt_token`, `response`), but no view shows them to the student. Teachers lack the same view on a student's page, where it would help with grading.

## What Changes

- A new **attempt review**: a page that shows every question of one submitted attempt with every answer. Each answer is marked "I chose this" (or not) and "this would have been correct" (or wrong). The colours and ✓/✗ marks are those of the board solution (`/exam/tests/<id>/solution`: `sl-board-correct`/`sl-board-wrong`). Each question also shows whether it scored. Questions and answers appear in the attempt's own shuffled order and the course's language, and the page names the points and the grade.
- **Students** open the review from their own results ("Meine Ergebnisse", `sl-exam-results`) through the row of the online test. The link appears **once the sitting the attempt was written in is over** (its window has closed, or the teacher ended it), and stays from then on. The teacher does not have to release it.
- **Teachers** open the same review from the row of the online test on the student's page in the course (`/exam/courses/<id>/students/<username>`). They can do so as soon as the attempt is submitted.
- The review lasts as long as the attempt itself is kept. It goes when the attempt is deleted: by the retention purge (`exam/retention.js`), by an admin, or by rescheduling the sitting. A question an admin removed from the test is no longer shown, just as it no longer counts.
- The images of a reviewed attempt's questions are served to its student while the review is open to them.
- Accepted on purpose (Gerald, 2026-11-09): with a make-up still to come, students of the first sitting can already see the solutions. The teacher has to watch out during the make-up.
- **Changed rule:** today no response to a student may ever say which answer is correct, and a test's questions may never be retrieved again after the attempt. Both rules stay in force while the attempt's sitting is open. They no longer hold for the student's own review once the sitting is over.

## Capabilities

### New Capabilities

- `exam-attempt-review`: the review of a submitted online-test attempt. It covers what the review shows, when a student may open it and from where, the teacher's access from the student's page, the images it serves, and how long it lasts.

### Modified Capabilities

- `online-test`: "Questions and answers are shuffled per student, and nothing on the client reveals correctness" and "Grading is server-side and all-or-nothing" now allow correctness to be revealed in the student's own review once the sitting is over. "Tests are not visible after they were written" lets the review show the attempt's questions and images again after the sitting.
- `gradebook`: "A student sees their own results live, and only their own" gains the link from an online test's row to the review.

## Impact

- `exam/attempts.js`: a new `reviewView(db, row)` reads the attempt's questions, answers, choices and correct flags, plus a rule for when a student may review an attempt.
- `exam/routes-attempts.js`: `GET /api/attempts/:id/review` for the student (own attempt, sitting over) and the student's page `/exam/my/attempts/:id`.
- `exam/routes-gradebook.js` or `exam/routes-tests.js`: the teacher's API and page for the same review.
- `exam/gradebook.js`: online entries carry the attempt id and whether the review is open (`resultsOf`, `studentRecord`).
- `exam/pool.js` (`studentMaySeeImage`): an image is also served while the review of an attempt that shows it is open to its student.
- `exam/client/gradebook.js`: a link in the online-test row of `resultsTable`, for both the student's results and the teacher's student page.
- `exam/client/attempt.js` (or a new client module): the `attempt-review` element.
- `css/exam.css`: the review's styles, coded like the board solution's.
- `i18n/en.json`, `i18n/de.json`: the texts of the review and of the link.
- Tests: unit checks in `test/exam-tests.test.js` (no browser), browser checks against the running instance in `test/exam.test.js`, and the new capability in `test/coverage-map.json`.
- No migration. Everything the review needs is already stored.
