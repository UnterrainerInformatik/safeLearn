## Context

`test_question`/`test_answer` hold a copy of every question in a test. The copy is written by `snapshot()` in `exam/tests.js` when the test is created, and again by `updateTest` while no attempt exists. Everything that shows or grades a test reads only that copy: `startAttempt` and `previewView` in `exam/attempts.js`, scoring, `getTest`, the course lists, the gradebook's question count and the live view. `test_image` links the pool images that a test's questions use, and `ON DELETE RESTRICT` keeps them alive. `question_usage` holds one row per (question, test), dated by `usageDate`, and is read by the pool browser.

In the pool, `saveQuestion` touches only the pool tables and answers with `unwrittenTestsWith`, which the editor turns into "update this test" buttons. Each button re-sends the test's question ids to `PUT /tests/:id`. `deleteQuestion` refuses any question found in `question_usage` or `test_question`.

The foreign keys stand in the way of deleting a used question. `test_question.question_id` and `question_usage.question_id` are `NOT NULL REFERENCES question (id)` without an action, and `image.question_id` is `ON DELETE CASCADE`, while `test_image` restricts. So today the database would refuse to delete a question whose image a test shows. The migration runner wraps every file in `BEGIN … COMMIT` on a connection with `foreign_keys = ON`, which rules out SQLite's table-rebuild procedure.

## Goals / Non-Goals

**Goals:**
- A test not yet begun always shows, previews and hands out the pool's current version of its questions.
- A begun test is exactly as revision-proof as a test is today.
- Any question can be deleted. Begun tests lose nothing, not even an image.
- Every reader of a test keeps reading one place. No reader needs to know whether a test has begun.

**Non-Goals:**
- Versioning pool questions, or showing a begun test's differences from the pool.
- Changing the Markdown import's take-back rule. It still refuses while one of its questions is in any test.
- Letting an edit reach a begun test. The admin's per-test correction (`removeWrittenQuestion`) stays the only way to change a written test.
- Restricting deletion to admins. Gerald decided that any teacher may delete, with a confirmation.

## Decisions

### D1: The copy stays, and is refreshed until the test begins

`test_question`/`test_answer` stay the only place a test's questions are read from. A test not yet begun keeps a copy that mirrors the pool: every write that changes a pool question rewrites the copy of that question in each such test, in the same transaction. When the test begins, the refreshing stops, and the copy as it stands becomes the snapshot. Nothing has to happen at the moment the sitting opens, because a copy taken at the last pool write before opening is the same as one taken at the opening.

*Alternative: keep only the selection (`test_id, question_id, position`) before the start, and materialize the snapshot lazily when the first sitting opens or the first attempt starts.* Rejected: every reader (preview, test page, course lists, gradebook count, attempt start) would need two code paths. The materialization would also have to run before any pool write that could reach a test whose sitting has already opened. A copy that is always present gives the same observable behaviour with far fewer places to get wrong.

The pool writes that change a question's content are `saveQuestion` (via `writeContent`) and `deleteQuestion`. Retire, revive and move change nothing a test shows. `insertQuestion`, the Moodle import and the Markdown import only create questions, which no test holds yet. A test in `exam-tests.test.js` checks this list against every `UPDATE question`/`DELETE FROM answer` in `exam/`, so a new write path cannot skip the refresh unnoticed.

### D2: "Begun" is a query, not a state

`testBegun(db, testId, at = now())` returns true if an attempt of the test exists, or if one of its sittings has `opens_at <= at`. No column is added, so nothing can fall out of step. The tests to refresh for question `q` are:

```sql
SELECT DISTINCT tq.test_id FROM test_question tq
WHERE tq.question_id = ?
  AND NOT EXISTS (SELECT 1 FROM attempt a WHERE a.test_id = tq.test_id)
  AND NOT EXISTS (SELECT 1 FROM sitting s WHERE s.test_id = tq.test_id AND s.opens_at <= ?)
```

