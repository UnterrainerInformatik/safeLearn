Each section ends deployable to secureLectures, where `EXAM_MODULE=on` already runs, and leaves the pool and every test as they were until a teacher saves something (design D11).

## 1. Move P7 out of `exam-module`

- [x] 1.1 In `exam-module`: tasks section 7 becomes a pointer to this change, `specs/question-editor/` is removed, the proposal lists `question-editor` as moved, the open question on deleting used questions points to this design's D6; `AI/open-proposals.md`'s exam-module entry records the split; `openspec validate` passes for both changes

## 2. Foundation

- [x] 2.1 Migration `007-question-editor.sql`: `image_upload` per D4 and `question.version INTEGER NOT NULL DEFAULT 1` per D7; unit test that schema 6 with a filled pool and a written test migrates with every question, snapshot and image unchanged
- [x] 2.2 `exam/stored-html.js`: `cleanStoredHtml` and `trueFalseText` moved out of `exam/pool-import.js` (D2); the importer uses them, and its existing unit tests pass unchanged
- [x] 2.3 `getQuestion` returns `version`

## 3. Editing existing questions

- [x] 3.1 `exam/pool-edit.js`: validation per the spec's list, collecting every problem with its field and answer; unit tests for each rule and for several problems reported at once
- [x] 3.2 `saveQuestion` per D5: version check (409), answers replaced, images resolved through the editor's resolver (own images kept, foreign ones and `data:` refused), unreferenced images without `test_image` removed; `truefalse` with the fixed words; unit tests incl. "image a snapshot shows survives its removal from the text"
- [x] 3.3 `exam/routes-pool-edit.js`: `PUT /pool/questions/:id` behind `requireTeacher`; editor page `GET /exam/pool/questions/:id` through `teacherShell` (D9); registered in `exam/index.js`
- [x] 3.4 Client `<sl-rich-text>` per D3: toolbar (bold, italic, inline code, code block, lists, image), paste filter, value as HTML; CSS for both themes in `css/exam.css`
- [x] 3.5 Client editor element: DE and EN side by side per row, type, category, answers as pairs with one correct flag, add/remove/reorder, problems shown at their fields, 409 keeps the form and offers the current version; "Edit" in the pool preview, return to the browser with `?category=`
- [x] 3.6 Harness checks: a student and a teacher in student view refused on page and API, mismatch refused with the answer named, a stored text has no `style` and no script after a styled save, a written test's snapshot unchanged after an edit, the second of two concurrent saves refused

## 4. New questions and images

- [x] 4.1 `POST /pool/questions` with category, appended at the end of its category; "New question" in the browser when a category is chosen; `GET /exam/pool/questions/new?category=`
- [x] 4.2 Uploads per D4: `POST /pool/uploads` with `express.raw` (2 MB) on that route only, type from the content's signature, random token; `GET /pool/uploads/:token` for teachers; staged images turned into the question's images on save, identical ones reused
- [x] 4.3 Purge of uploads older than 24 hours at start and on the daily backup timer; unit test
- [x] 4.4 Rich-text image button, paste and drop of image files through the upload
- [x] 4.5 Harness checks: 20 MB refused with the limit named, a `.png`-named PDF refused, an unsaved upload not served after the purge, a student refused on both upload routes, a new question with an image shown in the browser and in a test assembled from it

## 5. Retire, revive, delete

- [x] 5.1 Retire and revive (bump `version`), delete only without `question_usage` and `test_question` per D6, with a sentence instead of a constraint error; buttons in the editor, retired questions marked
- [x] 5.2 Harness checks: a used question's delete refused with retire offered, retire keeps tests and usage, a retired question refused in assembly and revived back into it, a fresh question deleted with its answers and images

## 6. Categories

- [x] 6.1 Category API per D10: create, rename both names, move up/down and under a parent with the cycle check, delete only when empty incl. retired questions and subcategories; duplicate names answered with 409
- [x] 6.2 Category page `/exam/pool/categories` with the tree and per-node actions, linked from the browser; category choice in the editor moves a question
- [x] 6.3 Harness checks: non-empty delete refused, move into own subtree refused, a moved question listed in its new category with its usage unchanged

## 7. Unwritten tests take up an edit

- [x] 7.1 The save's answer lists unwritten tests holding the question (D8); the editor offers "Update this test" per test through the existing test update with unchanged question order; a retired question's refusal shown
- [x] 7.2 Harness checks: without the click the test keeps the old text; with it, the new text and the same questions in the same order; a test written in the meantime refused

## 8. Wrap-up

- [x] 8.1 `AI/architecture.md` (component map, routes, data, permissions) and `docs-exam-module.md` (the editor, upload limits, retire versus delete)
- [x] 8.2 Run `npm test` in both module configurations and record the result
  - 2026-10-17: `npm test` 548/549 - `test/exam.test.js` (module on, 69 checks, 11 of them the editor's incl. the rich-text field in Chrome) and the unit files `exam-question-editor` (33, incl. migration 6→7), `exam-pool` (importer unchanged after the move to `stored-html.js`), `exam-tests`, `exam-gradebook`, `exam-foundation` and `coverage` green. The one failure was the reload-backoff check of `deployment-surface` (module off), red in two full runs of `test/content.test.js` (166/167) and green twice when run alone; it times the hot-reload stream, which this change does not touch.
- [ ] 8.3 Deploy to secureLectures, smoke-check with Gerald's teacher account on one real question (edit and save without changing it, then a fix), record in `AI/open-proposals.md`
