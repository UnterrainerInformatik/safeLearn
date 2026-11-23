## Context

The pool's types are fixed in three places that must move together: the `CHECK` on `question.type` (migration 005) and on the snapshot `test_question.type` (rebuilt in 011), and `questionTypes` in `exam/pool-import.js`, which the editor (`pool-edit.js`) and the Markdown import (`question-import.js`) share. SQLite cannot change a `CHECK` in place, so both tables have to be rebuilt the way 011 did it: `-- foreign_keys: off`, copy with ids, drop, rename, recreate the indexes and the closed-year triggers (010/011), with the runner's `foreign_key_check` before the commit.

`pool-quickie` builds on this change. It puts free-text questions into offline tests and grades them. This change only makes the pool able to hold them and keeps them out of online tests.

## Goals / Non-Goals

**Goals:**
- One more type with a model solution, through every path that writes a question: editor, Markdown import, snapshot.
- Online tests can never hold a free-text question, enforced on the server, not only in the browser.

**Non-Goals:**
- Grading, points or weights for free-text questions (`pool-quickie`).
- Free-text answers in online attempts, the review and the board solution (a later optional change).
- Re-importing the 9 Moodle `essay` questions. The one-time Moodle import stays closed. Such questions come in through the Markdown import.

## Decisions

**D1 - The model solution is two columns on the question, not an answer row.** `question.solution_de` and `solution_en` (sanitized HTML, `NULL` for choice questions) and the same two columns on `test_question`, so that a begun offline test (`pool-quickie`) keeps the solution it was written against. Storing the solution as a single "answer" row would put a correct flag and shuffling on something that has neither, and every choice-question query would have to filter it out. A `CHECK` ties the columns to the type: both present for `freetext`, both `NULL` otherwise.

**D2 - Images in model solutions follow the text's rules.** The editor already resolves and garbage-collects images per question across `text_*` and answer texts (`writeContent`, `imageSources`). The model solution joins that list of texts, so an uploaded image in a solution is stored, served and kept for begun tests exactly like one in the question text. The import still refuses images.

**D3 - The type guard sits in `pool-edit.js` and in test assembly.** Changing a question to `freetext` is refused while any test of kind `online` that has not begun holds it (the same "not begun" query the editor uses to name affected tests). Test creation and question changes in `exam/tests.js` refuse a free-text question for an online test. The browser greys the box out. The server check is the guarantee, so a stale page cannot get around it.

**D4 - Import syntax: `#### solution` under each language.** It is language-neutral like `### de`/`### en`, and it cannot collide with question text, because the format allows no headings in texts. The parser ends the question text at `#### solution`. For a `freetext` question everything up to the next `###`/`##`/`#` is the model solution.

**D5 - Type selector in the browser is client-side.** The browser already loads the category's questions with their type (`client/pool.js`). The selector filters that list, as the search does. It needs no server change and no new route.

## Risks / Trade-offs

- [Rebuilding `question` and `test_question` on a live database] → same proven pattern as 011, a backup before the migration (`exam-foundation`), and a unit test that runs the migration on a copy with tests, attempts and a closed year and checks that every row and trigger survives.
- [A question in a planned online test cannot become free text] → intended. The refusal names the tests, and the teacher removes the question from them first.

## Migration Plan

Migration `023-freetext-questions.sql`, foreign keys off. Existing rows get `solution_* = NULL`, and every existing question keeps its type. Rollback is restoring the pre-migration backup, as for every migration.
