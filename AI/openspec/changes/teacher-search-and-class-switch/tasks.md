## 1. Matching and filter

- [x] 1.1 Add and export `matchesPerson(person, query)` next to `displayPerson` in `exam/client/classes.js` (D1): pieces at whitespace, lowercase, NFD with combining marks stripped, every piece a substring of family name, given name and username
- [x] 1.2 Add `teacherFilter(rows)` (D2): search field, live `input` filtering via `hidden`, a "no teacher matches" line; ticked boxes stay ticked while hidden
- [x] 1.3 Add i18n keys in `i18n/de.json` and `i18n/en.json` (same keys, BabelEdit format): filter placeholder, filter label, no match

## 2. The three places

- [x] 2.1 Class page `teacherSection`: replace the `<select>` with the filter and a match list, one "enter" button per match, nothing shown before typing (D3)
- [x] 2.2 `ClassNew`: put the filter above the teacher checklist; verify that a ticked teacher hidden by the filter is still sent on create
- [x] 2.3 Year change class step: filter inside the other teachers' `<details>`, which opens on typing (D4)
- [x] 2.4 Styles in `css/exam.css` for the field and match list, matching the existing `sl-exam-checklist` look

## 3. Class switch in the bar

- [x] 3.1 `exam/client/bar.js` `connectBar`: call `cascadeTo` only for a year choice (D5); update the header comment and the comment at the change handler
- [x] 3.2 Check by hand: start page with one class and one course still lands on the course; a year change with one class and one course still lands on the course

## 4. Tests and docs

- [x] 4.1 `test/exam.test.js`: unit check for `matchesPerson` (`gru lei`, `franz gru`, accents, case, no match)
- [x] 4.2 Browser check: admin types `gru lei` on a class page, enters the match, and the teacher list shows them
- [x] 4.3 Browser check: admin ticks a teacher in "new class", filters them away, creates the class, and the teacher is entered
- [x] 4.4 Browser check: a teacher on a class page switches the class in the bar to a class with a single course and stays on the class page; the existing start-page preselection checks still pass
- [x] 4.5 `docs-exam-module.md`: describe the teacher filter and the narrowed preselection
- [x] 4.6 Run the affected checks, then the full `npm test` once
