## 0. Preconditions

- [x] 0.1 (Checked 2026-10-18: archived as `2026-10-18-exam-online-tests`, and `exam-navigation`/`online-test` are in the main specs.) Confirm `exam-online-tests` is archived (its `exam-navigation` and `online-test` deltas are in the main specs). If not, stop and raise it with Gerald.
- [x] 0.2 (Checked against `5ea0e50`: `live.js` 113→142 and 217→246, `tests.js` 206→205; the rest still matches.) Re-check the file:line references in design.md, Context, against HEAD and fix them in design.md where the code has moved.

## 1. Phase 1: Button and confirmation components

- [x] 1.1 Add `button()`, `linkButton()` and `confirmButton()` to `exam/client/frame.js` (design D1). `confirmButton` takes over `armedButton` from `client/tests.js` and adds disarming on blur, Escape and after 5 s, plus `aria-live` on the label. Re-export `armedButton` as an alias until 2.x has replaced every call. (Applied: every call was replaced at once, so no alias was needed.)
- [x] 1.2 Add `.sl-exam-action`, `.sl-exam-action-primary` and `.sl-exam-action-danger` to `css/exam.css` in light and dark mode, modelled on `.sl-button`/`.sl-button-accent`. Restyle `.sl-exam-primary` as an alias of the primary action, and drop the `sl-exam-link` look.
- [x] 1.3 Replace every `window.confirm` with `confirmButton`: roster removal (`client/classes.js`), gradebook column (`client/gradebook.js`) and question delete (`client/question-editor.js`). The category delete goes with phase 3. Add the armed labels to `i18n/en.json` and `i18n/de.json`.
- [x] 1.4 Confirm by two clicks where nothing confirms today: deleting a scheduled sitting first, then removing a question from an unwritten test (`client/tests.js`). Replace the import's in-page Take back confirmation with `confirmButton` (`client/pool-import.js`). Leave Release untouched; it belongs to `exam-live-bound-browser`.
- [x] 1.5 Harness checks in `test/exam.test.js`:
  - one click on a sitting's Delete deletes nothing and changes the label, and a second click deletes;
  - clicking elsewhere disarms;
  - no `dialog` event fires while deleting a gradebook column and a roster entry.
- [x] 1.6 Run `npm test`, record the result here, and commit phase 1. Result 2026-10-18: `test/exam.test.js` 100/100; `npm test` 685/686, the failure the reload-backoff check of `deployment-surface`, which fails the same way on unchanged HEAD (`5ea0e50`, stashed working tree), so it is not caused by this phase.

## 2. Phase 2: Links become buttons, actions move into their structure

- [x] 2.1 Turn the action links listed in design.md, Context, into `button`/`linkButton`, with the right primary marking:
  - Create test, Import n questions, Mark as reviewed and Make current are primary;
  - the pool's question name becomes plain text in its row.
- [x] 2.2 Test page (`client/tests.js`):
  - Delete this test moves into the head beside Rename;
  - each sitting gets its own message line, and refusals of a sitting action are shown there;
  - Try as student, Solution on the board and Add questions from the pool become buttons in the head.
- [x] 2.3 Online-tests list: add a **New test** button per course, leading to `/exam/pool?course=<id>`. Turn "live view · class screen" into two buttons.
- [x] 2.4 Class page (`client/classes.js`): the course list carries a `+ Course` button that opens the existing course creation. Course config sheet: Open the gradebook becomes a button in the head.
- [x] 2.5 Bar (`exam/bar.js`): add a Grading scale page button beside the pool and the tests, marked on `/exam/scale`. Remove `moduleLinks()` from the home (`client/classes.js:114`).
- [x] 2.6 Pool (`client/pool.js`):
  - New question is always visible; without a chosen category the editor opens with an empty category select, and saving requires one;
  - Edit categories and Import questions become buttons above the tree.
- [x] 2.7 Pool rows: a checkbox column while a course is chosen, kept in sync with the row toggle (design D6).
- [x] 2.8 Import (`client/pool-import.js`): Import n questions moves above the preview tables. Download the format description becomes a button.
- [x] 2.9 Gradebook: the comment mark becomes a toggle that shows the comment under the row (design D11). Config sheet and Grading scale above the sheet become buttons.
- [x] 2.10 Harness checks in `test/exam.test.js`:
  - no `a` element inside `.sl-exam` carries one of the action texts of design.md, Context, in English or German (applied as `a:not(.sl-exam-action)`: a `linkButton` is an `a` by design D1);
  - Delete this test precedes the questions list in document order;
  - a refused sitting change shows its message inside that sitting's `li`;
  - the bar's Grading scale button opens the scale with `aria-current`;
  - pool checkboxes follow row clicks;
  - Import precedes the preview table;
  - a comment's text is visible after tapping its mark.
