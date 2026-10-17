## Context

See `proposal.md` for the motivation and `specs/question-editor/spec.md` for the behaviour. The module's architecture (dynamic import, `node:sqlite`, migrations with pre-migration copies, vanilla custom elements without a build, the teacher gate and its student-view downgrade, the bar and `teacherShell`) is in `exam-module`'s design D1–D5 and `exam-navigation`. It is not repeated here.

What exists today and shapes this change:

- **Schema 6.** `question` (type, both names and texts, `position`, `retired`, `created_at`, `updated_at`), `answer` (`position`, both texts, `correct`; `ON DELETE CASCADE` from the question), `image` (per question, `UNIQUE (question_id, sha256)`, `ON DELETE CASCADE` from the question, a `CHECK` on the four raster types) and `question_category` (tree by `parent_id`, `position`, unique German name per parent).
- **Snapshots** (`exam-online-tests` D2): `test_question` and `test_answer` copy texts and flags and reference `answer` by nothing. `test_question.question_id` and `question_usage.question_id` reference `question` without cascade, so the database already refuses to delete a question that a test contains. `test_image` references `image` with `ON DELETE RESTRICT`. `snapshot()` in `exam/tests.js` links every image of a question by `question_id`. `updateTest` replaces a test's snapshot only while no attempt has started.
- **HTML cleaning** exists once, in the importer: `storedHtml` in `exam/pool-import.js` runs the renderer's `sanitizeHtml` without `style`/`dir`/`class`/`role` and replaces every image source through a callback, refusing anything that is not the module's own.
- **Body parsing:** `app.js` runs `express.json()` with its default 100 kB limit for every route before the module's router. A save carrying images inline would hit that limit.
- **Production** runs with `EXAM_MODULE=on`, 94 real questions and real tests. Every step must leave the pool as it was until a teacher saves something.

## Goals / Non-Goals

**Goals:**

- A teacher fixes a question in under a minute, without touching markup.
- No path from the editor changes a snapshot, unless the teacher explicitly asks an unwritten test to take up an edit.
- No new runtime dependency and no build step.

**Non-Goals:**

- Revision history of a question. The snapshots already keep every version a test used, and the backups keep the rest.
- Importing further Moodle files, and any export. The database stays the only source of truth (`AI/exam-module-plan.md`, section 2).
- Per-teacher ownership of questions. The pool is one pool for all teachers (D6).
- Swapping questions for a make-up sitting. That stays open in `exam-module`.

## Decisions

### D1 — P7 moves out of `exam-module` whole

`exam-module`'s tasks section 7 and its spec `question-editor` move here. In `exam-module` the section becomes a pointer, the spec directory is removed, the proposal lists `question-editor` as moved, and the open question on deleting used questions points to D6. This repeats `exam-online-tests` D1: one change defines the capability, and `exam-module` keeps the backlog entry and P5.

### D2 — One HTML cleaning for import and editor

`storedHtml` moves out of `exam/pool-import.js` into `exam/stored-html.js` as `cleanStoredHtml(html, resolveImage, where)`. The importer passes its Moodle resolver (`@@PLUGINFILE@@`, inline `data:`). The editor passes one that accepts only two sources:

- `/exam/api/images/<id>` of an image belonging to the question being saved, kept as it is;
- `/exam/api/pool/uploads/<token>` of a staged upload (D4), turned into an image of the question and rewritten to its `/exam/api/images/<id>`.

Any other source is refused, a `data:` URI included, because the editor's client always uploads first. The importer's tests keep passing unchanged, and they are the check that the move kept its behaviour.

*Alternative:* a second, stricter allowlist for the editor. It would make the two paths store different markup for the same question, and the client renders both the same way.

### D3 — A rich-text field over `contenteditable`, no library

`<sl-rich-text>` is a custom element around a `contenteditable` region with a small toolbar: bold, italic, inline code, code block, bulleted list, numbered list, image. Bold, italic and the lists use `document.execCommand`. It is deprecated but works in every browser the school uses, and nothing standard replaces it yet. Inline code and code blocks wrap the selection's `Range` in `<code>` or `<pre><code>` themselves. The element's value is its `innerHTML`.

On paste, the element takes the `text/html` flavour and keeps only `p br b strong i em code pre ul ol li` without attributes before inserting. Without HTML it inserts plain text. A pasted or dropped image file goes through the upload (D4). The server sanitizes again (D2), so this filter only keeps the editor tidy and does not protect anything. The German and English fields of a text sit side by side in one row, so the pairing is visible.

*Alternatives:* a raw HTML textarea with preview, or Markdown. Gerald chose this one on 2026-10-17. A textarea makes teachers write markup. Markdown cannot round-trip the 94 imported HTML texts.

### D4 — Uploads are staged until a save, in their own table

Migration `007-question-editor.sql` adds `image_upload (token TEXT PRIMARY KEY, uploaded_by, uploaded_at, mime, sha256, data)`. `POST /exam/api/pool/uploads` takes the image as the raw body (`application/octet-stream`) through `express.raw({ limit: "2mb" })` on that route only. The global `express.json()` ignores that type, so its limit stays as it is. The server decides the type from the first bytes (PNG, JPEG, GIF, WebP signatures), never from the name or header, and answers `{ src: "/exam/api/pool/uploads/<token>" }` with a random 128-bit token. `GET` on that path serves the staged image to teachers only, so the editor can show it before saving.

A save turns each referenced upload into an `image` row of the question inside the save's transaction. An identical image the question already has is reused through `UNIQUE (question_id, sha256)`. The save then deletes the upload row. Uploads older than 24 hours are purged at start and on the daily backup timer.