`pendingTestsWith(db, questionId)` (replacing `unwrittenTestsWith`) returns the same set with test name, course and class, for the editor and the delete confirmation.

`testStarted` (attempt exists) keeps its meaning and its callers: changing the selection and deleting a test are still allowed until the first attempt. If a teacher changes the selection after the sitting has opened but before anyone has started, the test is re-copied from the pool at that moment. This is what happens today, and it is the moment the teacher deliberately chose.

### D3: Refreshing one question in one test

`refreshCopy(db, testId, question)` updates the `test_question` row in place, keeping its `id` and `position`. It replaces that row's `test_answer` rows and re-links `test_image` for the test from the images of all questions the test still holds. Keeping the row id is safe because a test not yet begun has no attempt, so nothing references `test_answer` or `attempt_question` yet. The `question_usage` row is unaffected.

Taking a question out of a test (D5) deletes its `test_question` row. Its answers go by cascade, and its `question_usage` row is deleted too. Positions may then have a gap. `UNIQUE (test_id, position)` allows that, and every reader orders by position.

### D4: Reset makes a test follow the pool again

`rescheduleSitting` and `deleteSitting` end with `followPoolIfNotBegun(db, testId)`. If the test is no longer begun, it re-copies each remaining question from the pool. A row whose `question_id` is `NULL`, because the question was deleted while the test was begun, is dropped, together with its usage. This is the only place where a test goes from begun back to not begun. `endSitting` and `extendSitting` only apply to open sittings, and `updateSitting` only to sittings that have not opened, so they cannot change the begun state. `deleteTest` removes everything as before.

### D5: Deleting a question

`deleteQuestion(db, id, { tests })` runs in one transaction:
1. It computes `pendingTestsWith(id)`. If its length differs from `tests`, the confirmed count, it refuses with `ConflictError("exam.errors.pool.deleteTestsChanged")`. This follows the pattern of `rescheduleSitting`'s `attempts` confirmation.
2. It deletes the question's copy from each of those tests (D3).
3. It deletes the question. The new foreign keys (D6) set `test_question.question_id` to `NULL` in begun tests, delete its `question_usage` rows, and set `image.question_id` to `NULL` for its images.
4. It removes orphaned images: `DELETE FROM image WHERE question_id IS NULL AND id NOT IN (SELECT image_id FROM test_image)`.

The same orphan sweep runs after `deleteTest`, `removeWrittenQuestion` and every refresh, so an image whose question is gone disappears once the last test that showed it goes.

`removeWrittenQuestion` is now keyed by `test_question.id` instead of the pool question id, so it also works on a row whose question has been deleted. Its route becomes `DELETE /tests/:id/questions/:testQuestion`, and the client sends `question.id`. The image links it drops are those of the images the removed row's texts reference (`/exam/api/images/(\d+)`), unless another row of the test still references them.

### D6: Migration 011 and foreign keys off

`011-questions-follow-pool.sql` (010 is the year change, archived after this proposal) rebuilds three tables using SQLite's documented procedure (new table, copy, drop, rename, recreate indexes):
- `image`: `question_id INTEGER REFERENCES question (id) ON DELETE SET NULL`, now nullable. `UNIQUE (question_id, sha256)` stays, and `NULL`s do not collide.
- `test_question`: `question_id INTEGER REFERENCES question (id) ON DELETE SET NULL`, now nullable. `UNIQUE (test_id, question_id)` stays.
- `question_usage`: `question_id … REFERENCES question (id) ON DELETE CASCADE`.

Dropping `test_question` while `foreign_keys = ON` would cascade into `test_answer` and fail on `attempt_question`. So the runner learns one rule: a migration whose first line is `-- foreign_keys: off` runs with `PRAGMA foreign_keys = OFF` set before `BEGIN`. `PRAGMA foreign_key_check` must return no rows before `COMMIT`, otherwise the migration is rolled back. `foreign_keys = ON` is restored in a `finally`. The pre-migration backup (`backupBeforeMigration`) is taken as for every migration. All row ids are copied unchanged, so every reference stays valid.

