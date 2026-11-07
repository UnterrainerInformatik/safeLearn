## Why

Since 2026-11-07 the list of online tests colours each row by where its test stands (open now, within 7 days, later, done; change `2026-11-07-exam-test-list-timing`), and teachers find their way in it at a glance. The module's other tables still look the same on every row, although most of them carry one value that matters most for the row: a grade, a status, being present. Gerald wants the same coloured rows wherever that is useful, starting with the gradebook: a 5 in red, a 1 or 2 in green, everything else unchanged.

## What Changes

- **One row-colour vocabulary for the module.** The tints and edge stripes introduced for the test list become shared tones (`good`, `bad`, `warn`, `info`, `quiet`) that any table row can take, in light and dark mode. Colour is never the only carrier, and the marked row keeps its highlight. The test list moves onto the shared tones without any visible change.
- **Grade colours.** One rule wherever a row stands for a grade: **5 red**, **1 or 2 green**, **3, 4 or no grade neutral**.
  - The gradebook sheet: each student's row by their effective grade (the override, else the proposal) for the semester or year shown. It changes as results and overrides are saved, without a reload. The same holds for the sheet of students who left.
  - A student's record (teacher view): the rows for categories, the winter grade, the proposal and the actual grade, each by its own grade.
  - The student's own results (Exams page) and the entries on a student's record: each result's row by the grade of that result. A project's mark row stays neutral.
  - The grading scale: the rows for 1 and 2 green, the row for 5 red, 3 and 4 neutral. The scale itself works as the legend of the grade colours.
- **Status colours.**
  - The live view of an online sitting: a submitted participant's row green, replacing today's dimming. A row with the suspicious signal (manipulated browser, hidden by timing, missing heartbeat) gets an amber edge stripe as a flag, never red and never a full tint. Not started and writing stay neutral.
- **Left alone:** tables that already colour their rows keep their own colours: the attendance table (tinted by handout group A/B, an absent row faded), the question pool (chosen rows green, unreviewed amber stripe, retired rows), the rosters (a student who left faded). Tables without one value per row (classes, a course's config sheet, past imports, the import preview) stay neutral.
- Every coloured row names its meaning in words (the visible value, plus a tooltip where the value alone does not say it). A legend stands above a table only where the meaning is not already visible in the row itself, as in the live view.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `exam-ui-conventions`: a new convention for coloured rows (shared tones, never the only carrier, the marked row wins, light and dark).
- `gradebook-sheet`: a student's row in the sheet, the rows of a student's record and the rows of the results tables are coloured by their grade.
- `gradebook`: the grading scale shows the grade colours.
- `online-test`: the live view colours a submitted participant and flags a suspicious one; the test list's colours follow the shared convention.

## Impact

- `css/exam.css`: shared tone tokens and `tr[data-tone]` rules (light and dark). The test list's `--sl-exam-timing-*` rules are replaced by the tones. `.sl-exam-live-table tr[data-status="submitted"] { opacity: 0.7 }` is removed.
- `exam/client/row-tone.js` (new, no DOM): `gradeTone(grade)` and the mapping from test timing to tone, unit-tested like `test-timing.js`.
- `exam/client/gradebook.js`: sheet rows (`row`, around line 474, updated in `show`), the record table (around line 860), `resultsTable` (around line 913), the scale (around line 979).
- `exam/client/live.js`: participant rows (around line 481). The attendance rows (around line 441) are not touched.
- `exam/client/tests.js`: the test list rows and legend move to `data-tone`. `data-timing` stays as the state's name.
- `i18n/en.json`, `i18n/de.json`: tooltip and legend texts (BabelEdit format).
- Tests: `test/exam-row-tone.test.js` (new) and checks in `test/exam.test.js` for the sheet, the scale, the student's results and the live view; `test/coverage-map.json`.
- Docs: `docs-exam-module.md`, `AI/architecture.md`.
