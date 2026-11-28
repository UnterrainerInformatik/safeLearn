## Why

A teacher who has held a test in one class often wants to give the same test, or a slightly changed one, to another class. The trigger was the TLS test held in 5c, which is now due in 5a. Today the only way is to tick the same questions again in the question browser and re-enter every weight. For a test on paper, the teacher also has to choose group B again and re-enter every answer space. That is tedious, and it is easy to get one wrong.

## What Changes

- **New:** the page of every test offers "copy to a course". This covers online tests, tests on paper, and offline tests with handouts. The teacher picks a target course from the courses they see in an open school year. The same course may be chosen, which gives a second variant of the test. The teacher can change the name, which defaults to the source test's name. For an offline test the teacher also picks the gradebook category, among those the target course uses, preset to the source's.
- The copy is a **new test that has not begun**. It has no sitting, no attempt and no grade. It holds the source's questions **as the pool holds them now**, not as the source's snapshot holds them. The copy keeps the order, each question's weight and, for a test on paper, group B and each free-text question's answer lines. An offline test also keeps its duration, its handouts and the handout variables a teacher set.
- A question that can no longer be copied is left out, and the result names it. This applies to a question deleted from the pool, a retired question, and, for an online test, a question that has become free-text since. If no question is left, the copy is refused, unless the source had none (an offline test with handouts or without anything).
- After copying, the teacher lands on the new test's page. From there they change it like any test not yet begun (remove a question, add one, reweight) and plan a sitting. The source test is not changed.

## Capabilities

### New Capabilities

- `test-copy`: copying a test into a course as a new, not yet begun test. Covers what is copied and what is not, what is left out, who may copy into which course, and where the copy leads.

### Modified Capabilities

(none). The copy uses the existing rules of `online-test`, `offline-test`, `offline-test-questions` and `exam-handout` for the new test. None of their requirements changes.

## Impact

- `exam/tests.js`: new `copyTest(db, sourceId, targetCourseId, { name, gradebookKind })`. It reuses `chosenQuestions`, `snapshot` (with `settings` for weight and answer lines, per group), `nextHandouts` and the column creation of `createOfflineTest`.
- `exam/routes-tests.js`: `POST /api/tests/:id/copy`. The source and the target course are both resolved through `visibleRecord`/`classScope`, so a teacher copies only between classes they are entered in.
- `exam/client/tests.js`: the button and the dialog on the test's page, and the list of left-out questions after copying.
- `i18n/de.json`, `i18n/en.json`: labels, dialog and notices (BabelEdit format, same keys in both).
- `test/exam.test.js`: server and browser checks.
- `docs-exam-module.md`: describe copying.
- No migration. Closed years are already guarded by the existing triggers.
