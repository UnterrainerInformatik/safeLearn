## 1. Server: rule and payload

- [x] 1.1 Move the per-question scoring rule of `scoreAttempt` into a helper `questionScores(db, attemptId)` in `exam/attempts.js`, have `scoreAttempt` use it, and verify the existing scoring checks in `test/exam-tests.test.js` still pass unchanged
- [x] 1.2 Add `reviewOpen(db, row, at)` (submitted, and the attempt's sitting has `closes_at <= at`, design D1) and verify it with unit checks: open window → false, early submission inside the window → false, window closed → true, sitting ended by `endSitting` → true, extended sitting → false until the new end, make-up attempt → follows its own sitting
- [x] 1.3 Add `reviewView(db, row)` (design D2): questions in the attempt's order, answers in the attempt's order, the course's language, `chosen`/`correct` per answer, `scored` per question from `questionScores`, plus name, score, question count and grade, with no tokens and no snapshot ids. Verify with a unit check that the `multichoiceset` A+C/chose-A case gives A chosen+correct, C correct only, question not scored, and that the order matches `writingView` of the same attempt
- [x] 1.4 Verify by unit check that after `removeWrittenQuestion` the removed question is missing from `reviewView` and the score matches the stored one

## 2. Server: routes and image rule

- [x] 2.1 Add `GET /api/attempts/:id/review` (behind `requireStudent`, via `ownAttempt`, with no device check) to `exam/routes-attempts.js`, answering 409 `exam.errors.attempts.reviewNotYet` while the sitting is open. Verify by unit or route checks: own attempt after the sitting → payload; inside the window → 409; a classmate's attempt → the same 404 as a missing one; a teacher → refused
- [x] 2.2 Add the student page `/exam/my/attempts/:id` (no bar, `wrapInPage`, element `attempt-review` with `{ attempt }`, link back to `/exam/my`) and verify that it renders for a logged-in student
- [x] 2.3 Add `GET /api/courses/:id/students/:username/attempts/:attempt` (behind `requireTeacher`, attempt must belong to the course's test and to that student, 404 if unsubmitted) and the page `/exam/courses/:id/students/:username/attempts/:attempt` through `teacherShell` to `exam/routes-gradebook.js`. Verify: a teacher gets the payload before the sitting is over; a student and a teacher in student view are refused; a wrong course or student → 404
- [x] 2.4 Extend `studentMaySeeImage` in `exam/pool.js` with the review case (design D5) and verify by unit check: an image of an open attempt is served; after an early submission inside the window it is refused; after the sitting it is served; for another student it is refused

## 3. Server: entries

- [x] 3.1 Have `onlineEntries` in `exam/gradebook.js` carry `attemptId` and `reviewOpen` (design D4), copy both in `resultsOf`, and verify with unit checks that a student's `resultsOf` shows `reviewOpen: false` while the sitting is open and `true` after it, and that `studentRecord` carries `attemptId`
- [x] 3.2 Verify by unit check that after `purgeLeavers` and after an admin's `deleteAttempt` the review route answers 404 and the entry is gone

## 4. Client

- [x] 4.1 Create `exam/client/review.js` with the element `attempt-review` (design D6), loading the student's or the teacher's route from its params, import it in `exam/client/exam-client.js`, and verify that the page renders questions, answers, choice marks, ✓/✗ with `aria-label`s, and the points and grade line
- [x] 4.2 Give `resultsTable` in `exam/client/gradebook.js` a `reviewHref` option and pass it from `ResultsView` (only when `reviewOpen`) and from `GradebookStudent` (every online entry). Verify that the link "Ansehen"/"Review" appears in the result cell with an `aria-label` naming the test, and that no other row changes
- [x] 4.3 Add the `.sl-exam-review-*` styles to `css/exam.css`, coded like the board solution (correct green with ✓, wrong dimmed with ✗) for light and dark, and verify by looking at the page in both themes and at 390px width
- [x] 4.4 Add the texts (page titles, link, "Frage n", "deine Wahl", "richtig"/"falsch", "nicht gewertet", "back to my results", `exam.errors.attempts.reviewNotYet`) to `i18n/de.json` and `i18n/en.json` with the same keys, and verify that `test/i18n-catalog.test.js` passes

## 5. Browser checks and records

- [x] 5.1 Add a check to `test/exam.test.js` that does the following: a student submits inside the window and finds no review link; the teacher ends the sitting; the student's results now link to the review, which shows the chosen and the correct marks; the teacher opens the same review from the student's page
- [x] 5.2 Add `exam/client/review.js` to the guards of the online-test checks in `test/coverage-map.json`, record the `exam-attempt-review` capability there as the map does for others, and verify that `test/coverage.test.js` passes
- [x] 5.3 Update `AI/architecture.md` (features, component map, permissions: correct flags reach a student only through the review after the sitting) and delete the entry "Schüler sehen nach einem Online-Test nach, was falsch war" from `AI/open-proposals.md` when the change is archived
- [ ] 5.4 Run `npm test` in full and verify that it is green apart from the checks known to be flaky (reload backoff, 390px viewport, single exam harness checks), which are run again before being accepted
