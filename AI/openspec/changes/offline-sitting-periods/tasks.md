## 1. Plan functions in periods.js

- [ ] 1.1 Add `planFor(periods, date, from, offset, to)` and `matchPlan(periods, opensAt, durationMinutes)` to `exam/client/periods.js` (design D2); verify with new cases in `test/exam-periods.test.js`: lessons 4–6 with offset 0 and 5 (160/155 min), an end within the start lesson (20 min in lesson 2), `to < from` and past-midnight throws, a plan starting 07:58 matches nothing, both DST dates

## 2. Server: duration per offline sitting

- [ ] 2.1 `createOfflineSitting`/`updateOfflineSitting` in `exam/tests.js` accept `durationMinutes` (1–600, refused otherwise), default to the test's duration for a first sitting, the first sitting's for a make-up, the row's own on update (design D4); verify in `test/exam-offline.test.js` that a 160-minute plan of a 100-minute test is stored, started at 10:57 runs to 13:37, a make-up without `durationMinutes` gets the first sitting's, and 0/601 are refused
- [ ] 2.2 Stop `updateOfflineTest` from rewriting planned sittings' duration; verify in `test/exam-offline.test.js` that changing a test from 100 to 90 minutes leaves a planned 160-minute sitting at 160

## 3. Client: the offline sitting form

- [ ] 3.1 Rebuild `drawOfflineForm` in `exam/client/tests.js` on one plan state `{ opensAt, durationMinutes }` with a lessons editor (date, start lesson, minutes, end lesson, duration) and a clock editor (date, start, end, duration), the switch between them, and the live summary (design D3); verify by the browser check of 3.3
- [ ] 3.2 Recompute the duration on a change of start lesson, minutes or end lesson, move the end lesson along with a later start lesson, keep a typed duration, propose the test's duration (first sitting) or the first sitting's (make-up), and list earlier sittings' durations on the make-up form; verify by the browser check of 3.3
- [ ] 3.3 Browser checks in the offline section of the harness: lessons 4–6 gives 160, minutes 5 gives 155, typing 20 in lesson 2 keeps 20, clock 11:00–13:35 gives 155 and a later start keeps the end, typing a duration moves the end, switching carries the plan over both ways, an end before the start and minutes past the lesson do not submit, the make-up form proposes and shows the first sitting's duration; run only those checks
- [ ] 3.4 Add the i18n keys (planned label, end lesson, end time, duration, earlier durations) to both language files in BabelEdit format; verify `test/i18n-catalog.test.js` passes

## 4. Client: showing a planned sitting

- [ ] 4.1 Add `displayPlan(sitting, periods)` (design D5) and use it for planned offline sittings in the test's sittings, the course's list of tests and the attendance page; verify with browser checks for `Mo. 30.11. · 4.–6. EH · geplant 10:55–13:35 · 160 Min`, `Mo. 30.11. · 2. EH · geplant 09:00–09:20 · 20 Min` and a plan off the lessons, in German and English, with the lesson tooltip

## 5. Docs and full run

- [ ] 5.1 Update `docs-exam-module.md` (offline tests and The School's Periods: planning by start and end lesson or by start and end time, duration per sitting, make-up proposal); verify the corpus checks over the docs pass
- [ ] 5.2 Run the full `npm test` once at the end and fix only the checks that fail, rerunning just those
