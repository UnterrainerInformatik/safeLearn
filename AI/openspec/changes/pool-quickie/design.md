## Context

`test_question` is keyed by `test`, not by its kind. An offline test (`kind = 'offline'`, migration 013) could hold questions already, but every guard about questions asks for `kind = 'online'`. The snapshot logic (`testBegun`, the copy of pool edits into tests not yet begun in `pool-edit.js`) knows "begun" only as "first sitting opened or first attempt started". An offline sitting opens by `started_at`. An online attempt stores `score` (integer, number of scored questions) and `question_count`, and the sheet, the result view and the review divide one by the other. The gradebook already turns a grade into a fraction with `bandMidpoint(grade, scale)` (`grading.js`) on every read. An offline test's column is an ordinary manual `assessment` with `manual_entry` rows, and the factor A:B is applied on read (`020-offline-group-factor.sql`, `gradebook.js`). `freetext-questions` adds the type and `solution_*` on `question`/`test_question`, and is applied first.

## Goals / Non-Goals

**Goals:**
- One weight model for online and paper tests that leaves every existing result unchanged.
- A paper test that reuses everything an offline test already has: sittings, start button, attendance, groups, factor, make-ups, print shell, column, evaluation.
- Results computed on read, so that a change of a weight, a grade or the scale needs no recomputation step.

**Non-Goals:**
- Free-text questions in online tests, and teacher correction of online attempts (a later, optional change).
- Showing per-question grades to students, a board-solution deck for paper tests, a per-question evaluation.
- Shuffling questions or answers on paper: every sheet of a group is the same.

## Decisions

**D1 - Weight is an integer 1-10 on `test_question`, and the online score stays an integer.** `test_question.weight INTEGER NOT NULL DEFAULT 1`. `scoreAttempt` sums the weights of scored questions. `attempt.question_count` keeps its name and holds the total weight from now on, set where it is set today (attempt start, and the admin's removal of a question in `tests.js`). Because every existing row has weight 1, every stored score and count is already correct, and no data migration of attempts is needed. Fractional weights were considered and rejected: they would turn `score` into a REAL and the shown points into decimals, for no gain teachers asked for.

**D2 - The group is a column of `test_question`, `A` for online tests.** `handout_group TEXT NOT NULL DEFAULT 'A' CHECK (IN ('A','B'))`. The uniqueness becomes `(test_id, handout_group, question_id)` and `(test_id, handout_group, position)`, so a question can be in both groups. Keeping the column `NULL` for online tests was rejected, because SQLite treats NULLs as distinct in `UNIQUE` and the per-test uniqueness of online questions would be lost. This needs one more rebuild of `test_question` (pattern of 011/023). `answer_lines INTEGER` (1-40, default 6, only meaningful for `freetext`) goes in the same rebuild.

**D3 - "Begun" for an offline test is its first started sitting.** `testBegun` gains the offline case `EXISTS sitting WHERE test_id = ? AND started_at IS NOT NULL`. The rest follows: the pool's edits stop reaching the test, the snapshot is fixed in `startSitting` (the same freeze function online tests use when their first sitting opens), and questions and the online weight lock. The start guard refuses a test with questions in neither group. To tell such a test from an offline test that never had questions (which starts as before), migration 024 adds `test.paper`, set when a test is created on paper from the pool and kept when its last question goes from the pool. The handout guard (resolving, variables) applies only to tests with handouts. A test with handouts refuses questions, and the other way round, in `tests.js`.

**D4 - Grades in a table of their own, keyed by question and student.** `question_grade (test_question_id REFERENCES test_question ON DELETE CASCADE, username, grade INTEGER CHECK (BETWEEN 1 AND 5), updated_at, PRIMARY KEY (test_question_id, username))`, with the closed-year triggers every result table has. A retake writes over the same row. A group change keeps the rows, because they belong to the question, not to the group. Discarding an offline test (`exam-record-maintenance`) and the leavers' purge (`school-year-change`) delete them as they delete `manual_entry` rows. Deleting the test is refused while any row exists.

**D5 - The column is computed on read, the assessment row stays.** The offline test keeps its `assessment` (name, date, category, notes, evaluation, ordering all keep working). For a test with questions, `gradebook.js` takes no `manual_entry` for it. It computes per student: the group that counts (existing rule), the questions of that group, and, only when each has a grade, `Σ weight·bandMidpoint(grade, scale) / Σ weight`, then the factor A:B as today. The sheet marks the field read-only like an online field, and the test evaluation reads the same values. Writing the result into `manual_entry` on each grade was rejected: a scale change would leave stale values, and a grade result's fraction must move with the scale (`gradebook`).

**D6 - The printed sheet is rendered by the server into the handout's print shell.** A route next to the handout prints (`routes-handout.js`) renders the group's questions, from the pool or the snapshot as D3 decides, in the course's language: header, name line, numbered questions with their weights, boxes, `answer_lines` empty ruled lines, or for the solution the ticked boxes and the `solution_*` HTML. `DATE` comes from the helper the handout variables use. The texts are already sanitized HTML from the pool, so no Markdown rendering is involved. Teacher-only like every print.

**D7 - Assembly reuses the browser with a target.** `client/pool.js` gets a create form with "online" or "on paper", and for paper the duration and the category. From a paper test's page, "Choose questions for group B" (and "… for group A" for later changes) opens the browser with `?test=<id>&group=A|B`, which ticks the group's current questions and saves the selection back to the test. Free-text rows are tickable only for paper targets (`freetext-questions` D3 decides for online).

**D8 - The correction table reuses the sheet's field and keyboard code.** It is a section of the test's page with a table per group. Its fields are the sheet's grade fields (saving marks, refusal, arrow keys), and the result column uses the same formatting as the column. Its routes check the teacher session, and that the student was present in a started sitting of the test and the question belongs to their counting group.

## Risks / Trade-offs

- [Another rebuild of `test_question`, with live attempts referencing it] → same runner with foreign keys off and `foreign_key_check`, a backup before, and a unit test on a copy with attempts, responses and a closed year.
- [`question_count` now means total weight, and the name lies] → a comment in the migration and `AI/architecture.md`. Renaming the column would touch every query and is not worth it.
- [Teachers expect to type the total as before] → the column dialog leads to the correction table, and a test with handouts keeps the editable column.
- [A grade 5 counts as 25 %, not 0] → this is the gradebook's existing rule for grade results, which Gerald confirmed for this change. With all fives the result is 25 %, which still grades 5.

## Migration Plan

Migration `024-weights-and-paper-questions.sql`, foreign keys off: rebuild `test_question` with `weight` (1), `handout_group` (`A`), `answer_lines` (6) and the new uniqueness, recreate the triggers, and create `question_grade` with its triggers. No attempt rows change. Rollback is the pre-migration backup.
