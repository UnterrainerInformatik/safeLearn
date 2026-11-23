Source: AI/open-proposals.md, entry **Nachtest: keine Auswahl, sondern alle, die noch nicht geschrieben haben** (decided with Gerald on 2026-11-23: both parts in one change; who has not written is worked out as things stand, not fixed when the make-up is planned; the teacher can still tick a student who has written, which means that student writes again and their first result no longer counts; an online student's first attempt goes only when their new attempt starts; a failed test is repeated by discarding it also after it is over, offline tests included; any teacher may do both, behind the two-click confirmation).

## Why

Today a make-up sitting is written by the students a teacher ticks in a list of the whole roster, including those who have already written. In practice a make-up is for everybody who has not written the test yet, so the ticking is busywork, and a student who joins the class later or is absent from the first make-up is easily forgotten. Separately, a test the whole class failed cannot be repeated: "Discard" exists only while the first sitting of an online test is open, so after the test is over, and for every offline test, its results stay.

## What Changes

- **A make-up has no selection.** Its participants are everybody on the course's roster who has not left and has not written the test yet: online, nobody with an attempt of the test; offline, nobody marked present in an earlier sitting that was started. **BREAKING** for `online-test` and `offline-test`: a make-up no longer takes a list of chosen students.
- **The participants are worked out as things stand until the make-up begins.** A student who joins the roster, or who misses an earlier make-up, is in it without the teacher doing anything. When an online make-up's start window opens, or an offline make-up is started, its participants are fixed. A make-up can still be planned before the first sitting, for example for a student known to be ill.
- **The form lists only who is not in it.** Instead of a checkbox per student, the form names the students who have already written and are therefore not participants. Each one can still be ticked to **write the test again** (a retake). Nothing else is chosen.
- **A retake replaces the first result once the student writes again.** Online, the student's first attempt is deleted, with its answers and its review, in the same step that starts their new attempt. Until then the first result counts, and if they never start, it stays. A retake cannot start while the first attempt is still running. Offline, the module takes no answers. The teacher enters the retake's result over the first one, and the group for the factor A:B is already the one from the latest sitting the student was present at.
- **"Never required" stays.** A participant of a make-up who does not come has no result (online) or stays absent (offline). The module never creates a make-up by itself.
- **A test can be discarded after it is over, and an offline test can be discarded too.** This is how a failed test is repeated: discard it, then plan it again. Discarding is still refused while a sitting other than the first one is open, and while an offline sitting is running. It deletes every sitting, every attempt, the notes on the column and the teachers' notes. For an offline test it also deletes the results entered in its column. The two-click confirmation names how many results go, and the server refuses the request if that number has changed. Any teacher may discard, as today. **BREAKING** for `exam-record-maintenance`: the requirement "An open test can be discarded" becomes "A test can be discarded".
- **Existing make-ups:** those that have opened or been started keep their participants. Those still ahead are worked out by the new rule from the moment the change is deployed, which replaces their chosen students.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `online-test`: a make-up's participants are everybody who has no attempt yet, plus the retakes the teacher ticked, worked out until its start window opens. A retake starts a new attempt and deletes the first one, an exception to "one attempt per student and test".
- `offline-test`: a make-up's participants are everybody not present in an earlier started sitting, plus the retakes, worked out until it is started. A retake's result is entered over the first one.
- `exam-record-maintenance`: discarding is no longer limited to an open first sitting of an online test. It also works after the test is over and for offline tests, where it deletes the entered results too.

## Impact

- `exam/migrations/022-makeup-retakes.sql`: a `retake` flag on `sitting_participant`.
- `exam/tests.js`: `createSitting`, `updateSitting`, `createOfflineSitting`, `updateOfflineSitting` take `retakes` instead of `participants` for a make-up; a new refresh of a make-up's participants, called wherever a make-up that is still ahead is read or changed; fixing them at opening and at `startSitting`; `discardTest` for over and offline tests, counting results.
- `exam/attempts.js`: starting a retake deletes the first attempt in the same transaction; it is refused while the first one runs.
- `exam/client/tests.js`: the make-up forms (online and offline) list who has written, with a retake checkbox each; the discard action on the test page after the test is over and for offline tests. The live view and the attendance table mark retakes.
- `exam/routes-tests.js`: request bodies of the sitting routes and of discard.
- `i18n/de.json`, `i18n/en.json` (BabelEdit format); tests in `test/exam-tests.test.js`, `test/exam-offline.test.js`, `test/exam.test.js` and `test/coverage-map.json`.
