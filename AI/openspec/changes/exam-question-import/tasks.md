Each section ends deployable to secureLectures, where `EXAM_MODULE=on` already runs. Until a teacher imports a file, the pool and every test stay as they were.

## 1. Foundation

- [x] 1.1 Migration `008-question-import.sql` per design D6. Unit test: schema 7 with a filled pool and a written test migrates with every question, snapshot and image unchanged, and every existing question is reviewed
- [x] 1.2 `exam/pool-edit.js`: the body of `createQuestion` moves into `insertQuestion(db, value, { importId, unreviewed })` without its own transaction (D5). `createQuestion` calls it inside `inTransaction`, and the editor's tests pass unchanged
- [x] 1.3 `saveQuestion` clears `unreviewed`. `markReviewed(db, id)` without a version bump (D7). `getQuestion`/`listQuestions` return `unreviewed` and the import's date, teacher and file. `listQuestions` takes `onlyUnreviewed`. Unit tests

## 2. Format and check

- [ ] 2.1 `exam/question-import-format.md` from `format-draft.md` (review with Gerald first). It asks for the hint on `multichoice` too, while the check keeps it optional (design, Open Questions 2)
- [x] 2.2 `exam/question-import.js`: `parseQuestionFile` per D3 (front matter, fences, headings, header lines, `marked` lexer, task lists, line numbers). Unit tests: the description's example parses with zero problems, `#` inside a code block, `CI/CD` in a path, CRLF and BOM, missing `en:`, question before any category, image and raw HTML refused
- [x] 2.3 `checkQuestionFile` per D4: editor rules through `questionProblems` mapped to lines, pairing pattern, hint (required for `multichoiceset` in both languages and equal to the count, 1 if present for `multichoice`), category path depth, limits, same hash. Unit tests for each rule and several problems at once. Timing test with 200 questions
- [x] 2.4 Plan for a clean file: counts per category and type, new categories, near duplicates (D4)

## 3. Import and take back

- [x] 3.1 `importQuestionFile` per D5: check again, one transaction, categories along German paths, questions via `insertQuestion` with `import_id` and `unreviewed = 1`, report stored. Unit tests: existing category matched and appended at its end, new subcategory created, nothing written when one question fails, existing questions and tests unchanged
- [x] 3.2 `takeBackImport` per D10: refused with titles while a question is used, otherwise questions, then empty created categories (deepest first), then the import row. A category filled since stays. Unit tests, including the identical file accepted again afterwards
- [x] 3.3 `exam/routes-pool-import.js`: `POST /api/pool/imports/check`, `POST /api/pool/imports` (raw text, 1 MB, `?name=`), `GET /api/pool/imports`, `DELETE /api/pool/imports/:id`, `POST /api/pool/questions/:id/reviewed`, `GET /pool/import/format` with the category tree (D2), page `GET /pool/import` via `teacherShell`. All behind `requireTeacher`/`teacherPage`. Registered in `exam/index.js`

## 4. Client

- [x] 4.1 Import page element (D9): download, file choice and drop, problems sorted by line with "Copy problems", preview with "Import n questions", past imports with "Take back" confirmed in the page
- [x] 4.2 Pool browser (D8): "Import questions" button, amber stripe and badge for unreviewed rows next to chosen/clicked, filter "Not reviewed (n)" and `?unreviewed=1`, preview banner with "Mark as reviewed" that moves on to the next one, the count of unreviewed questions in the assembly panel. CSS tokens for both themes in `css/exam.css`

## 5. Verification and docs

- [x] 5.1 Harness checks: a student and a teacher in student view refused on page, format description and API. Upload of a broken file lists its problems with lines and stores nothing. A clean upload previews, imports, and lands in the browser with the filter on and the rows highlighted. "Mark as reviewed" and an editor save clear the mark. Take back works and is refused once a question is in a test. Same file refused, and accepted again after taking back. The downloaded description lists the current categories
- [x] 5.2 Smoke test with a real file: give `format-draft.md`'s successor to a fresh Claude with a topic and import its file unchanged. Record how many problems came back and sharpen the description where they cluster
  - 2026-10-18: a fresh Claude given only the served description and the topic "HTTP caching" wrote 8 questions (4 multichoiceset, 2 multichoice, 2 truefalse) under the existing "HTTP und REST / Caching". The file checked with 0 problems and imported unchanged, so there was no cluster to sharpen.
- [x] 5.3 `docs-exam-module.md`: section "Importing Questions" and the sentence "There is no re-import and no export" corrected. `AI/exam-module-plan.md` section 2 likewise. `AI/architecture.md` component map