- [x] 2.11 Run `npm test`, record the result here, and commit phase 2. Result 2026-10-18: `npm test` 692/693, `test/exam.test.js` all green; the failure was `legibility`'s 390px check on a content page (497px), which passed on a rerun of `test/content.test.js` (166/167, the remaining failure the reload-backoff check that fails on unchanged HEAD too).

## 3. Phase 3: The category tree in the pool

- [x] 3.1 Server (`exam/pool-edit.js`, `exam/routes-pool-edit.js`):
  - `PUT /pool/categories/:id` accepts `{ parentId, before }` and renumbers the siblings in one transaction (design D4);
  - `POST /pool/questions/:id/category { categoryId }` bumps `version`.
  - Unit tests in `test/exam-question-editor.test.js`: placement before a sibling, at the end, into another parent, refused into own subtree, duplicate name, a question move bumping the version and a stale editor save refused afterwards.
- [x] 3.2 Add `exam/client/tree-drag.js`, a pointer-event drag controller (design D3). It handles mouse and touch (300 ms press), "into"/"before"/"after" zones with a highlight and a line, and auto-scrolling.
- [x] 3.3 In the pool's tree (`client/pool.js`):
  - make categories and question rows drag sources, and categories drop targets;
  - on a refusal, redraw the unchanged tree and show the reason at the dragged node.