**Closed years (decided with Gerald on 2026-10-20, during implementation).** Migration 010 guards `test_question`, `test_answer` and `question_usage` of a closed year with triggers that abort every update and delete. Deleting a question used in a closed year's test fires them through `ON DELETE SET NULL` and `ON DELETE CASCADE`. The rebuilt tables get their triggers back with one exception each: a `test_question` row may change `question_id` to `NULL` and nothing else when that question no longer exists, and a `question_usage` row may be deleted when its question no longer exists. The snapshot content, attempts and grades of a closed year stay untouched. `test_answer`'s triggers read `test_question` and would block its rename, so they are dropped first and recreated unchanged.

*Alternative: a soft delete (`question.deleted_at`).* Rejected: every pool read would have to filter on it. A category holding only deleted questions could not be deleted, because of the foreign key. And the deleted questions' images would stay for good.

### D7: Editor and test page

- The editor's `GET /pool/questions/:id` answer gains `pendingTests` (D2). Above the save button, the editor shows a quiet line naming those tests ("This save also changes: …"), followed by "Tests already written keep their version." if `usage` holds a begun test. `offerTests`, the save answer's `unwrittenTests` and the related catalog keys are removed. After a save, the editor returns to the pool as it already does when there is nothing to offer.
- The editor's delete button no longer has a "used" state. Its armed confirmation names the pending tests, or says that no planned test holds the question, and sends `{ tests: pendingTests.length }`. A `deleteTestsChanged` refusal reloads the question so the confirmation can be given again.
- The test page shows "This test has no questions." for an empty test, and the schedule form stays disabled. `createSitting` refuses with `exam.errors.tests.noQuestions`. `startAttempt` refuses with `exam.errors.attempts.noQuestions` before it writes anything. The course lists already show the count, and 0 gets the warning style.
- `chosenQuestions(db, ids, { keep })` accepts a retired question if it is in `keep`, the test's current pool question ids. `updateTest` passes `keep`, `createTest` does not.

## Risks / Trade-offs

- [A pool write path forgets to refresh, and a test not yet begun drifts from the pool.] → The guard test in D1 lists the allowed writers. The refresh lives in one function that `writeContent` calls, not in each caller.
- [A sitting opens between the editor's display of `pendingTests` and the save.] → No harm: the save refreshes only the tests that are still not begun at commit time. The editor's line is informative, not a confirmation. Only deletion needs a confirmed set, and it gets one (D5).
- [Migration 011 runs with foreign keys off.] → It only rebuilds the tables and copies rows with their ids. `foreign_key_check` must pass before commit, and the backup is taken first. Tests run the migration on a database filled through the API of migration 010, and compare every row before and after.
- [A teacher deletes a question by mistake, and the tests not yet begun lose it.] → The confirmation names every affected test. Taking back means re-creating the question and choosing it again for those tests, the same as after any deletion today. The written tests are never affected.
- [Refreshing re-links `test_image` for the whole test on every save.] → A test has a few dozen images at most, and a save reaches a handful of tests. That is negligible next to the save itself.

## Migration Plan

1. Deploy the image with migration 011. The runner backs up, rebuilds and checks. Existing tests keep their copies unchanged.
2. Existing tests not yet begun are not re-copied at deploy time. They catch up at the next save of each question, or when a teacher changes their selection. Before the deploy, compare the copy of every test not yet begun with the pool on production, using only aggregates (test id, number of differing questions). If anything differs, show Gerald the list and let him decide whether to re-copy those tests, rather than overwriting them silently. Mostly there will be no difference, because teachers used the editor's "update this test" offer (exam-question-editor D8).
3. Rollback: restore the pre-migration backup with the previous image. Deletions made in between are lost along with everything else written since.

## Open Questions

(none. Gerald decided the behaviour on 2026-10-20, and the two points left open in the proposal entry are settled by D5 and D6, and by the question-pool delta for the "used" count.)
