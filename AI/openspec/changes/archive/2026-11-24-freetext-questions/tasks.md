## 1. Data

- [x] 1.1 `exam/migrations/023-freetext-questions.sql` (`-- foreign_keys: off`): rebuild `question` and `test_question` with `freetext` in the type `CHECK` and `solution_de`/`solution_en` (sanitized HTML, `NULL` unless `freetext`, both present for `freetext`), keeping ids, indexes and the closed-year triggers of 010/011 (design D1, Migration Plan). Verify with a unit test on a copy holding tests, attempts and a closed year: every row survives, `foreign_key_check` is clean, and a write to a closed year's `test_question` is still refused
- [x] 1.2 `exam/pool-import.js`: `questionTypes` gains `freetext`, and the Moodle import keeps dropping `essay` (its report unchanged). Verify the existing Moodle import test still reports 94 imported and 9 dropped

## 2. Server: pool and editor

- [x] 2.1 `exam/pool.js`: the question's and the preview's payload carry `solutionDe`/`solutionEn` for `freetext` and no answers. Verify with a unit test
- [x] 2.2 `exam/pool-edit.js` validation: a `freetext` question needs both model solutions and ignores and drops any answers; refusal messages per missing language (spec "A question is saved only if …"). Verify the scenarios "A model solution missing in English" and "A choice question becomes a free-text question"
- [x] 2.3 `exam/pool-edit.js` `writeContent`: model solutions are sanitized and their images resolved, staged and garbage-collected like the question text, and copied into every test not yet begun (design D2). Verify that an image uploaded into a model solution is served and survives as long as a begun test shows it
- [x] 2.4 `exam/pool-edit.js`: refuse a change to `freetext` while an online test that has not begun holds the question, naming those tests (design D3). Verify "Changing the type of a question planned for an online test" and "… of a written test"

## 3. Server: online tests

- [x] 3.1 `exam/tests.js`: creating an online test and changing its questions refuse a `freetext` question, naming it (spec `online-test` "An online test holds no free-text question"). Verify "A request with a free-text question"

## 4. Server: Markdown import

- [x] 4.1 `exam/question-import.js` parser: `type: freetext`, `#### solution` under `de` and `en` ending the question text (design D4). Verify "A free-text question" (import)
- [x] 4.2 `exam/question-import.js` check: a model solution in both languages, no task list on `freetext`, no `#### solution` on other types, no answer-count hint rule for `freetext`, all with line and title. Verify "A free-text question without an English solution" and "Answers on a free-text question"
- [x] 4.3 `exam/question-import.js`: preview counts per type include `freetext`; the format description has a complete `freetext` example and the new rule (spec "The format description tells a Claude everything it needs"). Verify "The free-text example"

## 5. Client

- [x] 5.1 `exam/client/question-editor.js`: for `freetext`, the model solution side by side in rich text in place of the answers; switching the type hides the answers and keeps them until the save. Verify in the browser check (7.1)
- [x] 5.2 `exam/client/pool.js`: a type selector (all types and each type, default all) combined with search and category (design D5); the preview of a `freetext` question shows the model solution in the chosen language; while assembling, `freetext` rows have no box and show the reason
- [x] 5.3 `exam/client/pool-import.js`: the preview's count per type shows `freetext`
- [x] 5.4 `i18n/de.json`, `i18n/en.json` (BabelEdit format, same keys): the type label `freetext` (same label in pool and editor, `exam-ui-conventions`), "Model solution", the selector's "All types", the refusals (solution missing de/en, type change blocked by tests, free-text in online test, import problems), the assembly reason. Verify with `test/i18n-catalog.test.js`

## 6. Existing tests

- [x] 6.1 Update unit tests that assume three types (`test/exam-pool.test.js`, `test/exam-question-editor.test.js`, `test/exam-question-import.test.js`, `test/exam-tests.test.js`), so that each one asserts the new rule rather than being deleted

## 7. Verification

- [x] 7.1 Browser check in the existing exam checks (registered in `test/coverage-map.json`): create a free-text question in the editor with a model solution in both languages, find it with the type selector, preview it in English with its model solution, see it without a box while assembling an online test for a course, and import a Markdown file holding one free-text question
- [x] 7.2 Run the affected unit tests and checks, fix what fails, then run the full `npm test` once

## 8. Docs

- [x] 8.1 `docs-exam-module.md`: the type `freetext`, the model solution, the type selector, the import syntax
- [x] 8.2 `AI/architecture.md`: the type list, `solution_*` on `question` and `test_question`, the online-test guard
