## 1. Client

- [x] 1.1 `clockEditor` in `exam/client/tests.js` per D1: one date field, two time fields, the window state from `viennaInstant`; invalid times refused by the form
- [x] 1.2 `css/exam.css` for the time fields if the form needs it; check both themes and the 390px viewport (2026-10-20: width and invalid outline of `.sl-exam-time`; the reschedule form's 390 px check runs on these clock-time fields and passes; the fields inherit the theme like the date field)
- [x] 1.3 Catalog keys if new labels are needed, both languages; `test/i18n-catalog.test.js` stays green (none needed: `exam.tests.date`, `opens`, `closes` and `exam.dateInput.timePattern`, `unreadableTime` exist)

## 2. Checks and wrap-up

- [x] 2.1 Harness: the checks reading `opensAt`/`closesAt` read the date and the two times (D3); a sitting scheduled in clock times through the form stores the chosen date and times
- [x] 2.2 Update `docs-exam-module.md` (clock-time fields)
- [x] 2.3 Run `test/exam.test.js` and the unit files and record the result (2026-10-20: unit files 279/280, one skipped, none failing; `test/exam.test.js` twice, 128/137 each: the 8 known failures (seven without directory-service credentials, "the Exams page hides the student's results") plus one flaky click different in each run (module bar; gradebook sheet), both seen before this change. All clock-time and reschedule checks pass.)
