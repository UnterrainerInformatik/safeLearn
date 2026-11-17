Source: AI/open-proposals.md, entry **Offline-Test: Gruppen A und B unterschiedlich gewichten** (decided with Gerald on 2026-11-17: a factor A:B set by a slider, not a maximum per group).

## Why

An offline test with two handouts is one column of the gradebook with one maximum. The group of each participant is stored in the attendance table, but no calculation uses it. When one handout turns out harder than the other, the teacher has no way to even this out. Splitting the test into two columns would make it count as two tests. The teacher needs to correct the harder group inside the one column after the test, without retyping any points.

## What Changes

- An offline test with two handouts gets a **factor A:B**, 1:1 by default. A teacher sets it in the column's dialog in the sheet with a **slider** between A and B. With the knob in the middle both groups count as entered. Moving it toward A raises group A's results, and moving it toward B raises group B's, up to ×2.00 in steps of 0.05. The dialog shows the ratio as numbers, e.g. `A 1,00 : B 1,20`. Only one group is ever raised. The other stays at 1.
- A raised group's result counts as the entered fraction times its factor, capped at 100 %. This applies to points and to percent columns. The points as typed stay stored unchanged. Changing the slider, or moving a participant to the other group, changes the result at once without retyping.
- The group that counts is the participant's group in the latest sitting of the test in which they were marked present. A participant without such a sitting counts as group A.
- The column's header in the sheet shows that the column has a factor, and hovering shows the ratio. Each raised field shows its counted value.
- A student of the raised group sees on their results page that the factor was applied, and the result it gave.
- The factor only counts while the test has two handouts.

## Capabilities

### New Capabilities

### Modified Capabilities
- `offline-test`: a new requirement for the factor A:B: the slider, how it counts, which group counts, and how the sheet and the student show it.

## Impact

- `exam/migrations/020-offline-group-factor.sql`: `test.group_factor_a`, `test.group_factor_b` (REAL, default 1, each from 1 to 2, at least one of them 1).
- `exam/gradebook.js`: `courseEntries` applies the factor to an offline column's entries of the raised group. `updateColumn` accepts and validates the factor for an offline test's column. The column payload carries the factor and the per-student group.
- `exam/tests.js` / `exam/participants.js`: the group that counts, per student and test.
- `exam/client/gradebook.js`: the slider in the column dialog, the header mark, the counted value in raised fields. `exam/client` results view: the student's note.
- `css/exam.css`: the slider, light and dark.
- `i18n/de.json`, `i18n/en.json`: new keys.
- `test/exam.test.js`, `test/exam-offline.test.js`, browser checks for the sheet.
- `docs-exam-module.md`, `AI/architecture.md`.
