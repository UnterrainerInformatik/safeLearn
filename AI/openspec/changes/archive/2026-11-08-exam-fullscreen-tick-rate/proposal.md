Source: AI/open-proposals.md — "Vollbild-Pflicht + Tickrate bei Online-Tests"

## Why

The signals from `exam-hidden-page-signals` see a hidden tab, but not a writing page that shares the screen with another window. They also see nothing between "drawn normally" and "hardly drawn at all". If every attempt is written in full screen, the teacher can check the room at a glance, and no other window can partly cover the page. A drop in the page's tick rate then means something, and it is worth showing as a figure rather than only as the yes/no of "hidden by timing".

## What Changes

- **BREAKING (for students):** an online test can only be started with the button **"Start the test in full screen"**. The button puts the page into full screen before the attempt starts. There is no other way into an attempt, and this applies to every sitting, with no setting to turn it off.
- At the start the student reads, roughly: "Please stay in full screen and do not switch tabs until you have finished and submitted, or it may look suspicious. Thank you." The teacher does not need to announce anything, because the button does the full screen itself.
- A resumed attempt (after a reload) shows the questions only after **"Continue in full screen"**. If the student leaves full screen during the attempt, a bar with **"Back to full screen"** appears. That bar never blocks the questions.
- Leaving full screen is recorded per attempt with a count and a time. It goes into the suspicious signal of the live view. A browser that refuses full screen is flagged as **full screen not available**, and the attempt still starts.
- The heartbeat also counts timer ticks beside the animation frames. The server keeps the page's tick rate as a share of the student's own baseline rate. Below the threshold the stretch counts as **Tickrate Down!**, with a count and a total time.
- The live view gets a **tick rate** column: the current share as a percentage, and when it is down, the red "Tickrate Down!" warning with count and duration. The row gets the amber stripe like for any other suspicious sign.
- The fixed order stays: first by status, then by one key within the status. The key becomes net time out of focus + time hidden by timing + time out of full screen + time with tick rate down. Each heartbeat span is counted in at most one of these.
- As before, nothing here changes a grade, ends or locks an attempt, or is shown to the student or on the view for the class.
- The threshold starts at half the student's own rate. Instead of measuring energy-saving modes first, the teacher watches it in class: the signal never touches a grade (design D6).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `online-test`: a new requirement for writing in full screen, and one for the tick rate. "Signs of a hidden page are flagged…" gains leaving full screen and "full screen not available". "Teachers follow a sitting live" gains the tick-rate column and the extended order key.

## Impact

- `exam/client/attempt.js`: the start button and the resume gate request full screen. `watchFocus` watches `fullscreenchange`, shows the "back to full screen" bar, counts timer ticks and sends the full-screen state with each beat.
- `exam/attempts.js`: `recordBeat` classifies each span (focus log, hidden, out of full screen, tick rate down, normal) and keeps the baseline. `startAttempt` takes whether full screen was granted.
- `exam/migrations/017-fullscreen-tick-rate.sql`: new `attempt` columns.
- `exam/live.js`, `exam/client/live.js`: snapshot fields, the new column, the order key, the amber stripe.
- `i18n/en.json`, `i18n/de.json`: new `exam.attempt.*` and `exam.live.*` keys (BabelEdit format).
- Tests: `test/exam-tests.test.js` (span classification, baseline), `test/exam.test.js` (harness: start in full screen, Esc, throttled frames).
- `docs-exam-module.md`, `AI/architecture.md`.
