## Why

In the teacher's list of online tests a row turns amber ("within the next 7 days") while a sitting opens less than 7×24 hours from now. On a Monday after 8:00 that already catches next Monday's 8:00 test, so this week's and next week's Monday tests look alike - the amber no longer tells "this week" from "next week".

## What Changes

- A sitting counts as coming up when it opens at most 6 calendar days from today, counted in the school's time zone (Europe/Vienna), no longer when it opens less than 168 hours from now. On a Monday, every day up to and including Sunday is amber; next Monday is later, whatever the time of day.
- A sitting later today still counts as coming up (0 days), and a planned offline sitting past its time that has not been started stays amber as before.
- The state's label follows: "within the next 6 days" / "in den nächsten 6 Tagen" (legend and row tooltip).
- The user-facing description in `docs-exam-module.md` follows.

## Capabilities

### New Capabilities

### Modified Capabilities
- `online-test`: the "within the next 7 days" state of "A course lists its tests" becomes "opens within the next 6 calendar days in the school's time zone".

## Impact

- `exam/client/test-timing.js` (the rule), `test/exam-test-timing.test.js` (its unit tests), `i18n/en.json` and `i18n/de.json` (`exam.tests.timingSoon`), `docs-exam-module.md`, `test/coverage-map.json` (the description of the unit test).
- No server, API or data change; colours and tones stay as they are.
