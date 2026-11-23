## 1. Data

- [x] 1.1 `exam/migrations/022-makeup-retakes.sql`: `sitting_participant.retake INTEGER NOT NULL DEFAULT 0 CHECK (retake IN (0, 1))` (design D2). Verify the migration runs on a copy of a database with make-ups and that the closed-year triggers still refuse a write to a closed year's participant

## 2. Server: make-up participants

- [x] 2.1 `exam/tests.js`: `writtenOf(db, testId)` (online: has an attempt; offline: present in another started sitting) and `refreshMakeups(db, testId)` for make-ups still ahead, keeping retake rows of students who have still written and are on the roster (design D1). Verify with unit tests: two who did not start → exactly those two; a joiner; a second make-up after a missed first one; a make-up that has opened or started is not touched
- [x] 2.2 `exam/tests.js`: `createSitting`, `updateSitting`, `createOfflineSitting`, `updateOfflineSitting` take `retakes` for a make-up, refuse `participants` for a make-up (`makeupNoChoice`), refuse retakes not on the roster or not written, and end with `refreshMakeups` (design D2). Verify the scenarios "A retake", "A retake taken back" and "Choosing participants of a make-up"
- [x] 2.3 Call `refreshMakeups` in the remaining writes of design D1: attempt start in `exam/attempts.js`, `startSitting`, `setAttendance`, `rescheduleSitting`, `deleteSitting`, and the roster join/rejoin/leave in `exam/classes.js` (for every test of every course of the class). Verify per write that a make-up still ahead equals the computed set afterwards, including "Planned before the first sitting" and "Marked present after the make-up was planned"
- [x] 2.4 `exam/tests.js` `testSittings`/`getTest`: return `retakes` per sitting and `written` per test, and drop the offline `absent` proposal (design D2)
- [x] 2.5 `exam/db.js`: after migrating, run `refreshMakeups` once for every test with a make-up still ahead (design D2, Migration Plan). Verify with a unit test that a stored make-up ahead with a chosen student who has written loses that student at start-up, while an opened one keeps its rows

## 3. Server: retakes and discard

- [x] 3.1 `exam/attempts.js` `startAttempt`: a retake of an open make-up deletes their submitted earlier attempt and starts the new one in one transaction; the earlier one resumed while it runs (design D3, changed during apply); resume and `submittedByYou` unchanged otherwise (design D3). Verify every scenario of "One attempt per student and test, resumed on reload", including that the column shows no result between the start and the submission, and that the teachers' note stays
- [x] 3.2 `exam/tests.js` `discardTest`: online after the first sitting is over, offline once a sitting has been started; refused while a make-up is open, an offline sitting runs, nothing has opened or started, or in a closed year; offline also deletes the column's `manual_entry` rows; the confirmed count is attempts or entries (design D4). Verify every scenario of "A test can be discarded"
- [x] 3.3 `exam/routes-tests.js`: request bodies of the sitting routes (`retakes`) and the discard route for both kinds, announced as today. Verify that a student is refused and that the discard reaches the live stream

## 4. Client

- [x] 4.1 `exam/client/tests.js`: the online and offline make-up forms without a choice of participants, with the explanation and the "already written, write again" list of retake boxes from `written` (design D5). Verify in the browser check (6.1)
- [x] 4.2 `exam/client/tests.js`: sitting summaries mark retakes; the discard button on the test page whenever the server allows it, for offline tests too, with the armed label naming results (design D4)
- [x] 4.3 `exam/client/live.js` and the attendance table: a "Retake" marker on retake rows
- [x] 4.4 `i18n/de.json`, `i18n/en.json` (BabelEdit format, same keys): the make-up explanations (online and offline), the "already written" heading, the retake marker, `makeupNoChoice`, `retakeNotWritten`, the discard refusals for the new cases, the armed label with "results"; drop `makeupParticipants`, `discardOffline` and `discardNotOpen` if no longer used. Verify with `test/i18n-catalog.test.js`

## 5. Existing tests

- [x] 5.1 Update the unit tests that create make-ups with `participants`, expect discard to be refused after the end or for offline tests, or use the offline `absent` proposal (`test/exam.test.js`, `test/exam-tests.test.js`, `test/exam-offline.test.js`), so that each one asserts the new rule rather than being deleted

## 6. Verification

- [x] 6.1 Browser check in the existing exam checks (`test/checks/`, registered in `test/coverage-map.json`): plan an online make-up after a sitting where one demo student wrote and one did not, and see the form list only the one who wrote; tick them as a retake, start as that student and see the old result gone and the new attempt running; plan an offline make-up and see the absent student in its attendance table; discard an over online test and an offline test from the test page with the count in the armed label
- [x] 6.2 Run the affected unit tests and checks, fix what fails, then run the full `npm test` once

## 7. Docs and backlog

- [x] 7.1 `docs-exam-module.md`: make-ups for everybody who has not written, retakes, discarding after the end and for offline tests
- [x] 7.2 `AI/architecture.md`: `sitting_participant.retake`, `refreshMakeups` and its call sites, the extended `discardTest`
- [x] 7.3 `AI/open-proposals.md`: remove the entry "Nachtest: keine Auswahl, sondern alle, die noch nicht geschrieben haben"
