## 1. Timing

- [x] 1.1 Add `exam/client/test-timing.js` with `testTiming(test, at)` per design D1
- [x] 1.2 Unit tests in `test/exam-test-timing.test.js`: no sitting, all over, open beside other sittings, the 7-day boundary, a make-up near and far, a planned offline sitting past its time

## 2. List

- [x] 2.1 `exam/client/tests.js`: `data-timing` and the title on every row, and a legend above the tables
- [x] 2.2 `css/exam.css`: row tint and left stripe for the four states, light and dark, the marked row taking precedence
- [x] 2.3 `i18n/en.json`, `i18n/de.json`: `exam.tests.timingOpen`, `timingSoon`, `timingLater`, `timingDone`
- [x] 2.4 `test/exam.test.js`: a test whose only sitting is over is listed as done, with a coloured row and the legend

## 3. Order

- [x] 3.1 `courseTests` in `exam/tests.js`: no sitting on top (newest created first), then by first sitting, latest first
- [x] 3.2 Unit test in `test/exam-tests.test.js`, including a later make-up that does not move its test