- [x] 3.4 Name popup (design D7) for `+` (subcategory, and at the tree's end for a top-level category) and for renaming via double click and the pencil icon. It has Cancel, Enter and Escape, and shows refusals inside the popup.
- [x] 3.5 Delete icon only on empty categories, as `confirmButton`.
- [x] 3.6 Keyboard (design D5):
  - ARIA tree with roving tabindex;
  - Ctrl+X and Ctrl+V for categories and question rows;
  - Alt+↑/↓ among siblings;
  - F2 to rename and Insert/`+` for a new subcategory;
  - a key legend under the tree.
- [x] 3.7 Remove `client/pool-categories.js` and its element. `/exam/pool/categories` redirects with 301 to `/exam/pool`, keeping `?course=`. Point `client/question-editor.js:68` at the pool.
- [x] 3.8 Harness checks in `test/exam.test.js`:
  - drag a category onto another and between two (mouse, and touch via `page.touchscreen`);
  - drag a question onto a category;
  - a refused drop leaves the order unchanged and shows the reason at the node;
  - cut and paste by keyboard;
  - Alt+↑;
  - create, rename and cancel in the popup;
  - delete offered only on empty categories;
  - the old address lands on `/exam/pool`.
- [x] 3.9 Run `npm test`, record the result here, and commit phase 3. Result 2026-10-18: `npm test` 701/703, `test/exam.test.js` 114/114; the two failures were the known timing checks (`legibility` 497px on a content page, `deployment-surface` reload backoff with the same gap pattern as on unchanged HEAD).

## 4. Phase 4: Missing actions

- [x] 4.1 Server (`exam/classes.js`, `exam/routes-classes.js`), as in design D8:
  - rename and delete for years, classes and courses (`PUT`/`DELETE`, and `subject` on `PUT /courses/:id`);
  - refusals as i18n keys with counts.
  - Unit tests in `test/exam-classes.test.js`: duplicate names refused, the current year and a year with classes refused, a class with courses refused, a course with columns, entries, grades or tests refused, and deleting a class removes its roster.
- [x] 4.2 Client: Rename (inline field with Save/Cancel) and Delete (`confirmButton`) in the heads of the year on `/exam/`, the class page and the course config sheet. The bar redraws after a rename or delete.
- [x] 4.3 Server (`exam/tests.js`, `exam/routes-tests.js`), as in design D9:
  - `POST /sittings/:id/end` and `POST /sittings/:id/extend { minutes }` (5–120), only while open, announced like other sitting changes.
  - Unit tests in `test/exam-tests.test.js`: end submits running attempts at once; extend moves deadlines capped by the window but not those capped by the duration; both refused before opening and after closing.
- [x] 4.4 Live view (`client/live.js`): End now (`confirmButton`) and Extend (minutes field + button) in the head.
- [x] 4.5 Student page (design D10): `previous`/`next` from `GET /courses/:id/students/:username` (`exam/gradebook.js`), and a head with ←, Back to the gradebook and →, keeping the semester. Unit test in `test/exam-gradebook.test.js` for the order and the ends.
- [x] 4.6 Empty states carry their next action:
  - "There is no school year yet." gets a Create school year button on `/exam/` and on `/exam/tests`; (it opens the bar's dialog; the harness cannot see it, since its instance always has a year);
  - "Nobody is on this course's roster." gets a button to the class's roster.
- [x] 4.7 Harness checks in `test/exam.test.js`:
  - rename and delete a course created for the check;
  - delete refused for a course with a result, with the reason at the button;
  - end a running sitting with a student writing, so the student is shown as submitted;
  - extend a sitting, so the attempt page shows the longer remaining time;
  - next and previous on the student page, and back to the sheet;
  - the empty-roster button leads to the class page.
- [x] 4.8 Run `npm test`, record the result here, and commit phase 4. Result 2026-10-18: `npm test` 715/717, `test/exam.test.js` all green; the two failures were the known timing checks (`legibility` 497px on a content page, `deployment-surface` reload backoff).

## 5. Phase 5: Consistency

- [x] 5.1 Grading scale (`client/gradebook.js`, around `:677`): save as it changes while the scale is valid, with saving/saved/refused marking as on the sheet, and the explicit Save removed. Add "Every field is saved as it changes." to the student page.
- [x] 5.2 Apply the wording table of design D12 in `i18n/en.json` and `i18n/de.json`, keeping the keys identical. Use the catalog's language names in the test head (`client/tests.js:205`). Run `test/i18n-catalog.test.js`.
- [x] 5.3 Harness checks in `test/exam.test.js`:
  - the bar and the gradebook heading show the same name for the whole year in en and de;
  - an English test head of a German course says "German";
  - the scale saves without a button.
- [x] 5.4 Run `npm test`, record the result here, and commit phase 5. Result 2026-10-18: `npm test` 723/723, `test/exam.test.js` 126/126; this time neither timing check failed.

## 6. Wrap-up

- [x] 6.1 Update `docs-exam-module.md` (category tree, keys, rename/delete, end/extend) and `AI/architecture.md` (component map: `tree-drag.js`, removed `pool-categories.js`, new routes; observations).
- [ ] 6.2 Deploy to secureLectures (sync order: safeLearn first) and smoke-check with Gerald's teacher account: one drag in the tree, one rename, and one sitting extended in a trial test.

## Notes for applying

- Design D9 assumes deadlines are derived. They are not: `startAttempt` stores `attempt.deadline` = min(start + duration, window end). End must therefore also set every running attempt's deadline to now before `finalizeDue`. Extend must set each running attempt's deadline to min(started_at + sitting.duration_s, new closes_at).
- `armedButton` is also used by the live view's admin delete (`exam/client/live.js`). The live view redraws a row on every change event, which disarms a button armed in it.
- `categoryTree` (`exam/pool.js`) counts only non-retired questions. The delete icon (3.5) needs a count that includes retired ones.
- The scale page (`exam/routes-gradebook.js`, `page("/scale", …)`) passes no `current`; 2.5 needs `current: "scale"` through `teacherShell`.
- Phase 3 (applied 2026-10-18): the tree lives in `exam/client/pool-tree.js` beside `pool.js`, which only mounts it; `categoryTree` answers `empty` (nothing held, retired questions included) for the bin. Each node carries 📝 (new question in it) beside `+`, as decided in design.md. A refused question move is told in the tree's status line; the spec asks for the node only for categories.
- Phase 4 (applied 2026-10-18): the student page takes `?semester=` and keeps it on the way to the neighbours and back; the sheet's student links carry it. A window change (end, extend) is announced on the live channel without a participant, and the live view then fetches a fresh snapshot, since every deadline may have moved. A course's refusal counts columns, results, grades and online tests (tests include question usage left behind by a deleted test).
- Phase 5 (applied 2026-10-18): the scale is saved as one value for its four fields, as the config sheet's weights are; the reason it is not saved stands in a status line under it, checked in the browser as the server checks. `exam.pool.type.multichoiceset` also became "Several correct answers", as in the editor, since the spec asks for one name per question type; `exam.common.save` went, as nothing uses it any more.
- Smoke check 2026-10-18 (Gerald): drag, rename and extend work. Two findings, fixed: buttons differed in size - older `font: inherit` rules for plain controls in the assembly, the test page and the editor also reset a module button's line height (41 px instead of 32), and `+ Course` in a heading took the heading's size; the size now comes from `.sl-exam` through a registered `--sl-exam-text`. And a drag held at the tree's lower edge did not scroll: `tree-drag.js` now scrolls the tree while it can, also with the pointer below it, and otherwise the page at the window's edges. Both have harness checks.
