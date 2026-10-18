## Context

See proposal.md for the motivation. The module's client is a set of custom elements under `exam/client/` built with `h()` from `frame.js`. Their texts come from `i18n/en.json` and `i18n/de.json` (BabelEdit, same keys in both). The state found on 2026-10-18 (line numbers re-checked against `5ea0e50`):

- **Links that are actions:**
  - `client/pool.js:133` (Edit categories), `:134` (Import questions), `:138` (New question, an `<a>` without `href`, hidden until a category is chosen) and `:459` (Edit);
  - `client/tests.js:65`/`:67` (live view, class screen), `:94` (assemble in pool), `:211` (try as student), `:217` (board solution) and `:232` (add from pool);
  - `client/live.js:142` (class screen);
  - `client/classes.js:115` (the home's quiet module links) and `:541` (Open the gradebook);
  - `client/gradebook.js:203`/`:205` (Config sheet, Grading scale) and `:602` (Enter results);
  - `client/pool-import.js:95` and `:100`;
  - `client/question-editor.js:68`, `:126` and `:357`;
  - `client/pool-categories.js:40`.
- **Plain buttons styled as links:** the question name in the pool list, `client/pool.js:379` (`sl-exam-link`).
- **Styling:** `sl-exam-primary` is only `font-weight: bold` (`css/exam.css:94`). Classes like `sl-exam-pool-new`, `sl-exam-test-remove`, `sl-exam-live-release`, `sl-exam-import-go` and `sl-exam-sitting-delete` have no CSS. `sl-button` from `css/buttons.css` is not used by the module.
- **Confirmations:**
  - `window.confirm` at `client/classes.js:337` (roster), `client/gradebook.js:334` (column), `client/pool-categories.js:113` (category) and `client/question-editor.js:375` (question);
  - `armedButton` in `client/tests.js:158` for deleting a test, removing a question from a written test (admin) and deleting an attempt in the live view;
  - an in-page confirmation for Take back in `client/pool-import.js:307`;
  - none for deleting a scheduled sitting (`client/tests.js:304`), for removing a question from an unwritten test (`client/tests.js:257`) or for Unbind browser (`client/live.js:246`).
- **Category maintenance:** a page of its own, `client/pool-categories.js` behind `/exam/pool/categories` (`exam/routes-pool-edit.js:127`). The API is `PUT /api/exam/pool/categories/:id` with names, `parentId` (appends at the end of the new parent) or `move: "up"|"down"` (`exam/pool-edit.js:501` ff.). A question changes category only through the full save `PUT /pool/questions/:id` with its `version`.
- **Records:** the API has no rename or delete for years, classes and courses (`exam/routes-classes.js:91-144`). Sittings can be changed and deleted only before they open (`requireNotOpened`, `exam/tests.js:464`).
- **Bar:** the bar has page buttons for the pool and tests (`exam/bar.js:141-142`), but none for the scale.

This change depends on `exam-online-tests` being archived first: its delta adds the bar's page-button requirement to `exam-navigation` and the `online-test` capability that the sitting rules live in.

## Goals / Non-Goals

**Goals:**
- One button component and one confirmation component in `frame.js` that every client element uses, so the conventions are enforced by construction, not by review.
- A category tree on `/exam/pool` that does everything the category page did, with drag-and-drop on mouse and touch and a complete keyboard path.
- Small server additions only where an action is missing: no schema migration.

**Non-Goals:**
- `/exam/my` during an attempt (`exam-my-hide-results-while-writing`) and the live view's browser binding column and **Unbind browser** (`exam-live-bound-browser`).
- Extra time for a single student (a per-attempt allowance). Extending acts on the sitting's window only.
- The year change (P5 of `exam-module`). Closed years will refuse rename and delete once P5 exists; this change does not anticipate it.
- Changing the student's writing page beyond texts.

## Decisions

### D1. `button()` and `confirmButton()` in `frame.js`

`frame.js` gets `button({ label, kind, action })`, with `kind` one of `primary`, `default` or `danger`, and `linkButton({ label, href, kind, newWindow })` for navigation that is an action, such as Back to the pool or Class screen. `button()` renders a `<button>`. `linkButton()` renders an `<a>` drawn exactly like a button, so middle-click, "open in new tab" and `target="_blank"` keep working. `armedButton` moves from `tests.js` to `frame.js` as `confirmButton`:

- it keeps its behaviour, two clicks with the armed label;
- it disarms on `blur`, on Escape and after 5 s;
- it carries `aria-live` so the armed label is announced.

The styles live in `css/exam.css` as `.sl-exam-action`, `.sl-exam-action-primary` and `.sl-exam-action-danger`, modelled on `.sl-button`/`.sl-button-accent` from `css/buttons.css` (same radius, border, padding) and scoped under `.sl-exam`, with dark-mode rules. The name `sl-exam-button` is taken by the top bar's module button (`obsidian.js:3025`, `css/exam.css:155`) and stays untouched.

*Alternative:* reuse `sl-button` directly. Rejected, because `buttons.css` has no primary/danger variant and no dark-mode rules for the module's content area. Copying its metrics keeps one look.

### D2. Links stay links only for named things

The rule from the spec is applied file by file. Navigation actions become `linkButton`. A test's, class's or student's name in a table stays a link. The pool's question name (`pool.js:379`) becomes plain text in the clickable row, and the row gets a checkbox (D6).

### D3. The category tree: pointer events, not HTML5 drag-and-drop

HTML5 `draggable` does not work on touch screens, and teachers use tablets. The tree uses Pointer Events with a small drag controller in a new `client/tree-drag.js`:

- on `pointerdown` plus 6 px of movement (or a 300 ms press on touch), a ghost follows the pointer;
- `elementFromPoint` finds the target row: its middle half means "into", its top or bottom quarter means "before" or "after", drawn as a line;
- on drop, it sends the move.

Question rows of the list are drag sources too, valid only onto categories. Scrolling near the tree's edges auto-scrolls.

*Alternative:* a library (SortableJS). Rejected: the module loads no third-party client code so far, and the needed subset is small.

### D4. Placement by position on the server

`PUT /pool/categories/:id` accepts `{ parentId, before }`: `before` is the id of the sibling to stand before, or `null` for the end. It renumbers the siblings in one transaction. `move: "up"|"down"` stays for the keyboard path. The existing refusals (own subtree, duplicate) are unchanged.

A new `POST /pool/questions/:id/category { categoryId }` moves a question without its content. It bumps the question's `version`, so an editor open on that question gets the existing concurrent-edit refusal instead of moving it back silently.

### D5. Keyboard path

The tree becomes an ARIA `tree` with roving `tabindex`:

- ↑/↓ move the focus and ←/→ fold and unfold;
- Ctrl+X cuts the focused category or question row;
- Ctrl+V on a category makes the cut item its last child, or moves the question there;
- Alt+↑/Alt+↓ move a category among its siblings;
- F2 renames, Insert or `+` opens the new-subcategory popup, Delete arms the delete icon.

A short key legend sits under the tree. Cut-and-paste was chosen over indent/outdent because it also covers moving questions, and it maps to what the drag does.

### D6. Pool rows show their selection

With a course in the bar, each row gets a checkbox in a first column. The checkbox and the row click stay in sync through the existing `toggle()`. Without a course, there is no checkbox column, as today when no selection exists.

### D7. Popup for names

A small `role="dialog"` positioned under the node, not modal. It has German and English fields, OK and Cancel, Enter submits and Escape cancels. The server's refusal is shown inside it and it stays open. It is used for new and rename.

### D8. Rename and delete of years, classes and courses

The new endpoints are:

- `PUT /years/:id { name }` and `DELETE /years/:id`, refused for the current year or a year with classes;
- `PUT /classes/:id { name }` and `DELETE /classes/:id`, refused while the class has courses; the roster rows go with the class;
- `PUT /courses/:id` extended with `subject`, and `DELETE /courses/:id`, refused while the course has columns, entries, grades or tests.

Each refusal names the blocking records by count, as an i18n key with parameters. The UI puts Rename and Delete in the head of the class page, the course's config sheet and the year heading on `/exam/`. Rename uses an inline field with Save and Cancel.

Renaming a class renames only the module's record. The directory lookup for roster proposals uses the class's name, so a rename to a name the directory does not know just yields no proposals. That is the expected result of correcting a typo.

### D9. Ending and extending a sitting

The new endpoints are `POST /sittings/:id/end` and `POST /sittings/:id/extend { minutes }`, both only while the sitting is open (`sittingState === "open"`):

- **End** sets `closes_at` to now. The existing deadline sweep submits every running attempt, because an attempt's deadline is already the earlier of start plus duration and the window's end.
- **Extend** moves `closes_at` by 5 to 120 minutes and recomputes nothing else: deadlines are derived.

The rule "duration shorter than the window" applies to scheduling, not to ending, so the end endpoint bypasses it. Both are announced through the live channel like `updateSitting`, so open attempt pages pick up the new deadline from their next poll.

In the live view's head, **End now** is a `confirmButton`, and **Extend** is a small number field (default 5) with a button.

### D10. Student neighbours

`GET /courses/:id/students/:username` adds `previous` and `next` (username and display name) in the sheet's order, computed from the same roster query the sheet uses. The page head shows ← previous, Back to the gradebook and next →, keeping `?semester=`.

### D11. Comment in the sheet

The ✎ becomes a button in the override cell (`gradebook.js:380-382`) that toggles a one-line row under the student's row with the comment's text. `title` stays for mouse users.

### D12. Wording

| Key | Change |
|---|---|
| `exam.gradebook.semester.ss` | becomes "Whole year", same as `exam.bar.wholeYear` |
| `exam.bar.grades` | becomes "Gradebook" (de: "Notenbuch") |
| `exam.pool.type.multichoice` | becomes "One correct answer", same as `exam.editor.type.multichoice` |
| `exam.gradebook.actualGrade`, `exam.gradebook.proposal`, `exam.gradebook.teacherOverride` | sentence case |
| `exam.editor.statementTrue`, `exam.editor.statementFalse` (en) | "true", "false" |
| `exam.import.chooseFile`, `exam.import.cannotImport_*`, `exam.import.formatExplained` | "Claude" without the article |
| `exam.errors.gradebook.nobodyOnRoster` | reworded to say that no student was named |

The test head's hard-coded `en ? "English" : "Deutsch"` (`client/tests.js:205`) uses `exam.classes.languageEnglish`/`languageGerman`.

## Risks / Trade-offs

- [Drag-and-drop on touch competes with scrolling] → On touch, a drag starts only after a 300 ms press, and a plain swipe scrolls. The keyboard path and the popup remain as the fallback.
- [Removing `/exam/pool/categories` breaks bookmarks] → The route redirects with 301 to `/exam/pool`, keeping `?course=`.
- [Auto-save on the grading scale stores an intermediate state] → It is saved only when the whole scale is valid, as with the config sheet's weights. A scale used by existing grades stays recomputable as before.
- [Ending a sitting by accident] → Two-click confirmation. Students who were writing have their saved answers submitted, which is the same outcome as at the deadline, so nothing is lost.
- [Large surface across many files] → The tasks are grouped into phases that each leave the module consistent and pass `npm test`, so the change can be applied and deployed phase by phase.

## Migration Plan

No data migration. Deploy each phase to secureLectures after `npm test` passes, following the usual sync order (safeLearn first). Rollback means reverting the phase's commit, since the new endpoints only add capabilities and the removed category page is replaced by a redirect.

## Decisions confirmed by Gerald (2026-10-18)

- Extending a sitting moves only its window; the writing duration stays. Extra time for single students is out of scope.
- A course is deletable only while nothing hangs on it: no columns (an empty column blocks too), results, grades or tests.
- Renaming a class changes only the module's record, meant for fixing typos; a name the directory does not know yields no roster proposals.
- New question without a chosen category opens the editor with an empty category choice; it saves only once one is chosen.
