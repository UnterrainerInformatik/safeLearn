## 1. Server

- [ ] 1.1 `testSittings` returns each sitting's attempt count; unit test in `test/exam-tests.test.js` that the count is per sitting, not per test
- [ ] 1.2 `rescheduleSitting` in `exam/tests.js` per D1 (state check, admin check, count check, window via `sittingTimes` with the stored duration, participants still on the roster, attempts deleted, window and participants written, `refreshUsageDate`, all in one transaction); unit tests: no attempts by a teacher, attempts by an admin, attempts by a teacher refused, count mismatch refused, scheduled and open sittings refused, left participants dropped, nobody left refused, make-up untouched, usage date and gradebook column move into the next semester
- [ ] 1.3 Route `POST /api/sittings/:id/reschedule` in `exam/routes-tests.js` per D2 with the announcements; route test that a non-admin gets 403 for a sitting with attempts and that the live stream receives `window` and `deleted`
- [ ] 1.4 Error keys `exam.errors.tests.sittingNotOver` and `exam.errors.tests.attemptsChanged` in `i18n/en.json` and `i18n/de.json`

## 2. Client

- [ ] 2.1 `exam/client/periods.js`: `nextWeekday(date)`; unit test across a Friday, a Saturday and a Sunday
- [ ] 2.2 `exam/client/tests.js`: **Reschedule** on an over sitting per D3 (visibility by attempts and admin), reschedule mode of the sitting form (periods matched from the old window, next weekday, duration and participants read-only), plain save without attempts, armed second click with the count with attempts
- [ ] 2.3 Catalog keys under `exam.tests` (`reschedule`, `rescheduleSitting`, `rescheduleArmed` with `{count}`, read-only labels) in both languages; `test/i18n-catalog.test.js` stays green
- [ ] 2.4 `css/exam.css` only if the read-only fields need it; check both themes and the 390px viewport

## 3. Checks and wrap-up

- [ ] 3.1 Harness check: a teacher reschedules an over sitting without attempts and sees it as scheduled on the new date; an admin reschedules one with an attempt via the two clicks and the gradebook loses the result; a non-admin teacher sees no Reschedule on a sitting with attempts
- [ ] 3.2 Update `AI/architecture.md` (routes, sitting rules) and `docs-exam-module.md` (sittings section)
- [x] 3.3 Remove the entry "Eine vorbeigegangene Sitzung neu ansetzen" from `AI/open-proposals.md` (done when the change was created)
- [ ] 3.4 Run `npm test` in both module configurations and record the result
- [ ] 3.5 (Waiting for Gerald's go-ahead to deploy.) Deploy to secureLectures and reschedule a real over sitting without attempts
