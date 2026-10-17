Source: phase P7 of the change `exam-module` (tasks section 7), split out on 2026-10-17 at Gerald's request, the same way P3 became `exam-online-tests`. The backlog entry **Prüfungsmodul: Online-MC-Tests und Notenbuch** stays with `exam-module`, which still carries P5.

## Why

The pool in secureLectures holds the 94 questions imported from Moodle, and since that import the database is the pool's only source of truth: there is no re-import and no export (`AI/exam-module-plan.md`, section 2). Online tests are now assembled from it (`exam-online-tests`). Today a teacher can browse the pool but cannot fix a typo, correct a wrong flag or add a question, except by having someone edit the SQLite file by hand on babylon5. The pool also wears out: everyone gets the same questions, and the solution is shown on the board (`exam-module` design, Risks), so the editor is what keeps it growing. A change of its own gives P7 its own review and its own archive date, without waiting for P5.

## What Changes

- **A question editor page** for teachers, reached from the pool browser: "Edit" on a question's preview, and "New question" in the chosen category. German and English side by side: short title, question text, answers with their correct flags, type and category. Texts are edited in a narrow rich-text field (bold, italic, inline code, code block, lists, image) that works directly on the stored HTML. The server sanitizes every save with the renderer's sanitizer, as the import did.
- **Validation before anything is stored:** every text present in both languages, the answers paired across the languages, the correct flags fitting the type (exactly one for `multichoice`, at least one for `multichoiceset`, the fixed two answers for `truefalse`). A refusal names what is wrong.
- **Concurrent edits are caught:** a save carries the version it was read at, and a question changed in between is refused instead of overwritten.
- **Images:** a teacher uploads an image into a text. Only PNG, JPEG, GIF and WebP are accepted, recognized by their content, up to 2 MB. They are stored in the database like the imported ones and served by the same route. An edit adds images and never changes or deletes one that a test's snapshot shows.
- **Existing tests stay as they were.** Saving changes the pool only. If the question sits in tests that have not been written yet, the editor lists them and offers to bring them up to the new version. Nothing changes unless the teacher asks.
- **Retire, delete and revive:** a question that was never used can be deleted. A used one can only be retired, which hides it from new tests and keeps its usage history. A retired question can be revived.
- **Category maintenance:** create, rename (both languages), move under another parent or among its siblings, and move questions between categories. A category that still holds questions or subcategories cannot be deleted.
- **`exam-module` gives up P7.** Its tasks section 7 and its `question-editor` spec move here, and its open question on retiring is settled here (design D6). What stays there points to this change.

## Capabilities

### New Capabilities

- `question-editor`: creating, editing, retiring, reviving and deleting pool questions online in both languages, image upload, category maintenance, and the boundary to existing tests. Moved from `exam-module`, where it was planned but never implemented, and made concrete against the pool and the online tests as they now exist.

### Modified Capabilities

None. The question browser (`question-pool`) and the online tests (`online-test`) are still specs of unarchived changes. The entry points into the editor and the offer to refresh unwritten tests are therefore specified in `question-editor` itself.

## Impact

- **Code:** `exam/` and `css/exam.css` only. New `exam/pool-edit.js` (validation, save, retire/revive/delete, categories, images) and `exam/routes-pool-edit.js`. The importer's HTML cleaning (`storedHtml` in `exam/pool-import.js`) becomes a shared function both paths use. New client elements: the editor, the rich-text field and the category page. The pool browser gets its entry points. `updateTest` in `exam/tests.js` is reused for the refresh offer, unchanged.
- **Data:** migration `007-question-editor.sql` adds a staging table for uploads that are not yet saved with a question, and a version column for the concurrency check. No existing row is rewritten. The pre-migration backup is taken as for every migration.
- **APIs:** under `/exam/api/pool/`: create, update, retire, revive and delete a question; upload an image; create, update, move and delete a category. Every route sits behind `requireTeacher`. The upload route parses its own raw body with its own limit, so the global `express.json()` limit is untouched.
- **Tests:** unit tests for validation and HTML cleaning, and harness checks for refusals, snapshot stability, retire/delete and the upload limits.
- **Rollout:** secureLectures already runs with `EXAM_MODULE=on`. The editor is a teacher's tool, and no student sees anything until a test is written.
