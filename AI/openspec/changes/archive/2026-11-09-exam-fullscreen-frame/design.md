## Context

Two classes on `<html>` already mark exactly the pages that need the frame (see `exam-fullscreen-chrome` and `exam-preview-chrome`):

- `sl-writing`: a student's own attempt is open. It is served from the first byte on a reload during an attempt, and kept in step by the `sl-exam-writing` listener in `exam/client/exam-client.js`. It is set behind "Continue in full screen" too, and removed once the attempt is submitted.
- `sl-previewing`: a teacher's preview shows the test, behind its gate and while it is tried. It is removed when the preview ends.

The writing page always requests full screen on `document.documentElement` (`enterFullscreen` in `exam/client/attempt.js`), and the tests check `document.fullscreenElement === document.documentElement`. The handout page of an offline sitting never gets either class and never requests full screen.

## Goals / Non-Goals

**Goals:**
- The frame follows the full-screen state at every moment, with no code that could miss a `fullscreenchange`.

**Non-Goals:**
- Telling the server or the live view anything new. The live view already reports out-of-full-screen stretches.
- A frame for offline sittings, or a setting to switch it off.

## Decisions

### D1 — Pure CSS: `html:is(.sl-writing, .sl-previewing):fullscreen`

The frame hangs on the two existing classes and the `:fullscreen` pseudo-class of `<html>`, which the browser keeps in step with full screen itself. The gate, the result page, the preview's closing page and the handout are excluded without a rule of their own: either the class is missing or the page is not in full screen.

*Alternative:* a third class toggled by a `fullscreenchange` listener in `attempt.js`. That is more code, and it would have to be cleared again on every way out (submit, deadline, preview end, element removed). The browser already does that for `:fullscreen`.

### D2 — A fixed pseudo-element on `body` that takes no clicks

`body::after` with `position: fixed; inset: 0`, an 8px solid border in `#7c3aed` (the violet of the open Exams button), `pointer-events: none`, `box-sizing: border-box`, and the highest `z-index`. The colour is the same in both themes, like the Exams button. 8px is visible across a classroom and covers less than any margin of the writing page.

*Alternatives:* an `outline` or inset `box-shadow` on `<html>` or `body`. These are painted below positioned content such as the top bar and the full-screen bar, so parts of the frame would be hidden. A border on `body` would shift the layout when full screen is entered or left.

## Risks / Trade-offs

- [The frame overlays the outer 8px of the screen] → `pointer-events: none` keeps everything below it clickable. The writing page has margins wider than the frame, and the check clicks an answer and Submit while the frame is shown.
- [A browser without `:fullscreen` support] → no frame, nothing else breaks. All the browsers the school uses support it.
- [A future rule using `body::after`] → none exists today. The rule gets a comment naming the change.
