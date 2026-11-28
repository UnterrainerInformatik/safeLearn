## Context

A test is one `test` row with its course, its kind (`online`/`offline`), `paper`, `duration_s`, `handout_a`/`handout_b` and, for offline tests, `assessment_id` (the gradebook column). Its questions are `test_question` rows (`exam/tests.js`). Each row holds a copy of the pool question's texts, plus `position`, `weight`, `handout_group` and `answer_lines`, and has its own `test_answer` rows. Until the test begins, `refreshCopy`/`followPoolIfNotBegun` keep that copy equal to the pool. After that it is the snapshot. Handout variables set by a teacher are `test_variable` rows. `CLASS` and `DATE` are computed and never stored.

The building blocks already exist:
- `chosenQuestions(db, ids, { paper })` validates pool questions (present, not retired, no free-text online).
- `snapshot(db, test, questions, { group, settings })` copies them in, records usage and links images. `settings` carries weight and answer lines per pool question id.
- `createOfflineTest` creates the gradebook column and checks the category against `course.categoriesInUse`.
- Scope is enforced by `visibleRecord(db, classScope, kind, id)`, which answers `404` outside the session's classes. Closed years are refused by the database triggers and by `getCourse(...).year.closed`.

See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- one server function that builds the copy in one transaction from the source's *pool ids* and settings
- the dialog on the test's page, and a landing on the new test

**Non-Goals:**
- no copying of several tests at once, and no "copy a whole course's tests". The year change keeps copying courses without tests.
- no copy from the source's snapshot. Texts always come from the pool now (see D1).
- no linking between source and copy. After copying they are two independent tests.
- no copy from the question browser. The entry point is the test's page only.

## Decisions

### D1: The copy reads pool ids and settings from the source, then assembles like a new test

`copyTest(db, sourceId, targetCourseId, { name, gradebookKind })` does the following:

1. It reads the source's `test_question` rows per group, ordered by `position`, and takes `question_id`, `weight` and `answer_lines` from them.
2. It sorts each pool id into kept or left out. A pool id is left out when its `question_id` is NULL or no longer in `question` (`deleted`), when the question is retired (`retired`), or when the target is online and the question is free-text (`freetext`). This filtering is done before `chosenQuestions`, which would otherwise refuse the whole request on the first bad id.
3. Inside one transaction it inserts the `test` row as `createTest`/`createOfflineTest` would. For offline tests this includes the column. It then calls `snapshot` for group A and group B, each with its own `settings` map. A group-B-only result is promoted to A, the same as `settleGroups` does.
4. For offline tests it copies the `test_variable` rows of the source.
5. It returns `getTest(newId)` plus `leftOut: [{ name, reason }]`.

*Alternative:* copy the source's `test_question` rows as they are, i.e. the snapshot. This was rejected. The teacher asked for the current pool version, and a copy that has not begun must follow the pool anyway (`online-test`). A snapshot copy would be overwritten by the next `refreshCopy`, or would wrongly stay stale.

The shared core is pulled out of `createTest`/`createOfflineTest`: the insert of the `test` row and the column. Then the three paths cannot drift apart.

### D2: Left-out questions are a list, not an error, unless nothing remains

A copy that drops one retired question is still what the teacher wants. So the answer carries `leftOut`, and the client shows it once on the new test's page (passed via `sessionStorage`, like the bar's cascade key). Only "source had questions, none remain" is refused, with a `ConflictError("exam.errors.tests.copyNothingLeft", { names })`. That error is thrown before the transaction, so no column is created either.

### D3: Route and scope

`POST /api/tests/:id/copy` takes the body `{ courseId, name, gradebookKind? }`. The source goes through `seen(req, "test", id)`, the target through `seen(req, "course", courseId)`, so both are `404` outside the session's classes. The route sits behind `requireTeacher` like every test route, which already refuses a teacher in student view. A target in a closed year is refused by `getCourse(...).year.closed` with `exam.errors.years.closed` before any write. The triggers remain as a backstop.

The dialog needs the possible targets. `GET /api/tests/:id/copy-targets` returns the courses of every visible class in open years, grouped by year and class, each with `categoriesInUse`. It is built from the same `coursesInScope`/`classScope` as `listTests`. *Alternative:* the client walks `/years` → `/years/:id/classes` → `/courses/:id`. That takes several round trips and duplicates the closed-year filter on the client.

### D4: The dialog on the test's page

There is a button "Für einen Kurs kopieren" / "Copy to a course" next to the discard section, in every state of the test. It opens an inline form, in the same pattern as `offlineTestForm`, with:
- a `<select>` of target courses grouped with `<optgroup>` per year/class. It is preset to the bar's chosen course if that is a different one, otherwise to the source's.
- the name field, preset to the source's name.
- for offline tests, the category radio. It is rebuilt when the target changes, from that course's `categoriesInUse`, and preset to the source's category when available.

On success the client sets the bar's selection to the target course and navigates to `/exam/tests/<newId>`. That page shows the `leftOut` list once, as a notice above the questions.

## Risks / Trade-offs

- [A handout path no longer resolves at copy time] → The copy keeps the path as is, without re-validating it through `chosenHandout`, so the copy is not refused. The existing start check (`exam-handout`) already refuses starting a sitting while a handout does not resolve, and the test's page already shows it.
- [The source is a discarded test whose questions were dropped from the snapshot] → `test_question` rows are kept by a discard (attempts, sittings, grades and notes go, and the test follows the pool again), so the pool ids are still there. If a row's `question_id` is NULL, it is reported as `deleted`.
- [Teachers copy into the wrong course] → The landing on the new test's page with the target chosen in the bar makes the target obvious. Deleting a test that has not begun is already allowed.
- [Usage dates] → `snapshot` records usage dated today, and `refreshUsageDate` moves it once a sitting is planned. This is unchanged behaviour.

## Migration Plan

No schema change. Deploy as usual. Rollback means reverting the commit. Copies made in the meantime are ordinary tests.
