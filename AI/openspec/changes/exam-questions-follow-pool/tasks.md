Each section ends with `npm test` green with the exam module on, and leaves secureLectures deployable.

## 1. Schema

- [ ] 1.1 `exam/db.js`: a migration whose first line is `-- foreign_keys: off` runs with `PRAGMA foreign_keys = OFF` before `BEGIN`, requires an empty `PRAGMA foreign_key_check` before `COMMIT`, and restores `foreign_keys = ON` in a `finally` (design D6). Unit-test both outcomes in `test/exam-foundation.test.js`.
- [ ] 1.2 `exam/migrations/010-questions-follow-pool.sql`: rebuild `image` (`question_id` nullable, `ON DELETE SET NULL`), `test_question` (`question_id` nullable, `ON DELETE SET NULL`) and `question_usage` (`ON DELETE CASCADE`). Ids copied unchanged, indexes and uniques recreated, with a header comment in the style of 006/007.
- [ ] 1.3 Migration test: fill a database at version 9 through the module's functions (a pool with images, one test not yet begun, one written test with attempts), migrate, and compare every row of the rebuilt tables and of `test_answer`, `attempt_question`, `attempt_token` and `response` before and after.

## 2. Tests follow the pool until they begin

- [ ] 2.1 `exam/tests.js`: `testBegun(db, testId, at)` (attempt exists, or a sitting with `opens_at <= at`) and `pendingTestsWith(db, questionId, at)` (D2). Move `unwrittenTestsWith`'s query here and delete it from `pool-edit.js`.
- [ ] 2.2 `exam/tests.js`: `refreshCopy(db, testId, question)` updates one `test_question` row in place, with its answers and the test's `test_image` links. `dropFromTest(db, testId, questionId)` removes the row and its usage. `sweepOrphanImages(db)` deletes `image` rows with `question_id IS NULL` that no `test_image` holds (D3, D5).
- [ ] 2.3 `exam/pool-edit.js`: `writeContent` ends by refreshing the question in every test of `pendingTestsWith`. `removeUnreferencedImages` keeps only images that begun tests show. `saveQuestion`'s answer drops `unwrittenTests` (D1, D7).
- [ ] 2.4 `exam/tests.js`: `followPoolIfNotBegun(db, testId)`, called at the end of `rescheduleSitting` and `deleteSitting`. It re-copies the remaining questions and drops rows whose question has been deleted (D4).
- [ ] 2.5 `chosenQuestions(db, ids, { keep })`: `updateTest` keeps retired questions the test already holds (D7). Update the comments in the headers of `tests.js` and `pool-edit.js` that cite exam-online-tests D2 and exam-question-editor D8.
- [ ] 2.6 Guard test: every statement in `exam/*.js` that writes `question`, `answer` or `image` content runs either through `writeContent` or through one of the allowed creators (`insertQuestion`, `pool-import.js`, `question-import.js`), or through `deleteQuestion` (D1, Risks).
- [ ] 2.7 Tests in `test/exam-tests.test.js` and `test/exam-question-editor.test.js`: an edit reaches a test not yet begun (page, preview, attempt). An edit after the sitting has opened with no attempt does not reach it, and neither does one after the first attempt. A make-up gets the snapshot. A reschedule with deleted attempts follows the pool again. A make-up reschedule keeps the snapshot. Replacing an image keeps the old image for a written test and swaps it for a test not yet begun.

## 3. Deleting questions

- [ ] 3.1 `exam/pool-edit.js`: `deleteQuestion(db, id, { tests })` takes the question out of the pending tests, deletes it, and sweeps images. A count mismatch is refused with `exam.errors.pool.deleteTestsChanged`. Remove `usedCannotDelete` (D5).
- [ ] 3.2 `exam/pool.js`: `getQuestion` answers `pendingTests` (name, course, class) (D7).
- [ ] 3.3 `exam/routes-pool-edit.js`: the delete route reads `tests` from the body and passes it on.
- [ ] 3.4 `exam/tests.js` and `exam/routes-tests.js`: `removeWrittenQuestion` is keyed by `test_question.id`, with the route `DELETE /tests/:id/questions/:testQuestion`. Its image links are dropped by the references in the removed row's texts (D5).
- [ ] 3.5 Tests: deleting a question in a written test leaves the test, the board solution, the attempts, the scores, the gradebook and the image route for an open attempt unchanged. Deleting one planned in two tests empties both of it, and its usage is gone. The count mismatch is refused with nothing changed. Deleting the last question of a planned test leaves it empty. `removeWrittenQuestion` works on a row whose question has been deleted. An image shown only by a deleted test's snapshot disappears with `deleteTest`.

## 4. Tests without questions

- [ ] 4.1 `createSitting` refuses a test without questions (`exam.errors.tests.noQuestions`). `startAttempt` refuses one before writing anything (`exam.errors.attempts.noQuestions`) (D7).
- [ ] 4.2 Tests: scheduling is refused, starting is refused with no attempt row created, and after choosing questions again the test can be started.

## 5. Client and texts

- [ ] 5.1 `exam/client/question-editor.js`: remove `offerTests`. Show the line naming `pendingTests` above save, and the note that written tests keep their version when a begun test holds the question. Save always returns to the pool (D7).
- [ ] 5.2 `exam/client/question-editor.js`: the delete confirmation names the pending tests (or says none), sends `{ tests }`, and reloads the question on `deleteTestsChanged`.
- [ ] 5.3 `exam/client/tests.js`: `removeWrittenQuestion` sends `question.id`. The empty-test notice is shown and the schedule form disabled. The course list styles 0 questions as a warning.
- [ ] 5.4 Catalogs `i18n/en.json` and `i18n/de.json` (BabelEdit format, same keys in both): new keys `exam.editor.pendingTests`, `exam.editor.writtenKeepVersion`, `exam.editor.deleteArmedTests`, `exam.editor.deleteArmedNoTests`, `exam.errors.pool.deleteTestsChanged`, `exam.errors.tests.noQuestions`, `exam.errors.attempts.noQuestions`, `exam.tests.noQuestions`. Remove `exam.editor.unwritten*`, `exam.editor.updateTest*` and `exam.errors.pool.usedCannotDelete` if no longer read. `test/i18n-catalog.test.js` stays green.
- [ ] 5.5 Harness checks: the editor names a planned test before saving, and the test's page shows the edit after saving. Deleting a question used in a written test with confirmation leaves that test's page unchanged. An empty test's page at 1280px and 390px.

## 6. Documentation and rollout

- [ ] 6.1 `AI/architecture.md`: the snapshot rule (copy refreshed until the test begins), the foreign-key-off migration rule, and the updated delete rule.
- [ ] 6.2 Before deploying to secureLectures: compare aggregates of the copies of tests not yet begun against the pool on production (test id and number of differing questions only). If anything differs, show Gerald the list (design, Migration Plan 2).
- [ ] 6.3 Run `npm test` with the exam module off and on, and the harness, and record the results.
