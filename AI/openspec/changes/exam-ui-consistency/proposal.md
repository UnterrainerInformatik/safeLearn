Source: AI/open-proposals.md

## Why

The design review of 2026-10-18 found that the exam module's pages hide what a teacher can do: actions are plain links or quiet lines at the bottom of a page, the category tree is maintained on a separate page with six controls per node, deletions are confirmed in four different ways (and three not at all), and some everyday actions do not exist. Now that the module is in daily use, these get in the way. Gerald's guidelines for the whole change:

- Actions are buttons, not links.
- What a page offers is visible at first glance.
- A click path for rare actions is wanted (show a question, and only there **Edit**).
- Function lives in the structure itself (list, tree, table head), not in a menu of its own or as a link at the end of the page.

## What Changes

- **One button style for the module.** Every action is a button in the module's style, the page's main action is marked as primary, and links remain only where they lead to a page to read (a test's name, a student's name, a class in a table). Covers the pool (Edit, New question, Import questions), the four "Back to the pool", "Open the gradebook", "Enter results in the gradebook", "Config sheet · Grading scale", the test page (Add questions from the pool, Try this test as a student sees it, Solution on the board), the test list's "live view · class screen", the live view's "Class screen" and the import's "Download the format description". The question name in the pool list stops looking like a link. Create test, Import n questions, Mark as reviewed and Make current become primary.
- **Actions move into the structure they act on.**
  - Delete this test moves into the test's head beside Rename.
  - Messages appear at the action that caused them.
  - The class page's course list carries `+ Course`.
  - The grading scale gets a button in the module bar beside Question pool and Online tests, and the quiet links at the end of `/exam/` go away.
  - New question is always visible and also offered as `+` at a category.
  - Import n questions stands above the preview.
  - The online-tests list gets **New test**.
  - Each pool row shows its selection as a checkbox.
  - A gradebook comment is visible in the sheet, not only as a tooltip.
- **The category tree is maintained in the pool's tree.** Dragging a category onto a category makes it a subcategory. Dragging it between two categories places it there, shown by a line. Dragging a question onto a category moves the question. Further controls at each node:
  - `+` opens a small name popup (German/English) for a new category;
  - a double click or a pencil icon renames;
  - a bin icon deletes an empty category after confirmation.

  Refusals are shown at the node. Every move can also be done by keyboard. **BREAKING**: the page `/exam/pool/categories` is removed and redirects to `/exam/pool`.
- **One confirmation pattern.** Every destructive action asks by a second click on the same button, whose label then says what the second click does, and never by a browser dialog. This replaces `window.confirm` (roster removal, gradebook column, category, question), the in-page confirmation of the import's Take back, and adds confirmation where there is none: deleting a scheduled sitting (first) and removing a question from an unwritten test. **Unbind browser** (today "Release to another browser") deliberately has no confirmation; it belongs to `exam-live-bound-browser`.
- **Missing actions.**
  - School years, classes and courses can be renamed, and deleted while nothing depends on them.
  - The live view can end a running sitting and extend its window.
  - The student page in a course leads to the previous and next student and, at its top, back to the gradebook.
  - The empty states "Nobody is on this course's roster." and "There is no school year yet." carry the button for the next step.
- **Consistency.**
  - The grading scale saves as it changes like every other page, and the student page says "saved as it changes".
  - One wording each for: Whole year, Gradebook (bar and page), One correct answer, sentence case in the gradebook's headings, the course language in the reader's language, "true"/"false" without German in the English editor, "Claude" without "the" in the import.
  - The refusal "Nobody is not on the roster…" is reworded.

Related, but separate changes: `exam-my-hide-results-while-writing` (the student's `/exam/my` hides results during an attempt) and `exam-live-bound-browser` (the live view's "bound to browser" column and the **Unbind browser** button without confirmation).

## Capabilities

### New Capabilities

- `exam-ui-conventions`: module-wide conventions for actions: buttons instead of links, one style with a primary action, actions placed in the structure they act on, messages at their action, one two-click confirmation, empty states that lead on, saving as it changes, and consistent labels.
- `exam-record-maintenance`: renaming and deleting school years, classes and courses, and ending or extending a running sitting.

### Modified Capabilities

- `question-editor`: the category tree is maintained by dragging (with a keyboard alternative) and with controls at each node in the pool's own tree. The separate category page goes away. New question is always offered.
- `exam-navigation`: the bar also leads to the grading scale.
- `gradebook-sheet`: a student's page leads to the neighbouring students and back to the sheet, and a comment is visible in the sheet.

## Impact

- Client: every file under `exam/client/` except `date-input.js`, `rich-text.js`, `i18n.js` and `periods.js`. `pool-categories.js` is removed. `armedButton` moves from `tests.js` to `frame.js`.
- Server:
  - `exam/bar.js` gets the scale button.
  - `exam/routes-pool-edit.js` and `exam/pool-edit.js` get category placement by position and a question-move endpoint, and the categories page becomes a redirect.
  - `exam/routes-classes.js` and `exam/classes.js` get rename and delete for years, classes and courses.
  - `exam/routes-tests.js` and `exam/tests.js` get end and extend for a sitting.
  - `exam/gradebook.js` gets the student's neighbours.
- `css/exam.css`: module button style, tree drag feedback, popup.
- `i18n/en.json`, `i18n/de.json`: new and changed keys, same keys in both (BabelEdit).
- Tests: `test/exam.test.js` (harness), `test/exam-classes.test.js`, `test/exam-tests.test.js`, `test/exam-question-editor.test.js`, `test/exam-gradebook.test.js`.
- Docs: `docs-exam-module.md`, `AI/architecture.md`.
- No database migration. Deleting records only removes rows that nothing references.
