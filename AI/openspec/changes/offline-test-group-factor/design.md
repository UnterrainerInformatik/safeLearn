## Context

An offline test's column is an ordinary `assessment` row of kind `test` or `shorttest`, linked from `test.assessment_id` (migration 013). A result is a `manual_entry` holding `points` (or nothing for a percent column) and `value`, the fraction `points / max_points` or `percent / 100`. `updateColumn` rewrites `value` from `points` when the maximum changes. Every reader of results goes through `courseEntries` (`exam/gradebook.js`), which maps rows by `entryFromRow`. That covers the sheet, the proposal, the year grade and the student's results. `entryFromRow` also derives the shown `grade` from `value`. The group is `sitting_participant.handout_group` ('A'/'B'), together with `present`, per sitting. A student can be a participant of several sittings of one test (a make-up). The UI decision is a slider A:B (proposal.md, Why/What Changes).

## Goals / Non-Goals

**Goals:**
- One place computes the counted value, so the sheet, the proposal and the student's view can never disagree.
- The stored entry stays what the teacher typed. Neither the factor nor a group change ever rewrites results.

**Non-Goals:**
- No factor for online tests, and none for ordinary manual columns.
- No lowering of a group (factor < 1). Only the harder group is raised.
- No per-question or per-task weighting.

## Decisions

**D1 — Two columns on `test`, at least one of them 1.**
Migration 020 adds `group_factor_a REAL NOT NULL DEFAULT 1` and `group_factor_b REAL NOT NULL DEFAULT 1`, each `CHECK (… BETWEEN 1 AND 2)`, plus `CHECK (group_factor_a = 1 OR group_factor_b = 1)`. The slider position maps to them one to one: middle means both 1, *n* steps left means `a = 1 + 0.05n`, *n* steps right means `b = 1 + 0.05n`. Values are rounded to the 0.05 grid on write. The factor lives on the test rather than on `assessment`, because the groups belong to the test. The column dialog reaches it through `test.assessment_id`. Alternative considered: one signed number (−1…+1). It is compact, but every reader would have to decode it, and the two-column form reads directly as "A : B".

**D2 — The factor is applied at read time in `courseEntries`, never stored into `value`.**
For the offline columns of the course, `courseEntries` loads `{ assessmentId → { a, b, twoHandouts } }` and the group that counts per student (D3). An entry of a raised group gets `enteredValue` (the stored fraction), `factor`, `group`, and `value = min(1, enteredValue × factor)`. `grade` is derived from the new `value`. A percent column has no `points` to recompute from, so baking the factor into `value` would lose the typed percent. Read time avoids that, and makes a group change in the attendance table take effect with no write to the gradebook. Alternative considered: rewrite `value` on every factor or group change, like `updateColumn` does for the maximum. Rejected because of the percent columns and because it spreads the rule into `tests.js`.

**D3 — The group that counts: the latest present sitting.**
One query per course: for each `(test, username)`, the `handout_group` of the sitting with the latest `started_at` among the started sittings where `present = 1`. A planned sitting is left out: everyone in it is present by default, but nobody has been present at it yet, so a scheduled make-up does not move a student to group A before it takes place. No row means group A. The query is a window over `sitting_participant JOIN sitting JOIN test WHERE test.course_id = ? AND test.kind = 'offline'`. It is exported from `exam/tests.js` as `countingGroups` so the attendance code and the gradebook share the definition.

**D4 — Writing the factor through the column dialog.**
`updateColumn` accepts `groupFactor: { a, b }` for a column whose `test_id` is an offline test with `handout_b`. For any other column it refuses with `exam.errors.gradebook.noGroupFactor`. It refuses with `exam.errors.gradebook.groupFactorRange` outside 1…2, off the grid after rounding, or with both above 1. The column payload (`columnFromRow` / sheet data) carries `groupFactor` and `twoHandouts`, and each result carries `group`, `enteredValue` and the counted `value`.

**D5 — The slider is a native `<input type="range">`.**
Range −20…+20, step 1, value 0 in the middle. Negative values raise A and positive values raise B. Labels `A` and `B` sit at its ends, and the ratio text `A 1,00 : B 1,20` uses the locale's decimal format (`locale-formats`). A "1:1" button resets it. A native range gives keyboard and touch handling for free. It saves on `change`, not on every `input`, so a drag is one write, while the ratio text follows `input` live. It is styled in `css/exam.css` for light and dark, per the dialog requirement.

**D6 — How the sheet and the student show it.**
The header gets a small mark (`A:B` in the header text) when the factor is not 1:1, and the hover text gains the ratio line. A raised field shows its counted percentage in quiet text after the input (`18 → 90 %`). The student's results page, for an entry with `factor > 1`, shows `18 / 24 · ×1,20 (Gruppe B) → 90 %`.

## Risks / Trade-offs

- [Grades already proposed or overridden shift when the teacher moves the slider] → That is the purpose. The override still wins, as with any changed result.
- [A teacher moves a student's group long after the test and silently changes a grade] → The counted value is shown in the field, so the change is visible in the sheet. It is accepted as the attendance table's meaning.
- [A test loses its second handout after a factor was set] → The factor stops counting but is kept (spec), so adding handout B again restores it. The dialog hides the slider while only one handout exists.
- [`courseEntries` gets one more query per course] → One indexed query over the course's offline sittings. Negligible next to the existing ones.

## Migration Plan

Migration 020 only adds columns with defaults (1:1), so every existing test counts exactly as before. Rollback means reverting the code. The columns can stay, since nothing else reads them.
