## 1. Server: the copy

- [x] 1.1 Extract the shared insert of the `test` row (and, for offline tests, the gradebook column with the category check) out of `createTest`/`createOfflineTest` in `exam/tests.js`, without changing their behaviour (D1)
- [x] 1.2 Add `copyTest(db, sourceId, targetCourseId, { name, gradebookKind })`. Read pool ids, weight and answer lines per group in order, and sort them into kept and `leftOut` (`deleted`, `retired`, `freetext` for online). Assemble in one transaction via `snapshot` with per-group `settings`, promote an emptied group A, and copy `test_variable` rows, duration and handouts for offline tests (D1)
- [x] 1.3 Refuse with `exam.errors.tests.copyNothingLeft` (naming the questions) when the source had questions and none remain, before any write. Refuse a closed target year with `exam.errors.years.closed` (D2, D3)
- [x] 1.4 Add `copyTargets(db, sourceId, scope)`: the visible courses in open years, grouped by year and class, each with `categoriesInUse` (D3)
- [x] 1.5 Routes in `exam/routes-tests.js`: `POST /api/tests/:id/copy` and `GET /api/tests/:id/copy-targets`, both behind `requireTeacher`. Source and target go through `seen(...)`, so anything outside the session's classes answers `404` (D3)

## 2. Client: dialog and landing

- [x] 2.1 `exam/client/tests.js`: a "copy to a course" button on the test's page in every state, opening an inline form with the grouped target `<select>` (preset to the bar's other course, else the source's), the name field (preset) and, for offline tests, the category choice rebuilt per target (D4)
- [x] 2.2 On success, set the bar's choice to the target course, navigate to the new test, and show the `leftOut` list once as a notice there (D2, D4). Show refusals at the form
- [x] 2.3 i18n keys in `i18n/de.json` and `i18n/en.json` (same keys, BabelEdit format): button, form labels, submit, left-out notice with the three reasons, `copyNothingLeft`
- [x] 2.4 Styles in `css/exam.css` for the form, following `offlineTestForm`

## 3. Tests and docs

- [x] 3.1 `test/exam.test.js` server checks: weights, order, group B and answer lines kept; current pool text instead of the snapshot; source unchanged (questions, snapshot, sittings, usage); usage recorded for the target; handouts, duration and variables of an offline test copied, column created in the target
- [x] 3.2 Server checks for left-out questions: retired and deleted left out and named, free-text left out of an online copy, emptied group A promoted, nothing left refused with no test and no column created
- [x] 3.3 Server checks for scope: target in a class the teacher is not entered in answers `404`, closed target year refused, student refused, category not in use refused
- [x] 3.4 Browser check: a teacher copies a written test to another course, lands on the new test with that course in the bar, removes a question and plans a sitting
- [x] 3.5 `docs-exam-module.md`: describe copying a test
- [x] 3.6 Run the affected checks, then the full `npm test` once
