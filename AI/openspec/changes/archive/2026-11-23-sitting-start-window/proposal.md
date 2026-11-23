Source: AI/open-proposals.md, entry **Sitting: Startfenster + Dauer, geschlossen erst nach dem letzten Ablauf** (decided with Gerald on 2026-11-23: "Start in Einheit 4, Fenster ist 5 Min nach Beginn der Einheit für 10 Min, Dauer eines Versuchs ist 20 Min"; extending is split into two actions; offline sittings stay as they are; existing sittings are not converted).

## Why

Today a sitting of an online test has a window from/to. An attempt's duration has to be shorter than that window, and its deadline is the earlier of its start plus the duration and the window's end. So whoever starts late gets less time, and the teacher has to work out a window that leaves room for the attempt. Gerald wants to schedule a sitting the way he thinks about it: "starts in lesson 4, students may start from 5 minutes into the lesson for 10 minutes, and each attempt takes 20 minutes". Whoever starts within that time gets the full 20 minutes.

## What Changes

- **The window of an online sitting becomes a start window.** A student can start an attempt only while the start window is open. Every attempt then runs for the full duration from its own start: the deadline is the start plus the duration, never cut by the window. **BREAKING** for the deadline rule of `online-test`.
- **The rule "duration shorter than the window" goes.** A 10-minute start window with 20-minute attempts is valid.
- **A sitting is over only once the last attempt is over.** It stays open after its start window closes for as long as any attempt in it is still running, so at the latest until the start window's end plus the duration. Reviews, rescheduling and everything else that waits for "over" wait for that.
- **What a student sees:** an open test they have not started only while the start window is open; a test they started until they submit or reach their deadline, also after the start window has closed.
- **Scheduling form:** with periods configured, the teacher picks a date, **one period**, the **minutes after the period's start** the start window opens (default 5), the **length of the start window** in minutes, and the duration of an attempt. In clock times: a date, a **start time** and the **length**. The form shows the resulting start window and the latest possible end. The from/to range of periods goes away.
- **Display:** wherever a sitting's window is shown, it is shown as a start window, with its period when it opens inside one, such as `Di. 20.10. · 4. EH · Start 10:05–10:15`.
- **Live view and view for the class** additionally show when the time runs out for the last one: the start window's end plus the duration while the start window is open, and then the latest deadline of the attempts still running. The live view keeps each writing participant's remaining time.
- **Extending is split into two actions** in the live view: *extend the start window* by x minutes, while it is still open, and *extend the writing time* by x minutes for every attempt running at that moment. Ending a sitting now closes the start window and submits every running attempt, as before.
- **Make-up sittings** of an online test follow the same model.
- **Not changed:** offline sittings. They still open by the teacher's start button and share one window over the test's duration. Existing sittings are not converted; their stored window is read as a start window from now on.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `online-test`: a sitting has a start window and a duration; the deadline is the start plus the duration; a sitting is open until its last attempt is over; what a student sees and when; the live view and the view for the class show the start window and the latest end.
- `exam-record-maintenance`: the single "extend" becomes "extend the start window" and "extend the writing time"; ending, rescheduling and discarding follow the new meaning of open and over.
- `exam-attempt-review`: a sitting is over only once its last attempt is over, not when its window closes.
- `school-periods`: a sitting is scheduled by date, one period, an offset in minutes and the length of the start window (or a start time and a length in clock times); windows are displayed as start windows.
- `offline-test`: the wording that an offline sitting is extended "in the same way as a sitting of an online test" no longer holds; its behaviour stays the same.

## Impact

- `exam/tests.js`: `sittingState` and the checks in `sittingTimes`, `createSitting`, `updateSitting`, `endSitting`, `extendSitting` (split in two), `rescheduleSitting`, `discardTest`; the state of a sitting has to know whether an attempt is still running.
- `exam/attempts.js`: the deadline of a new attempt; the open-tests query of the Exams page (a started attempt stays listed after the start window); starting vs. resuming; the review condition.
- `exam/live.js`: snapshot fields for the start window and the latest end; `exam/routes-tests.js`: the two extend routes.
- `exam/client/periods.js`, `exam/client/tests.js`: the sitting form (period + offset + length, clock time + length), `displayWindow`, the reschedule proposal.
- `exam/client/live.js` and the view for the class: the two extend actions, the start window and the latest end.
- `i18n/de.json`, `i18n/en.json`; tests in `test/exam*.test.js` and `test/coverage-map.json`.
- No migration: `sitting.opens_at`/`closes_at` keep their columns and become the start window; nothing stored needs converting.
