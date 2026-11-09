Source: AI/open-proposals.md ("Violetter Rahmen während einer Online-Prüfung im Vollbild")

## Why

In the classroom, a teacher walking past cannot tell at a glance whether a student's screen shows a running online test, or whether it is still in full screen. Since `exam-fullscreen-chrome` the page hides its navigation while a test is written. A violet frame around the whole screen, shown only while the page is in full screen, makes both visible from a distance.

## What Changes

- While a student writes an online test and the page is in full screen, a violet frame runs around the whole screen.
- When the page leaves full screen (Esc, a switch of window), the frame disappears at once. It comes back with "Back to full screen". The teacher therefore sees from the frame alone whether full screen is active.
- The frame also appears in the teacher's preview of a test while that is in full screen.
- No frame elsewhere: not behind "Start the test in full screen" or "Continue in full screen" (the page is not yet in full screen there), not on the result page after submitting, not on the closing page of a preview, and not on the handout page of an offline test.
- The frame covers nothing that can be clicked and never blocks answering or submitting. It uses the violet the Exams button has while a test is open, in both themes.

Decided with Gerald on 2026-11-09: online tests only, only in full screen, and in the teacher's preview too.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `online-test`: a new requirement "A page writing in full screen is framed in violet".

## Impact

- `css/exam.css`: one rule that draws the frame while `<html>` carries `sl-writing` or `sl-previewing` and is the full-screen element.
- Tests: a check in `test/exam.test.js` beside the full-screen and chrome checks, and the "Writing in full screen" text in `test/coverage-map.json`.
- `docs-exam-module.md`: one sentence on the frame.
- No JavaScript, server, endpoint, i18n or migration change.
