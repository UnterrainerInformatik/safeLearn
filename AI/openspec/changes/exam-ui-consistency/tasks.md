## 0. Preconditions

- [ ] 0.1 Confirm `exam-online-tests` is archived (its `exam-navigation` and `online-test` deltas are in the main specs). If not, stop and raise it with Gerald.
- [ ] 0.2 Re-check the file:line references in design.md, Context, against HEAD and fix them in design.md where the code has moved.

## 1. Phase 1: Button and confirmation components

- [ ] 1.1 Add `button()`, `linkButton()` and `confirmButton()` to `exam/client/frame.js` (design D1). `confirmButton` takes over `armedButton` from `client/tests.js` and adds disarming on blur, Escape and after 5 s, plus `aria-live` on the label. Re-export `armedButton` as an alias until 2.x has replaced every call.
- [ ] 1.2 Add `.sl-exam-action`, `.sl-exam-action-primary` and `.sl-exam-action-danger` to `css/exam.css` in light and dark mode, modelled on `.sl-button`/`.sl-button-accent`. Restyle `.sl-exam-primary` as an alias of the primary action, and drop the `sl-exam-link` look.
- [ ] 1.3 Replace every `window.confirm` with `confirmButton`: roster removal (`client/classes.js`), gradebook column (`client/gradebook.js`) and question delete (`client/question-editor.js`). The category delete goes with phase 3. Add the armed labels to `i18n/en.json` and `i18n/de.json`.
- [ ] 1.4 Confirm by two clicks where nothing confirms today: deleting a scheduled sitting first, then removing a question from an unwritten test (`client/tests.js`). Replace the import's in-page Take back confirmation with `confirmButton` (`client/pool-import.js`). Leave Release untouched; it belongs to `exam-live-bound-browser`.
- [ ] 1.5 Harness checks in `test/exam.test.js`:
  - one click on a sitting's Delete deletes nothing and changes the label, and a second click deletes;
  - clicking elsewhere disarms;
  - no `dialog` event fires while deleting a gradebook column and a roster entry.
- [ ] 1.6 Run `npm test`, record the result here, and commit phase 1.

## 2. Phase 2: Links become buttons, actions move into their structure

- [ ] 2.1 Turn the action links listed in design.md, Context, into `button`/`linkButton`, with the right primary marking:
  - Create test, Import n questions, Mark as reviewed and Make current are primary;
  - the pool's question name becomes plain text in its row.
- [ ] 2.2 Test page (`client/tests.js`):
  - Delete this test moves into the head beside Rename;
  - each sitting gets its own message line, and refusals of a sitting action are shown there;
  - Try as student, Solution on the board and Add questions from the pool become buttons in the head.
- [ ] 2.3 Online-tests list: add a **New test** button per course, leading to `/exam/pool?course=<id>`. Turn "live view · class screen" into two buttons.
- [ ] 2.4 Class page (`client/classes.js`): the course list carries a `+ Course` button that opens the existing course creation. Course config sheet: Open the gradebook becomes a button in the head.
- [ ] 2.5 Bar (`exam/bar.js`): add a Grading scale page button beside the pool and the tests, marked on `/exam/scale`. Remove `moduleLinks()` from the home (`client/classes.js:114`).
- [ ] 2.6 Pool (`client/pool.js`):
  - New question is always visible; without a chosen category the editor opens with an empty category select, and saving requires one;
  - Edit categories and Import questions become buttons above the tree.
- [ ] 2.7 Pool rows: a checkbox column while a course is chosen, kept in sync with the row toggle (design D6).
- [ ] 2.8 Import (`client/pool-import.js`): Import n questions moves above the preview tables. Download the format description becomes a button.
- [ ] 2.9 Gradebook: the comment mark becomes a toggle that shows the comment under the row (design D11). Config sheet and Grading scale above the sheet become buttons.
- [ ] 2.10 Harness checks in `test/exam.test.js`:
  - no `a` element inside `.sl-exam` carries one of the action texts of design.md, Context, in English or German;
  - Delete this test precedes the questions list in document order;
  - a refused sitting change shows its message inside that sitting's `li`;
  - the bar's Grading scale button opens the scale with `aria-current`;
  - pool checkboxes follow row clicks;
  - Import precedes the preview table;
  - a comment's text is visible after tapping its mark.
- [ ] 2.11 Run `npm test`, record the result here, and commit phase 2.

## 3. Phase 3: The category tree in the pool

- [ ] 3.1 Server (`exam/pool-edit.js`, `exam/routes-pool-edit.js`):
  - `PUT /pool/categories/:id` accepts `{ parentId, before }` and renumbers the siblings in one transaction (design D4);
  - `POST /pool/questions/:id/category { categoryId }` bumps `version`.
  - Unit tests in `test/exam-question-editor.test.js`: placement before a sibling, at the end, into another parent, refused into own subtree, duplicate name, a question move bumping the version and a stale editor save refused afterwards.
