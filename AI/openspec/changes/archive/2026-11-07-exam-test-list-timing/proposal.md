## Why

A teacher's list of tests grows over the school year, and it was sorted oldest first with every row looking the same. To find the test that is being written right now, or the next one, the teacher had to read every row's sittings. The list should show at a glance what is happening now, what comes next and what is done, with the newest tests on top.

This change documents what was built and deployed on 2026-11-07 (commits `1ea31f2` and `58c35f7`).

## What Changes

- Each test's row in a course's list of tests is coloured by where the test stands: **open right now** (red), **within the next 7 days** (amber), **later, or no sitting yet** (slate) or **done** (green). A legend above the tables and each row's tooltip say the same in words.
- A course's tests are listed newest first: tests without a sitting on top (the most recently created first), then by the start of their first sitting, latest first. Before, the list was oldest first, with tests without a sitting at the end.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `online-test`: "A course lists its tests" gains the timing colours and the newest-first order.

## Impact

- `exam/client/test-timing.js` (new, no DOM): `testTiming(test, at)` decides a row's state.
- `exam/client/tests.js`: `data-timing` and the title on each row, and the legend.
- `exam/tests.js`: `courseTests` orders newest first.
- `css/exam.css`: row colours and the stripe at each row's left edge, light and dark.
- `i18n/en.json`, `i18n/de.json`: `exam.tests.timing*` keys (BabelEdit format).
- Tests: `test/exam-test-timing.test.js` (new), the ordering in `test/exam-tests.test.js`, the list's state and legend in `test/exam.test.js`.
