## 1. Data

- [x] 1.1 `exam/migrations/020-offline-group-factor.sql`: add `test.group_factor_a` and `test.group_factor_b` (REAL, default 1, each 1…2, at least one of them 1) (design D1); verify that a migrated test database keeps every existing test at 1:1 and that the CHECKs refuse `a = 1.2, b = 1.1`
- [x] 1.2 `exam/tests.js`: export the "group that counts" query per course (latest present sitting, otherwise A) (design D3); verify with unit tests in `test/exam-offline.test.js`: absent from the first sitting and B at the make-up counts as B, present in no sitting counts as A

## 2. Counting

- [x] 2.1 `exam/gradebook.js` `courseEntries`: apply the raised group's factor to offline-column entries, keep `enteredValue`, cap at 1, derive `grade` from the counted value, and ignore the factor while the test has no `handout_b` (design D2); verify with unit tests in `test/exam-gradebook.test.js`: 18/24 × 1.20 = 0.90, 22/24 × 1.20 = 1, group A unchanged, a percent column raised, one handout ignores a stored factor
- [x] 2.2 Verify in `test/exam-gradebook.test.js` that the proposal and the year grade use the counted value, and that moving a student to group B in the attendance table changes their counted result without a write to `manual_entry`

## 3. Writing the factor

- [x] 3.1 `exam/gradebook.js` `updateColumn`: accept `groupFactor: { a, b }` only for an offline test's column with two handouts, round to the 0.05 grid, and refuse a value out of range or both raised (`exam.errors.gradebook.groupFactorRange`, `…noGroupFactor`) (design D4); verify with unit tests for each refusal leaving the factor unchanged
- [x] 3.2 Column and sheet payloads carry `groupFactor`, `twoHandouts`, and per result `group`, `enteredValue`, `value`; verify through the existing sheet API test in `test/exam-gradebook.test.js`

## 4. UI

- [x] 4.1 `exam/client/gradebook.js`: the slider (−20…+20) in the column dialog for an offline column with two handouts, the ratio text in locale format updating on `input`, saving on `change`, a 1:1 reset (design D5); verify in the browser checks that four steps right show `A 1,00 : B 1,20` and that the slider is absent with one handout
- [x] 4.2 `exam/client/gradebook.js`: the header mark and the ratio in the hover text, and the counted value after each raised field (design D6); verify in the browser checks
- [x] 4.3 Student results view: `18 / 24 · ×1,20 (Gruppe B) → 90 %` for a raised entry; verify in the browser checks as a demo student
- [x] 4.4 `css/exam.css`: slider styling in light and dark mode; verify visually in both modes
- [x] 4.5 `i18n/de.json`, `i18n/en.json`: the new keys with the same names in both (BabelEdit); verify that `test/i18n-catalog.test.js` passes

## 5. Docs and full run

- [x] 5.1 `docs-exam-module.md` (offline tests, the gradebook) and `AI/architecture.md`: the factor A:B, the slider, and which group counts
- [x] 5.2 Run the affected tests, then the full `npm test` once at the end