*Why not attach directly to the question:* a new question has no id yet, and `snapshot()` links every image of a question by `question_id`. An abandoned edit would otherwise put stray images into the next test.
*Why not inline `data:` URIs in the save:* the global 100 kB JSON limit, and raising it for the whole app to serve one route.

### D5 — A save replaces the question's answers, then tidies its images

`saveQuestion` validates everything first (the spec's list, every problem collected, answered as 422 with `problems: [{ field, answer, message }]`). Only then does one transaction run:

1. `UPDATE question … SET version = version + 1 WHERE id = ? AND version = ?`. No row changed means the question was changed in between, answered as 409 (D7).
2. Delete the question's `answer` rows and insert the edited ones with fresh positions. Nothing references `answer.id`, because snapshots copy their texts, so replacing is safe.
3. Resolve images (D2/D4).
4. Delete the question's images that no text of the question references any more and that no `test_image` row holds. An image a snapshot shows stays, unreferenced by the pool but still served to that test.

`truefalse` answers are not edited as text: the editor shows which one is correct, and the server writes the fixed words of `trueFalseText`, which moves to `stored-html.js` with D2. Changing a question's type is allowed. Changing it to `truefalse` replaces its answers with the two fixed ones.

### D6 — Any teacher retires, revives and deletes; deletion only for unused questions

This settles `exam-module`'s open question: the pool is shared, every teacher is equal in it, and nobody owns a question. `retire` and `revive` flip `retired` and bump `version`. `delete` is allowed only while no `question_usage` and no `test_question` row names the question. The foreign keys enforce the same, and the check exists only to answer with a sentence instead of a constraint error. Answers and images go with it by cascade. A question whose only test was deleted before it was written is unused again, because `deleteTest` drops the usage.

### D7 — An integer version for concurrent edits

The migration adds `question.version INTEGER NOT NULL DEFAULT 1` (`ALTER TABLE … ADD COLUMN`, no table rebuild). `getQuestion` returns it, and the editor sends it back. An integer was chosen over comparing `updated_at`, because ISO timestamps from two saves in the same millisecond compare equal. On 409 the client keeps the form as it is and offers to open the current version in a new tab.

### D8 — Unwritten tests take up an edit only when asked

The save's answer lists the tests that hold the question in a snapshot and have no attempt yet (`test_question.question_id`, `testStarted`). Beside each, the editor shows "Update this test". It calls the existing `PUT /exam/api/tests/:id` with the test's current question ids in their order, and `updateTest` re-snapshots them. A test written in the meantime is refused there already. A retired question cannot be taken up, because `chosenQuestions` refuses it, and the editor says so.

*Alternative:* refresh unwritten tests automatically. That would change a test the teacher may already have looked at, or printed as a board solution, without telling them.

### D9 — Pages and the browser's entry points

- `GET /exam/pool/questions/new?category=<id>` and `GET /exam/pool/questions/<id>` render the editor through `teacherShell` with `kind: "question-editor"` and the bar context passed along as the pool page does. `current: "pool"` keeps the bar's pool button marked.
- `GET /exam/pool/categories` renders the category page: the tree with create, rename, move up/down, move under, and delete per node.
- The pool element (`exam/client/pool.js`) gets "Edit" in the preview, "New question" when a category is chosen, and a link to the category page. After saving or leaving the editor, the browser is reopened with `?category=` set.
- The API, all behind `requireTeacher`: `POST /pool/questions`, `PUT /pool/questions/:id`, `POST /pool/questions/:id/retire`, `…/revive`, `DELETE /pool/questions/:id`, `POST /pool/uploads`, `GET /pool/uploads/:token`, `POST /pool/categories`, `PUT /pool/categories/:id` (names, parent, position), `DELETE /pool/categories/:id`.

### D10 — Categories: positions and cycles

A new category or a moved one goes to the end of its new siblings. Up/down swaps `position` with the neighbour. A move under a parent is refused if the parent is the category itself or lies below it, using the same descent `categoryAndBelow` in `exam/pool.js` already does. The unique index on `(parent, name_de)` refuses duplicates, which the API answers as 409 with the name. A moved question goes to the end of its new category.

### D11 — Order of work

The migration and the shared cleaning come first, deployed alone: they change nothing a teacher sees. Then saving existing questions (the most urgent use: fixing what the import brought), then new questions, uploads, retire/revive/delete, categories, and the refresh offer. Each step is deployable with the switch on.

## Risks / Trade-offs

- [`execCommand` disappears from a browser] → It is confined to three toolbar buttons in one element. Replacing them with `Range` code like the code buttons is a local change. The stored format does not depend on it.
- [A teacher edits a question that a running sitting shows] → The sitting shows its snapshot, so nothing changes for the students. The refresh offer lists only tests without attempts.
- [Orphaned images kept for snapshots grow the database] → Only images a test shows are kept, which is the point. The staged uploads are purged daily. A question's images are a few hundred kB.
- [Pasted markup from Word or the web brings odd structure] → Filtered on paste (D3), sanitized on save (D2). The worst case is a plain paragraph.
- [A teacher deletes a fresh question that a colleague is just assembling into a test] → Assembly checks the question exists in its transaction (`chosenQuestions`), so the colleague gets "There is no question … in the pool" and nothing half-written.
- [Production data] → Every change is a teacher's explicit save. Migration 007 only adds a table and a column, and the deploy writes the pre-migration copy as always.

## Migration Plan

1. Deploy migration 007 and the shared cleaning. The pool reads as before.
2. Deploy the editor for existing questions, then new questions and uploads, then retire/revive/delete and categories, then the refresh offer.
3. Rollback: 007 only adds, but older code disables the module on a newer schema (`exam-foundation`). A rollback restores the pre-migration copy and loses the edits made since. Roll forward instead once teachers have edited.
