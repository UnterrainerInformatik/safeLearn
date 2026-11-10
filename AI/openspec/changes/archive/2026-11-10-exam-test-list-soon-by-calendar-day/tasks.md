## 1. Rule

- [x] 1.1 `exam/client/test-timing.js`: replace `SOON_MS` by `SOON_DAYS = 6` and compare Vienna calendar days via `viennaLocal` from `./periods.js` (design D1, D2); update the doc comments; verify with `node --test test/exam-test-timing.test.js`
- [x] 1.2 `test/exam-test-timing.test.js`: replace the 168-hour boundary test by calendar-day cases - Monday 10:00 vs. next Monday 08:00 (later), vs. Sunday 23:00 (soon), today 23:00 at 08:00 (soon), a span across the DST changeover (2026-10-25 / 2027-03-28) counting days, not hours; keep the make-up and past-offline cases; verify the file passes
- [x] 1.3 `test/coverage-map.json`: update the "what" of `test/exam-test-timing.test.js` to the calendar-day rule; verify `npm test`'s coverage check accepts it

## 2. Wording

- [x] 2.1 `i18n/en.json`, `i18n/de.json`: `exam.tests.timingSoon` → "within the next 6 days" / "in den nächsten 6 Tagen"; verify the legend in the list shows it
- [x] 2.2 `docs-exam-module.md`: the list's colour paragraph says amber while a sitting opens within the next 6 days, counted in calendar days; verify by reading it

## 3. Verification

- [x] 3.1 Run `npm test` and confirm the exam list checks (`test/exam.test.js`, legend states) pass; re-run known flaky checks once before treating them as failures
