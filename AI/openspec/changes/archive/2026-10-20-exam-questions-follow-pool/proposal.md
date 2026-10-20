Source: AI/open-proposals.md, entry "Fragen: eine Änderung gilt überall, Löschen nimmt sie aus allen Tests" (decided with Gerald on 2026-10-20).

## Why

Today a test copies its questions when it is created (exam-online-tests D2). A typo fixed in the pool reaches a test with next week's sitting only if a teacher finds the test in the editor's list and asks for it. A question that was ever put into a test cannot be deleted at all, only retired, so the pool keeps every abandoned draft for good. Teachers expect the opposite. A change to a question should apply everywhere, and deleting a question should take it out of every test. The copy is only needed for one thing: once a test has been written, it must stay exactly as the students saw it. So the copy should be fixed when the test begins, not when it is created.

## What Changes

- **A test follows the pool until it begins.** A test begins when its first sitting opens, or when its first attempt starts, if that is earlier. Until then, saving a question in the pool changes every test that holds it, at once and without being asked. **BREAKING** (behaviour): the editor's list of unwritten tests and its "update this test" offer go away (exam-question-editor D8).
- **The snapshot is fixed when the test begins.** Make-up sittings use the same snapshot. Later pool edits no longer reach the test.
- **Resetting a test lets it follow the pool again.** If rescheduling or deleting sittings leaves a test with no attempt and no opened sitting, it takes the pool's current version of its questions and follows the pool again.
- **Deleting a question is always allowed.** Any teacher may delete a question, after a confirmation that names the tests not yet begun that hold it. Deleting takes the question out of all those tests. Begun tests keep their copy, and their attempts, grades and images stay unchanged. **BREAKING** (behaviour): the refusal `usedCannotDelete` goes away, along with the advice to retire instead. Retiring stays available.
- **A test may lose its last question.** It then stays as a test without questions. Scheduling a sitting for it is refused, and a student cannot start it until it has questions again. Its page says so.
- **A retired question stays in the tests not yet begun that hold it, and follows edits there.** Retiring only keeps a question out of new choices. A test may keep a retired question it already holds when its selection is changed.
- **The data model allows deleted questions.** A snapshot row lets go of its pool question (`test_question.question_id` becomes `NULL`). A usage record goes with its question. An image a begun test shows outlives its question. Migration 011 rebuilds the three tables, and the migration runner gets a way to run a migration with foreign keys off.
- **"Used" keeps its meaning in the pool browser:** the tests that hold the question, planned or written, with course and date. The admin's correction of a written test now names the snapshot row instead of the pool question, so it also works for a question that has since been deleted.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `online-test`: the snapshot is taken when the test begins, not when it is created. A test not yet begun follows the pool. A reset test follows the pool again. A test without questions cannot be scheduled or started.
- `question-editor`: saving changes every test not yet begun. The offer to update unwritten tests goes away. Deleting is allowed for every question, with a confirmation naming the affected tests. Only begun tests keep old images.
- `question-pool`: the usage a question shows covers the tests that hold it, planned or written. It disappears with the question.

## Impact

- `exam/tests.js`: `snapshot`/`dropSnapshot` become a refresh of the copy for a test not yet begun. New `testBegun`. `createSitting` refuses a test without questions. `rescheduleSitting`/`deleteSitting` refresh a test that is no longer begun. `updateTest` accepts retired questions the test already holds. `removeWrittenQuestion` is keyed by the snapshot row.
- `exam/pool-edit.js`: `saveQuestion` and `deleteQuestion` update the tests not yet begun in the same transaction. `unwrittenTestsWith` gives way to `pendingTestsWith`. Orphaned images are removed.
- `exam/attempts.js`: `startAttempt` refuses a test without questions.
- `exam/pool.js`: `getQuestion` lists the tests not yet begun that hold the question.
- `exam/routes-tests.js`, `exam/routes-pool-edit.js`: the confirmed delete. The admin correction's path takes the snapshot row id.
- `exam/client/question-editor.js`, `exam/client/tests.js`: the editor shows which tests a save or a delete reaches. The test page shows the "no questions" state.
- `exam/db.js` and `exam/migrations/010-questions-follow-pool.sql`: table rebuilds with foreign keys off.
- i18n catalogs (`exam.*`), `test/exam-tests.test.js`, `test/exam-question-editor.test.js`, `test/exam-pool.test.js`, `AI/architecture.md`.
- No change to grading, the gradebook, the live view or the student pages. The Markdown import's take-back rule stays as it is.
