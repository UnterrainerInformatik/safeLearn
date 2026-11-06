## Why

After the first online test, a class installed a browser extension that keeps the writing page "in focus": it overrides `document.visibilityState`, `document.hidden` and `document.hasFocus()` and swallows the `blur` and `visibilitychange` events before the page sees them. The focus log relies on exactly those signals, so it now reports "never left" for students who are in another tab. We need signals that this kind of extension does not silence, and we need the tampering itself to become visible to the teacher.

## What Changes

- The writing page checks, while an attempt is open, whether the browser's visibility and focus properties are still the browser's own. It compares them against untouched references taken from a fresh blank frame. A finding is reported to the server once per attempt and named property, and is kept with the attempt.
- The writing page sends a heartbeat every few seconds. Each beat carries the number of animation frames drawn since the previous beat and the page's visibility as read through the untouched reference. Browsers stop drawing frames for a hidden page and throttle its timers. So the server can tell, from the beats alone, which stretches the page was not visible, whatever the overridden properties claim.
- The server counts those stretches as **hidden by timing**, but only while the focus log says the student was on the page. A stretch the focus log already counts is never counted twice. It also notices when beats stop arriving altogether.
- The live view gets a separate **suspicious** signal beside the focus figures. It shows a manipulated browser (with the properties found), how often and how long the page was hidden by timing, and a missing heartbeat. The signal stays visible after the sitting.
- The live view's order uses the net time out of focus plus the time hidden by timing. A suppressed absence therefore no longer sorts a student to the bottom.
- The signals only flag, they never block. Neither of them changes a grade, ends an attempt or is shown to the student, and the view for the class does not carry them.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `online-test`: a new requirement for the suspicious signal (tamper check, heartbeat, hidden by timing, missing heartbeat). "Teachers follow a sitting live" changes so that the order counts the time hidden by timing, and the view lists the new signal.

## Impact

- `exam/client/attempt.js`: `watchFocus` gains the tamper check and the heartbeat; the beat knows whether the page's own listeners reported an absence during its span.
- `exam/attempts.js`: a new `recordBeat` beside `recordFocus`; `routes-attempts.js` gets `POST /exam/api/attempts/:id/beat`, guarded like the focus route.
- `exam/migrations/015-hidden-page-signals.sql`: new `attempt` columns for the tamper finding, the last beat and the hidden-by-timing count and sum.
- `exam/live.js` and `exam/client/live.js`: the snapshot and the view carry and show the signal; the order key changes.
- `i18n/en.json`, `i18n/de.json`: new `exam.live.*` keys (BabelEdit format).
- Tests in `test/exam-tests.test.js` (beat logic) and `test/exam.test.js` (route guard, harness with a simulated extension).
- `AI/architecture.md`: the exam module's description and the route table.
