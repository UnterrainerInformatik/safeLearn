## 1. Server: state and deadline

- [x] 1.1 `exam/tests.js`: `sittingState` takes `runningUntil` (design D2); add `runningUntil(db, sittingId, at)` and route every database-backed state through `rowState`, including `testSittings`, `getSitting`, `discardTest` and `rescheduleSitting`. Offline sittings ignore it. Add `startOpen` and `endsAt` to the sitting JSON. Verify with unit tests in `test/exam-tests.test.js`: open after the start window while an attempt runs, over at the start window's end when everybody submitted early or nobody started, `endsAt` during and after the start window and after a writing-time extension
- [x] 1.2 `exam/tests.js` `sittingTimes`: drop the "duration shorter than the window" check, keep the others, cap the start window at 600 minutes (design D1). Verify that a 10-minute start window with 20-minute attempts is accepted and that opens ≥ closes is still refused
- [x] 1.3 `exam/attempts.js` `startAttempt`: resume an existing attempt first, create one only while a sitting of the student's is in its start window, deadline = start + duration with no clamp (design D1, D3). Verify: started at 10:14 with the start window closing 10:15 has deadline 10:34; a resume at 10:20 works; a first start at 10:16 is refused
- [x] 1.4 `exam/attempts.js` `openTestsOf`: list an online test while its start window is open or the student has a running attempt in it, with the attempt's deadline as its time (design D3). Verify the entry stays after the start window closes for a started student and disappears for an unstarted one
- [x] 1.5 `exam/attempts.js`: replace the `closes_at <= ?` in `reviewOpenCondition` and `reviewOpen` by the shared over-condition (design D2). Verify the scenario "A classmate is still writing" (refused at 10:25, answered at 10:35) and that the question image follows the review

## 2. Server: ending and extending

- [x] 2.1 `exam/tests.js` `endSitting`: `closes_at = min(closes_at, at)`, every running deadline to `at`, finalize (design D4). Verify that ending after the start window keeps the start window and submits the running attempt
- [x] 2.2 `exam/tests.js`: add `extendStartWindow` (5–120 min, only while the start window is open) and `extendWritingTime` (1–120 min, only while an attempt runs, every running deadline + minutes); restrict `extendSitting` to offline sittings (design D4). Verify every scenario of "A running sitting can be ended or extended", including that a later starter gets no added writing time and that both are refused once the sitting is over
- [x] 2.3 `exam/routes-tests.js`: `POST /api/sittings/:id/extend-start` and `/extend-writing`, both through `announcedLive`, teacher-only like `/extend`. Verify a student is refused and the live stream announces the change
- [x] 2.4 `exam/live.js`: the snapshot carries `startOpen` and `endsAt`, and the class screen's payload carries them without names. Verify with a unit test that `endsAt` follows a submission of the last running attempt

## 3. Client: form and display

- [x] 3.1 `exam/client/periods.js`: `startWindowFor` and `matchStart` (design D5). Verify in `test/exam-periods.test.js`: period 4 (10:55–11:45) + 5 min + 10 min gives 11:00–11:10; 10:00–11:45 reads as period 3, 0 min, 105 min; 07:58 matches no period; across midnight matches none; a DST changeover date
- [x] 3.2 `exam/client/tests.js`: the online sitting form with date, period, minutes after start (0 to period length − 1, default 5), start window length (default 10) and duration; the clock editor with date, start time and length; the switch between them carrying the start window over; the live line with start window and latest end (design D5). The offline form stays. Verify in the browser check (5.1)
- [x] 3.3 `exam/client/tests.js`: the reschedule proposal from `matchStart` onto the next weekday, or the clock start and length (design D5)
- [x] 3.4 `exam/client/tests.js`: `displayStartWindow` and its use in the list of tests and the sittings of a test; offline keeps `displayWindow` (design D6)
- [x] 3.5 `exam/client/live.js` and the view for the class: show the start window and "time runs out at the latest …" from `endsAt`, the over state; the live view offers "Extend start window" while `startOpen` and "Extend writing time" while anyone writes, and the offline page keeps its single Extend (design D4, D6)
- [x] 3.6 `i18n/de.json`, `i18n/en.json`: the start label, the latest-end line, the form fields, both extend actions and their refusals; drop keys that only the removed from/to period choice used. Verify with `test/i18n-catalog.test.js`

## 4. Existing tests

- [x] 4.1 Update the unit tests that assumed the clamped deadline, the duration-versus-window refusal, the single online extend and `closes_at` as "over" (`test/exam.test.js`, `test/exam-tests.test.js`, `test/exam-offline.test.js`, `test/exam-test-timing.test.js`), so that each one asserts the new rule rather than being deleted

## 5. Verification

- [x] 5.1 Browser check in the existing exam check (`test/checks/`, registered in `test/coverage-map.json`): schedule period 4 + 5 min + 10 min with 20-minute attempts and see 11:00–11:10 and the latest end in the form; the list of tests, the test page, the live view and the class screen show `… · 4. EH · Start 11:00–11:10`; a started student keeps writing after the start window closes while an unstarted one no longer sees the test; the two extend buttons appear and disappear with their conditions; an older sitting from 10:00 to 11:45 opens as period 3, 0 min, 105 min; offline sittings look and extend as before. Update the coverage map's description of the periods part
- [x] 5.2 Run the affected unit tests and checks, fix what fails, then run the full `npm test` once

## 6. Docs

- [x] 6.1 `docs-exam-module.md`: rewrite the periods table row and the sitting description for the start window, the latest end, the two extensions and that offline is unchanged
- [x] 6.2 `AI/architecture.md`: the meaning of `opens_at`/`closes_at` for online sittings, `runningUntil`/`endsAt`, the two new routes