- [ ] 3.2 Add `exam/client/tree-drag.js`, a pointer-event drag controller (design D3). It handles mouse and touch (300 ms press), "into"/"before"/"after" zones with a highlight and a line, and auto-scrolling.
- [ ] 3.3 In the pool's tree (`client/pool.js`):
  - make categories and question rows drag sources, and categories drop targets;
  - on a refusal, redraw the unchanged tree and show the reason at the dragged node.
- [ ] 3.4 Name popup (design D7) for `+` (subcategory, and at the tree's end for a top-level category) and for renaming via double click and the pencil icon. It has Cancel, Enter and Escape, and shows refusals inside the popup.
- [ ] 3.5 Delete icon only on empty categories, as `confirmButton`.
- [ ] 3.6 Keyboard (design D5):
  - ARIA tree with roving tabindex;
  - Ctrl+X and Ctrl+V for categories and question rows;
  - Alt+↑/↓ among siblings;
  - F2 to rename and Insert/`+` for a new subcategory;
  - a key legend under the tree.
- [ ] 3.7 Remove `client/pool-categories.js` and its element. `/exam/pool/categories` redirects with 301 to `/exam/pool`, keeping `?course=`. Point `client/question-editor.js:68` at the pool.
- [ ] 3.8 Harness checks in `test/exam.test.js`:
  - drag a category onto another and between two (mouse, and touch via `page.touchscreen`);
  - drag a question onto a category;
  - a refused drop leaves the order unchanged and shows the reason at the node;
  - cut and paste by keyboard;
  - Alt+↑;
  - create, rename and cancel in the popup;
  - delete offered only on empty categories;
  - the old address lands on `/exam/pool`.
- [ ] 3.9 Run `npm test`, record the result here, and commit phase 3.

## 4. Phase 4: Missing actions

- [ ] 4.1 Server (`exam/classes.js`, `exam/routes-classes.js`), as in design D8:
  - rename and delete for years, classes and courses (`PUT`/`DELETE`, and `subject` on `PUT /courses/:id`);
  - refusals as i18n keys with counts.
  - Unit tests in `test/exam-classes.test.js`: duplicate names refused, the current year and a year with classes refused, a class with courses refused, a course with columns, entries, grades or tests refused, and deleting a class removes its roster.
- [ ] 4.2 Client: Rename (inline field with Save/Cancel) and Delete (`confirmButton`) in the heads of the year on `/exam/`, the class page and the course config sheet. The bar redraws after a rename or delete.
- [ ] 4.3 Server (`exam/tests.js`, `exam/routes-tests.js`), as in design D9:
  - `POST /sittings/:id/end` and `POST /sittings/:id/extend { minutes }` (5–120), only while open, announced like other sitting changes.
  - Unit tests in `test/exam-tests.test.js`: end submits running attempts at once; extend moves deadlines capped by the window but not those capped by the duration; both refused before opening and after closing.
- [ ] 4.4 Live view (`client/live.js`): End now (`confirmButton`) and Extend (minutes field + button) in the head.
- [ ] 4.5 Student page (design D10): `previous`/`next` from `GET /courses/:id/students/:username` (`exam/gradebook.js`), and a head with ←, Back to the gradebook and →, keeping the semester. Unit test in `test/exam-gradebook.test.js` for the order and the ends.
- [ ] 4.6 Empty states carry their next action:
  - "There is no school year yet." gets a Create school year button on `/exam/` and on `/exam/tests`;
  - "Nobody is on this course's roster." gets a button to the class's roster.
- [ ] 4.7 Harness checks in `test/exam.test.js`:
  - rename and delete a course created for the check;
  - delete refused for a course with a result, with the reason at the button;
  - end a running sitting with a student writing, so the student is shown as submitted;
  - extend a sitting, so the attempt page shows the longer remaining time;
  - next and previous on the student page, and back to the sheet;
  - the empty-roster button leads to the class page.
- [ ] 4.8 Run `npm test`, record the result here, and commit phase 4.

## 5. Phase 5: Consistency

- [ ] 5.1 Grading scale (`client/gradebook.js`, around `:677`): save as it changes while the scale is valid, with saving/saved/refused marking as on the sheet, and the explicit Save removed. Add "Every field is saved as it changes." to the student page.
- [ ] 5.2 Apply the wording table of design D12 in `i18n/en.json` and `i18n/de.json`, keeping the keys identical. Use the catalog's language names in the test head (`client/tests.js:206`). Run `test/i18n-catalog.test.js`.
- [ ] 5.3 Harness checks in `test/exam.test.js`:
  - the bar and the gradebook heading show the same name for the whole year in en and de;
  - an English test head of a German course says "German";
  - the scale saves without a button.
- [ ] 5.4 Run `npm test`, record the result here, and commit phase 5.

## 6. Wrap-up

- [ ] 6.1 Update `docs-exam-module.md` (category tree, keys, rename/delete, end/extend) and `AI/architecture.md` (component map: `tree-drag.js`, removed `pool-categories.js`, new routes; observations).
- [ ] 6.2 Deploy to secureLectures (sync order: safeLearn first) and smoke-check with Gerald's teacher account: one drag in the tree, one rename, and one sitting extended in a trial test.
