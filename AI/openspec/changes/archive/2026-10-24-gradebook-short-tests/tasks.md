## 1. Category and data

- [x] 1.1 `exam/migrations/012-short-tests.sql`: rebuild `assessment` (CHECK with `shorttest`) and `manual_entry`, keeping ids and recreating the indexes (design D2). Materialize the weights of every course and add `shortTests: 0` (D3). The comments follow the style of `004`
- [x] 1.2 `exam/grading.js`: `entryCategory.shorttest = "shortTests"`. `exam/classes.js`: `weightCategories` with `shortTests` after `manualTests`, `defaultWeights` 20 each. `exam/gradebook.js`: the kinds list and the doc comments name short tests
- [x] 1.3 `i18n/de.json` / `i18n/en.json` (same keys, BabelEdit): `exam.categories.shortTests` ("Kurztests" / "Short tests"), plus any refusal text that lists kinds or categories
- [x] 1.4 Amend the category list in `AI/openspec/changes/exam-module/specs/gradebook/spec.md` (the proposal requirement and its scenarios, if they enumerate) to include short tests (see proposal, Capabilities)

## 2. Compact sheet

- [x] 2.1 `i18n/format.js`: expose `dayMonth` on `createFormat` (D5), with a unit check in the format tests for de and en
- [x] 2.2 `exam/client/gradebook.js`: `categories`, `categoryLabels`, `addableKinds` with short tests. `exam/client/classes.js`: the label
- [x] 2.3 `exam/client/gradebook.js`: merge `addColumn` into `columnDialog(course, column, category)`. For a new column it adds via a form; for an existing one each field is saved on change and the dialog offers delete (`confirmButton`). Closing after a save reloads the sheet (D4)
- [x] 2.4 `columnHead`: text lines name / `dayMonth` (once if the name is the date) / `/max`, inside a `sl-exam-column-edit` button for editable columns, with the full details in the `th`'s `title`. Read-only and left-student headers get the same text without a button, and an online test keeps its link
- [x] 2.5 Empty category placeholder shows "–" with its text as `title`. The leading headings get shorter labels (de `Vorschlag` / `Festgelegt` / `Note`, en `Proposal` / `Override` / `Grade`) and the long form as `title` (new keys for the long forms)
- [x] 2.6 `css/exam.css`: remove the header-input rules and style `.sl-exam-column-edit`, the ellipsis for long names, and `text-transform: none` for the leading headings (D6)

## 3. Verification

- [x] 3.1 `test/exam-gradebook.test.js`: a short-test column with points and in percent. The short-test category enters the proposal with its weight (scenario "A quiz weighs less than a test"). Migration from version 9: ids, counts and every proposal unchanged, with weights materialized and `shortTests: 0`, `'{}'` included
- [x] 3.2 `test/exam-classes.test.js`: a new course starts at 20 × 5. Weights without `shortTests` or not adding up to 100 are refused
- [x] 3.3 `test/exam.test.js`: rewrite the checks that typed into header inputs so they open the dialog (rename, change maximum incl. refusal, delete with confirmation). New checks: a short-test column end to end through the `+`, the group order, a header's text and `title`, and the participation header showing its date once
- [x] 3.4 Re-run the screenshot script (`sheet-shot.mjs` in the session scratchpad, or an equivalent) on the nine-column course and record the new table width here (before: 2253 px)
  - 2026-10-24: **1541 px** (before: 2253 px). Columns 64–132 px (the result fields set the width), leading 144/101/90/66 px. The empty online-test and short-test placeholders are 181/204 px wide, set by their category heading above them. The screenshots also showed that the content table's `#markdown-content table th { text-transform: capitalize }` outranked the sheet's resets ("Manual Tests"). The resets for the column heads, category headings and leading headings now carry `#markdown-content`
- [x] 3.5 `docs-exam-module.md`: the fifth category, editing a column through its header, and the hover details
- [x] 3.6 Run `npm test` in full and record the result here (known flaky checks: see memory `flaky-content-checks`)
  - 2026-10-24: **732/732 pass**, 114 suites, 0 fail, 369 s. No flaky check failed this time.
