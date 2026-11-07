## 1. Shared tones

- [x] 1.1 Add `exam/client/row-tone.js` (no DOM) with `gradeTone`, `timingTone` and `setTone` per design D2
- [x] 1.2 Unit tests in `test/exam-row-tone.test.js`: grades 1–5 as numbers and as strings, `null`/`undefined`/`""` neutral, every timing mapped, `setTone` sets and removes `data-tone` on an object with `dataset`; add the file to `test/coverage-map.json` (and `exam/client/row-tone.js` to the `test/exam.test.js` guards beside `exam/client/tests.js`)
- [x] 1.3 `css/exam.css`: move the tone tokens of design D1 to `#markdown-content` / `#markdown-content.dark-mode`; add the `tr[data-tone]` stripe and tint rules and the `tr[data-flag="warn"]` stripe for `.sl-exam-table`, with tint winning over `.sl-exam-sticky` in both themes, losing to `tr.is-marked`, and sparing `td.sl-exam-participant`; add `.sl-exam-legend` / `.sl-exam-legend-item[data-tone|data-flag]`
- [x] 1.4 Move the test list onto the tones: `exam/client/tests.js` sets `data-tone` from `timingTone` beside `data-timing`, and its legend uses `.sl-exam-legend`; remove the `--sl-exam-timing-*` tokens and rules and `.sl-exam-tests-legend*` from `css/exam.css`; check the list looks unchanged in light and dark mode

## 2. Grade colours

- [x] 2.1 Gradebook sheet (`exam/client/gradebook.js`, the row builder around line 474): give `show` the `<tr>` and call `setTone(tr, gradeTone(values.effective))` on every redraw (design D3); the sheet of students who left gets the same
- [x] 2.2 Student record (around line 860): category rows by `category.grade`, winter row by the winter grade, proposal row by `proposal.grade`, actual-grade row by `effective`, redrawn where the grade cell is redrawn (around line 832)
- [x] 2.3 Results tables (`resultsTable`, around line 913): each row by `gradeTone(row.grade)`; a project's mark row stays neutral
- [x] 2.4 Grading scale (around line 979): rows 1 and 2 good, 5 bad, 3 and 4 neutral, independent of the thresholds

## 3. Live view

- [x] 3.1 `exam/client/live.js`: `data-tone="good"` on a submitted participant's row; remove `.sl-exam-live-table tr[data-status="submitted"] { opacity: 0.7 }` from `css/exam.css`
- [x] 3.2 `fillSuspicious` sets or removes `data-flag="warn"` and the row's `title` on `cell.closest("tr")`; `row()` sets it from `cell.dataset.suspicious` after building the `<tr>` (design D5)
- [x] 3.3 A legend above the live table: "submitted" (good) and "suspicious signal" (warn stripe); none on the view for the class
- [x] 3.4 `i18n/en.json`, `i18n/de.json`: the legend and tooltip texts, same keys in both, keys sorted (BabelEdit format)

## 4. Browser checks and docs

- [x] 4.1 `test/exam.test.js`, in the gradebook suite: a student with effective grade 5 has `data-tone="bad"`, one with 2 `good`, one with 3 and one without results none; an override from 5 to 4 clears the tone without a reload; a sticky cell of a red row has the tint as computed background; a marked row shows the marked colour
- [x] 4.2 `test/exam.test.js`: the scale's rows carry good, good, none, none, bad; the student's own results carry the tone of each result's grade
- [x] 4.3 `test/exam.test.js`, in the live-view suite: a submitted row has `data-tone="good"` and full opacity; a row with hidden-by-timing has `data-flag="warn"`; the class screen has no `[data-tone]` or `[data-flag]`
- [x] 4.4 The test list's existing check still passes (`data-timing` and its legend now with `.sl-exam-legend-item`): adjust the selector in `test/exam.test.js` (search for `sl-exam-tests-legend-item`)
- [x] 4.5 Run `node --test test/exam-row-tone.test.js test/coverage.test.js test/i18n.test.js` and the exam harness `node --test test/exam.test.js` (on HEAD before this change, "the live view orders by status…" and "a present student sees their handout…" already fail; compare against that)
- [x] 4.6 `docs-exam-module.md`: describe the grade colours (sheet, record, results, scale) and the live view's colours; `AI/architecture.md`: add `client/row-tone.js` and the shared tones beside `client/test-timing.js`
